import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { defaultJobs, jobsSnapshot, resetJobScheduler, schedulerEnabled, startJobScheduler, type JobDef } from "./scheduler";

// The loop, with the clock, the lock and the jobs all injected: what gets
// scheduled, what a tick does, and what the snapshot says afterwards.

const ORIGINAL = { sched: process.env.JOBS_SCHEDULER, stage: process.env.DEPLOY_STAGE };
afterEach(() => {
  resetJobScheduler();
  if (ORIGINAL.sched === undefined) delete process.env.JOBS_SCHEDULER;
  else process.env.JOBS_SCHEDULER = ORIGINAL.sched;
  if (ORIGINAL.stage === undefined) delete process.env.DEPLOY_STAGE;
  else process.env.DEPLOY_STAGE = ORIGINAL.stage;
});

/** A manual clock: timers are collected and fired by the test. */
function fakeTimers() {
  const pending: Array<{ fn: () => void; ms: number }> = [];
  return {
    pending,
    setTimer: (fn: () => void, ms: number) => {
      pending.push({ fn, ms });
      return { id: pending.length } as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => {},
    async fireNext(): Promise<void> {
      const t = pending.shift();
      if (!t) throw new Error("no pending timer");
      t.fn();
      await new Promise((r) => setImmediate(r));
    },
  };
}

function job(name: string, run: () => Promise<unknown>, everyMs = 60_000): JobDef {
  return { name, everyMs, run };
}

test("stage decides: deployed on by default, dev off by default, JOBS_SCHEDULER overrides both ways", () => {
  process.env.DEPLOY_STAGE = "production";
  delete process.env.JOBS_SCHEDULER;
  assert.equal(schedulerEnabled().enabled, true);
  process.env.JOBS_SCHEDULER = "off";
  assert.equal(schedulerEnabled().enabled, false);
  process.env.DEPLOY_STAGE = "dev";
  delete process.env.JOBS_SCHEDULER;
  assert.equal(schedulerEnabled().enabled, false);
  process.env.JOBS_SCHEDULER = "on";
  assert.equal(schedulerEnabled().enabled, true);
});

test("the default jobs are the sweep, the flush, and strategy snapshots, with sane periods and a floor on overrides", () => {
  const jobs = defaultJobs({});
  assert.deepEqual(jobs.map((j) => j.name), ["commitment-sweep", "usage-flush", "strategy-snapshots"]);
  assert.equal(jobs[0].everyMs, 15 * 60_000);
  assert.equal(jobs[1].everyMs, 5 * 60_000);
  assert.equal(jobs[2].everyMs, 60 * 60_000);
  assert.equal(defaultJobs({ JOBS_INTERVAL_FLUSH_MS: "1000" })[1].everyMs, 5 * 60_000, "below the floor -> default");
  assert.equal(defaultJobs({ JOBS_INTERVAL_FLUSH_MS: "20000" })[1].everyMs, 20_000);
});

test("off: nothing is scheduled and the snapshot says why", () => {
  process.env.JOBS_SCHEDULER = "off";
  const t = fakeTimers();
  const snap = startJobScheduler({ jobs: [job("a", async () => 1)], setTimer: t.setTimer, clearTimer: t.clearTimer, log: () => {} });
  assert.equal(snap.enabled, false);
  assert.equal(t.pending.length, 0);
  assert.equal(jobsSnapshot().reason, "JOBS_SCHEDULER=off");
});

test("on: each job is scheduled once, staggered; a tick runs it, records the ledger and reschedules", async () => {
  process.env.JOBS_SCHEDULER = "on";
  const t = fakeTimers();
  const ran: string[] = [];
  startJobScheduler({
    jobs: [job("sweep", async () => { ran.push("sweep"); return { processed: 3 }; }), job("flush", async () => { ran.push("flush"); return { flushed: 1 }; })],
    lock: async () => "acquired",
    setTimer: t.setTimer, clearTimer: t.clearTimer, now: () => 1_000, initialDelayMs: 100, staggerMs: 10, log: () => {},
  });
  assert.deepEqual(t.pending.map((p) => p.ms), [100, 110]);
  await t.fireNext();
  assert.deepEqual(ran, ["sweep"]);
  const s = jobsSnapshot().jobs[0];
  assert.equal(s.runs, 1);
  assert.deepEqual(s.last?.summary, { processed: 3 });
  assert.equal(s.last?.ok, true);
  assert.equal(t.pending.at(-1)?.ms, 60_000, "rescheduled for the next period");
});

test("a held lock skips the period and reschedules; the job never runs", async () => {
  process.env.JOBS_SCHEDULER = "on";
  const t = fakeTimers();
  let ran = 0;
  startJobScheduler({ jobs: [job("sweep", async () => { ran += 1; })], lock: async () => "held", setTimer: t.setTimer, clearTimer: t.clearTimer, initialDelayMs: 1, staggerMs: 0, log: () => {} });
  await t.fireNext();
  assert.equal(ran, 0);
  assert.equal(jobsSnapshot().jobs[0].skippedLocked, 1);
  assert.equal(t.pending.length, 1, "rescheduled");
});

test("a job that throws is a recorded failure, not a crash, and is rescheduled", async () => {
  process.env.JOBS_SCHEDULER = "on";
  const t = fakeTimers();
  const logged: string[] = [];
  startJobScheduler({ jobs: [job("sweep", async () => { throw new Error("db down"); })], lock: async () => "unlocked", setTimer: t.setTimer, clearTimer: t.clearTimer, initialDelayMs: 1, staggerMs: 0, log: (m) => logged.push(m) });
  await t.fireNext();
  const s = jobsSnapshot().jobs[0];
  assert.equal(s.failures, 1);
  assert.equal(s.last?.ok, false);
  assert.equal(s.last?.summary, "db down");
  assert.ok(logged.some((m) => m.includes("FAILED")));
  assert.equal(t.pending.length, 1, "rescheduled after the failure");
});

test("the lock's TTL is just under the period, so one run per period across replicas", async () => {
  process.env.JOBS_SCHEDULER = "on";
  const t = fakeTimers();
  const ttls: number[] = [];
  startJobScheduler({ jobs: [job("sweep", async () => 1, 100_000)], lock: async (_n, ttl) => { ttls.push(ttl); return "acquired"; }, setTimer: t.setTimer, clearTimer: t.clearTimer, initialDelayMs: 1, staggerMs: 0, log: () => {} });
  await t.fireNext();
  assert.deepEqual(ttls, [90_000]);
});

test("start is idempotent: a second call schedules nothing more", () => {
  process.env.JOBS_SCHEDULER = "on";
  const t = fakeTimers();
  startJobScheduler({ jobs: [job("a", async () => 1)], setTimer: t.setTimer, clearTimer: t.clearTimer, log: () => {} });
  startJobScheduler({ jobs: [job("b", async () => 1)], setTimer: t.setTimer, clearTimer: t.clearTimer, log: () => {} });
  assert.equal(t.pending.length, 1);
  assert.deepEqual(jobsSnapshot().jobs.map((j) => j.name), ["a"]);
});
