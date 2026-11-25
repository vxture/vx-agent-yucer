import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import { isDeployedStage } from "../../lib/deploy-stage";
import { businessDate, dailyJudgementBaseline } from "./daily-baseline";
import { topicFeed, type TopicFeed } from "./topic-feed";
import type { JudgementContext } from "./service";
import { readJudgementRevision } from "./feed-revision";
import type { Scope } from "./lib/judgement";
import { getAccountStore, getCopilotStore, getPipelineStore, getPlanningStore } from "../shared/registry";
import { listAccounts } from "../account/service";
import { listPipeline } from "../pipeline/service";
import { listTargets } from "../planning/service";
import { ok, type RuleResult } from "../shared/result";

type Owner = JudgementContext & { accessVersion: string };
export interface DailyFeedInfo {
  date: string; generatedAt: string; revalidatedAt: string; changes: number;
  nextScheduledAt: string; reused: boolean;
}
export interface ScheduledFeed {
  raw: TopicFeed; visible: TopicFeed; daily: DailyFeedInfo; dataVersion: string | null; pendingUpdate: boolean;
}
interface Snapshot {
  version: "judgement-feed/1"; dataVersion: string; checkedAt: string;
  raw: TopicFeed; daily: Omit<DailyFeedInfo, "reused">;
  accessObjects: { accounts: string[]; opportunities: string[]; targets: string[] };
}
export interface FeedSnapshotStore {
  read(key: string): Promise<Snapshot | null>;
  write(key: string, value: Snapshot): Promise<void>;
  acquire?(key: string): Promise<{ publish(value: Snapshot): Promise<void>; release(): Promise<void> } | null>;
}
let redis: Redis | null = null;
const memory = new Map<string, Snapshot>();
const persistence: FeedSnapshotStore = {
  async read(key) {
    if (process.env.REDIS_URL) {
      redis ??= new Redis(process.env.REDIS_URL, { protocol: 2, maxRetriesPerRequest: 1, connectTimeout: 2000 });
      const text = await redis.get(key);
      if (!text) return null;
      const value = JSON.parse(text) as Snapshot;
      if (value.version !== "judgement-feed/1") return null;
      return value;
    }
    if (isDeployedStage()) throw Error("judgement_snapshot_unavailable");
    return memory.get(key) ?? null;
  },
  async write(key, value) {
    if (process.env.REDIS_URL) {
      redis ??= new Redis(process.env.REDIS_URL, { protocol: 2, maxRetriesPerRequest: 1, connectTimeout: 2000 });
      await redis.set(key, JSON.stringify(value), "EX", 3 * 86400);
      return;
    }
    if (isDeployedStage()) throw Error("judgement_snapshot_unavailable");
    if (memory.size > 1000) memory.clear();
    memory.set(key, value);
  },
  async acquire(key) {
    if (!process.env.REDIS_URL) {
      if (isDeployedStage()) throw Error("judgement_snapshot_unavailable");
      return { publish: (value) => persistence.write(key, value), release: async () => {} };
    }
    redis ??= new Redis(process.env.REDIS_URL, { protocol: 2, maxRetriesPerRequest: 1, connectTimeout: 2000 });
    const lockKey = key + ":generation", token = randomUUID();
    if (await redis.set(lockKey, token, "PX", 60000, "NX") !== "OK") return null;
    return {
      async publish(value) {
        const written = await redis!.eval("if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end; redis.call('SET', KEYS[2], ARGV[2], 'EX', 259200); return 1", 2, lockKey, key, token, JSON.stringify(value));
        if (written !== 1) throw Error("judgement_generation_expired");
      },
      async release() {
        await redis!.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0", 1, lockKey, token);
      },
    };
  },
};

// Existing business time is Asia/Shanghai. Before 08:00 retain the preceding
// report's identity; the next scheduled run advances date-based rules at 08:00.
export const judgementReportDate = (now: Date) => businessDate(new Date(now.getTime() - 8 * 3600000));
export function nextJudgementAt(now: Date) {
  const day = businessDate(now);
  const eight = new Date(day + "T08:00:00+08:00");
  return new Date(eight.getTime() + (now >= eight ? 86400000 : 0)).toISOString();
}
export const judgementScheduleDue = (now: Date) => now.getTime() >= new Date(businessDate(now) + "T08:00:00+08:00").getTime();
const keyFor = (owner: Owner, scope: Scope | undefined, now: Date) => "yucer:judgement-feed:1:" + createHash("sha256")
  .update(JSON.stringify([owner.workspaceId, owner.sub, owner.accessVersion, scope ?? "auto", judgementReportDate(now)])).digest("hex");
export interface ScheduledFeedDeps {
  revision: (workspaceId: string) => Promise<string | null>;
  feed: typeof topicFeed;
  baseline: typeof dailyJudgementBaseline;
  snapshots: FeedSnapshotStore;
  inventory: (owner: Owner, scope: Scope) => Promise<Snapshot["accessObjects"]>;
  snoozes: (workspaceId: string, sub: string, now: Date) => ReturnType<ReturnType<typeof getCopilotStore>["listSnoozes"]>;
}
const defaults: ScheduledFeedDeps = {
  revision: readJudgementRevision, feed: topicFeed, baseline: dailyJudgementBaseline, snapshots: persistence,
  inventory: async (owner, scope) => {
    const [accounts, deals, targets] = await Promise.all([
      listAccounts({ ...owner, store: owner.stores?.account() ?? getAccountStore() }),
      listPipeline({ ...owner, store: owner.stores?.pipeline() ?? getPipelineStore() }, { includeClosed: true }),
      listTargets({ ...owner, store: getPlanningStore() }),
    ]);
    if (!accounts.ok) throw Error("topic_feed_unavailable");
    const ids = accounts.value.filter(a => scope === "all" || a.ownerSub === owner.sub).map(a => a.id);
    return { accounts: ids, opportunities: deals.ok ? deals.value.filter(d => ids.includes(d.accountId)).map(d => d.id) : [],
      targets: targets.ok ? targets.value.filter(t => scope === "mine" || owner.allowWorkspaceMetrics === false ? t.scopeType === "owner" && t.ownerSub === owner.sub : t.scopeType === "workspace").map(t => t.id) : [] };
  },
  snoozes: (workspaceId, sub, now) => getCopilotStore().listSnoozes(workspaceId, sub, now),
};
const inFlight = new Map<string, Promise<Snapshot>>();

/** Snapshot text is returned only after a fresh revision check. Unknown source
 * state fails closed; an old cached answer is never used as an error fallback.
 * This service contains no Atlas/Runos call and never writes business records. */
export async function scheduledJudgementFeed(owner: Owner, scope?: Scope, now = new Date(), deps: ScheduledFeedDeps = defaults, mode: "current" | "snapshot" = "current"): Promise<RuleResult<ScheduledFeed>> {
  if (scope === undefined) {
    const accounts = await listAccounts({ ...owner, store: owner.stores?.account() ?? getAccountStore() });
    if (!accounts.ok) throw Error("topic_feed_unavailable");
    scope = accounts.value.some(account => account.ownerSub === owner.sub) ? "mine" : "all";
  }
  const key = keyFor(owner, scope, now), revision = await deps.revision(owner.workspaceId);
  let snapshot = revision === null ? null : await deps.snapshots.read(key), reused = false, pendingUpdate = false;
  if (!snapshot && revision !== null && mode === "snapshot") snapshot = await deps.snapshots.read(keyFor(owner, scope, new Date(now.getTime() - 86400000)));
  if (snapshot && mode === "snapshot") {
    reused = true;
    pendingUpdate = snapshot.dataVersion !== revision || snapshot.daily.date !== judgementReportDate(now);
    if (pendingUpdate) {
      // A prior report may be shown while its replacement is computed, but
      // never for a deleted, reassigned or newly unreadable object. Content is
      // explicitly marked as a previous result, not a current business fact.
      const inventory = await deps.inventory(owner, scope);
      const accountIds = new Set(inventory.accounts), dealIds = new Set(inventory.opportunities), targetIds = new Set(inventory.targets);
      const withdrawn = !snapshot.accessObjects || (Object.keys(inventory) as (keyof typeof inventory)[]).some(kind => snapshot!.accessObjects[kind].some(id => !inventory[kind].includes(id)));
      snapshot = { ...snapshot, raw: { ...snapshot.raw, scanned: accountIds.size,
        dataAvailable: accountIds.size > 0 || targetIds.size > 0, judgements: withdrawn ? [] : snapshot.raw.judgements.filter(j =>
        j.subjectType === "account" ? accountIds.has(j.subjectId) : j.subjectType === "opportunity" ? dealIds.has(j.subjectId) :
          j.id.startsWith("target-") ? targetIds.has(j.subjectId) : owner.allowWorkspaceMetrics !== false) } };
    }
  } else if (snapshot && snapshot.dataVersion === revision) {
    reused = true;
  } else {
    const pendingKey = key + ":" + (revision ?? "uncached");
    let pending = revision === null ? undefined : inFlight.get(pendingKey);
    if (!pending) {
      pending = (async () => {
        let lease = revision !== null && deps.snapshots.acquire ? await deps.snapshots.acquire(key) : undefined;
        if (lease === null) {
          // Another replica owns generation. Wait for its complete result;
          // neither duplicate work nor publish a partially built report.
          for (let attempt = 0; attempt < 150; attempt++) {
            const ready = await deps.snapshots.read(key);
            if (ready?.dataVersion === revision && ready.daily.date === judgementReportDate(now)) { reused = true; return ready; }
            lease = await deps.snapshots.acquire!(key);
            if (lease) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (!lease) throw Error("judgement_generation_busy");
        }
        try {
        // A replica may have published between our first read and this lease.
        const ready = revision !== null ? await deps.snapshots.read(key) : null;
        if (ready?.dataVersion === revision && ready.daily.date === judgementReportDate(now)) { reused = true; return ready; }
        const result = await deps.feed(owner, { scope, includeSnoozed: true, now });
        if (!result.ok) throw Error("topic_feed_unavailable");
        const baseline = await deps.baseline(owner, result.value, now, undefined, judgementReportDate(now));
        const value: Snapshot = { version: "judgement-feed/1", dataVersion: revision ?? "", checkedAt: now.toISOString(), accessObjects: await deps.inventory(owner, scope),
          raw: { ...result.value, judgements: baseline.judgements }, daily: {
            date: judgementReportDate(now), generatedAt: baseline.generatedAt,
            revalidatedAt: now.toISOString(), changes: baseline.changes, nextScheduledAt: nextJudgementAt(now),
          } };
        if (revision !== await deps.revision(owner.workspaceId)) throw Error("judgement_data_changed");
        if (revision !== null) {
          if (lease) await lease.publish(value);
          else await deps.snapshots.write(key, value);
        }
        return value;
        } finally { await lease?.release(); }
      })();
      if (revision !== null) inFlight.set(pendingKey, pending);
    } else reused = true;
    try { snapshot = await pending; } finally { if (inFlight.get(pendingKey) === pending) inFlight.delete(pendingKey); }
  }
  if (revision !== await deps.revision(owner.workspaceId)) throw Error("judgement_data_changed");
  const snoozes = await deps.snoozes(owner.workspaceId, owner.sub, now), rank = { today: 0, week: 1, watch: 2 };
  const visible = snapshot.raw.judgements.filter(j => {
    const old = snoozes.find(row => row.judgementId === j.id);
    return !old || rank[j.urgency] < rank[old.urgency as keyof typeof rank];
  });
  return ok({ raw: snapshot.raw, visible: { ...snapshot.raw, judgements: visible },
    daily: { ...snapshot.daily, nextScheduledAt: nextJudgementAt(now), reused }, dataVersion: revision, pendingUpdate });
}
