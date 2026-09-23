import { deployStage, isDeployedStage } from "../lib/deploy-stage";
import { runCommitmentSweep } from "../domains/account/commitment-sweep";
import { runStrategySnapshots } from "../domains/strategy/snapshot-job";
import { runUpsellSweep } from "../domains/delivery/upsell-sweep";
import { flushUsage } from "../usage/lib/flush";
import { listActiveWorkspaces } from "./workspaces";
import { acquireJobLock, type LockOutcome } from "./lock";

// The in-app job scheduler (ADR-033, owner 2026-09-14: the product's own
// container provides its clock). ADR-010 put the clock OUTSIDE the product -
// an external timer calling the internal-token routes - and nothing ever
// called them: production ran four days with the sweep never executed. The
// routes stay as manual triggers; this loop is what runs them by default.
//
//   commitment-sweep  every 15 min  overdue commitments -> missed, expired
//                                   judgements -> stale, aged proposals expire
//   usage-flush       every 5 min   buffered yucer.copilot.turns -> /usage/consume
//
// arda sync is NOT here: it needs a (workspace, tenant) list this repo cannot
// enumerate yet (app_instance.tenant_id is filled by webhook deliveries that
// have not started); it stays a manual route until that source exists.
//
// State lives on globalThis (see domains/shared/registry.ts for why): the
// instrumentation hook that starts the loop and the status route that reports
// it are separate module graphs, and a module-level singleton would give each
// its own copy - the status page would report "not started" forever.
//
// Enabled by stage: on for production/beta unless JOBS_SCHEDULER=off, off in
// dev unless JOBS_SCHEDULER=on. Each job runs at most once per period across
// replicas (jobs/lock.ts). A job that throws is recorded as a failure and
// rescheduled; the loop never takes the server down.

export interface JobDef {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

export interface JobRun {
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  summary: unknown;
}

export interface JobStatus {
  name: string;
  everyMs: number;
  last: JobRun | null;
  runs: number;
  failures: number;
  skippedLocked: number;
}

export interface JobsSnapshot {
  enabled: boolean;
  started: boolean;
  reason: string;
  jobs: JobStatus[];
}

interface JobState extends JobStatus {
  def: JobDef;
  timer: ReturnType<typeof setTimeout> | null;
}

interface SchedulerState {
  started: boolean;
  enabled: boolean;
  reason: string;
  jobs: JobState[];
}

const SLOT = Symbol.for("yucer.jobs.scheduler");

function state(): SchedulerState {
  const g = globalThis as unknown as Record<symbol, SchedulerState | undefined>;
  if (!g[SLOT]) g[SLOT] = { started: false, enabled: false, reason: "not started", jobs: [] };
  return g[SLOT];
}

export function schedulerEnabled(env: Record<string, string | undefined> = process.env): { enabled: boolean; reason: string } {
  if (env.JOBS_SCHEDULER === "on") return { enabled: true, reason: "JOBS_SCHEDULER=on" };
  if (env.JOBS_SCHEDULER === "off") return { enabled: false, reason: "JOBS_SCHEDULER=off" };
  return isDeployedStage()
    ? { enabled: true, reason: `deployed stage '${deployStage()}'` }
    : { enabled: false, reason: "dev stage - set JOBS_SCHEDULER=on to run the jobs locally" };
}

const MIN_INTERVAL_MS = 10_000;

function intervalFrom(env: Record<string, string | undefined>, key: string, fallbackMs: number): number {
  const v = Number(env[key]);
  return Number.isFinite(v) && v >= MIN_INTERVAL_MS ? v : fallbackMs;
}

export function defaultJobs(env: Record<string, string | undefined> = process.env): JobDef[] {
  return [
    {
      name: "commitment-sweep",
      everyMs: intervalFrom(env, "JOBS_INTERVAL_SWEEP_MS", 15 * 60_000),
      run: async () => runCommitmentSweep({ workspaces: (await listActiveWorkspaces()).map((workspaceId) => ({ workspaceId })) }),
    },
    {
      name: "usage-flush",
      everyMs: intervalFrom(env, "JOBS_INTERVAL_FLUSH_MS", 5 * 60_000),
      run: () => flushUsage(),
    },
    {
      name: "strategy-snapshots",
      everyMs: intervalFrom(env, "JOBS_INTERVAL_SNAPSHOT_MS", 60 * 60_000),
      run: async () => runStrategySnapshots({ workspaces: (await listActiveWorkspaces()).map((workspaceId) => ({ workspaceId })) }),
    },
    // L4 batch six (owner, 2026-09-22: 定时任务). Daily: ownership moves
    // at contract speed, and a proposal a person rejected stays quiet for 90
    // days regardless of how often this runs.
    {
      name: "upsell-sweep",
      everyMs: intervalFrom(env, "JOBS_INTERVAL_UPSELL_MS", 24 * 60 * 60_000),
      run: async () => runUpsellSweep({ workspaces: (await listActiveWorkspaces()).map((workspaceId) => ({ workspaceId })) }),
    },
  ];
}

export interface SchedulerDeps {
  jobs?: JobDef[];
  lock?: (name: string, ttlMs: number) => Promise<LockOutcome>;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
  now?: () => number;
  /** First run of job i happens after initialDelayMs + i * staggerMs. */
  initialDelayMs?: number;
  staggerMs?: number;
  log?: (message: string) => void;
}

function defaultSetTimer(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
  const t = setTimeout(fn, ms);
  // A pending job must never keep the process alive on shutdown.
  (t as { unref?: () => void }).unref?.();
  return t;
}

let activeDeps: Required<Pick<SchedulerDeps, "lock" | "setTimer" | "clearTimer" | "now" | "log">> = {
  lock: acquireJobLock,
  setTimer: defaultSetTimer,
  clearTimer: (t) => clearTimeout(t),
  now: Date.now,
  log: (m) => console.info(m),
};

function schedule(job: JobState, ms: number): void {
  job.timer = activeDeps.setTimer(() => {
    void tick(job);
  }, ms);
}

export async function tick(job: JobState): Promise<void> {
  const d = activeDeps;
  let outcome: LockOutcome;
  try {
    outcome = await d.lock(job.name, Math.floor(job.everyMs * 0.9));
  } catch (e) {
    // A lock we cannot reach is a reason to skip this period, not to run twice.
    d.log(`[jobs] ${job.name}: lock unavailable (${e instanceof Error ? e.message : String(e)}), skipping this period`);
    job.skippedLocked += 1;
    schedule(job, job.everyMs);
    return;
  }
  if (outcome === "held") {
    job.skippedLocked += 1;
    schedule(job, job.everyMs);
    return;
  }
  const run: JobRun = { startedAt: new Date(d.now()).toISOString(), finishedAt: null, ok: null, summary: null };
  job.last = run;
  job.runs += 1;
  try {
    run.summary = await job.def.run();
    run.ok = true;
    d.log(`[jobs] ${job.name}: ${JSON.stringify(run.summary)}`);
  } catch (e) {
    run.ok = false;
    run.summary = e instanceof Error ? e.message : String(e);
    job.failures += 1;
    d.log(`[jobs] ${job.name} FAILED: ${run.summary}`);
  } finally {
    run.finishedAt = new Date(d.now()).toISOString();
    schedule(job, job.everyMs);
  }
}

/** Idempotent: the first call starts the loop, every later call returns the snapshot. */
export function startJobScheduler(deps: SchedulerDeps = {}): JobsSnapshot {
  const s = state();
  if (s.started) return jobsSnapshot();
  activeDeps = {
    lock: deps.lock ?? acquireJobLock,
    setTimer: deps.setTimer ?? defaultSetTimer,
    clearTimer: deps.clearTimer ?? ((t) => clearTimeout(t)),
    now: deps.now ?? Date.now,
    log: deps.log ?? ((m) => console.info(m)),
  };
  const { enabled, reason } = schedulerEnabled();
  s.started = true;
  s.enabled = enabled;
  s.reason = reason;
  s.jobs = (deps.jobs ?? defaultJobs()).map((def) => ({
    def,
    name: def.name,
    everyMs: def.everyMs,
    last: null,
    runs: 0,
    failures: 0,
    skippedLocked: 0,
    timer: null,
  }));
  if (enabled) {
    const initial = deps.initialDelayMs ?? 30_000;
    const stagger = deps.staggerMs ?? 10_000;
    s.jobs.forEach((job, i) => schedule(job, initial + i * stagger));
    activeDeps.log(`[jobs] scheduler on (${reason}): ${s.jobs.map((j) => `${j.name}/${j.everyMs}ms`).join(", ")}`);
  } else {
    activeDeps.log(`[jobs] scheduler off (${reason})`);
  }
  return jobsSnapshot();
}

export function jobsSnapshot(): JobsSnapshot {
  const s = state();
  return {
    enabled: s.enabled,
    started: s.started,
    reason: s.reason,
    jobs: s.jobs.map(({ name, everyMs, last, runs, failures, skippedLocked }) => ({ name, everyMs, last, runs, failures, skippedLocked })),
  };
}

/** Tests only: stop every timer and forget the state. */
export function resetJobScheduler(): void {
  const s = state();
  for (const job of s.jobs) if (job.timer) activeDeps.clearTimer(job.timer);
  s.started = false;
  s.enabled = false;
  s.reason = "not started";
  s.jobs = [];
}
