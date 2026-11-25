import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { scheduledJudgementFeed, judgementReportDate, nextJudgementAt, type ScheduledFeedDeps, type FeedSnapshotStore } from "./scheduled-feed";
import { dailyJudgementBaseline, type DailyBaseline } from "./daily-baseline";
import { ok, unwrap } from "../shared/result";
import type { TopicFeed } from "./topic-feed";
const now = new Date("2026-11-25T00:00:00Z");
const finding = (id: string, claim = id, urgency: "week" | "today" = "week") => ({ id, subjectType: "account" as const, subjectId: id, subjectName: id, claim, urgency, source: "rule" as const, facts: [], tags: [], citations: [], analyses: [] });
function fixture() {
  const owner = { workspaceId: "one", sub: "alice", accessVersion: "role-1", holder: { permissions: new Set<never>() }, entitlement: { ...EMPTY_ENTITLEMENT, product: "yucer", workspace_id: "one" } };
  let revision: string | null = "one", scans = 0;
  let feed: TopicFeed = { scope: "mine", scanned: 2, dataAvailable: true, judgements: [finding("a"), finding("b")] };
  let inventory = { accounts: ["a", "b"], opportunities: [] as string[], targets: [] as string[] };
  const snapshots = new Map<string, Parameters<FeedSnapshotStore["write"]>[1]>(), baselines = new Map<string, DailyBaseline>();
  const deps: ScheduledFeedDeps = {
    revision: async () => revision,
    snapshots: { read: async key => snapshots.get(key) ?? null, write: async (key, value) => { snapshots.set(key, value); } },
    inventory: async () => inventory,
    baseline: (actor, current, instant, _store, date) => dailyJudgementBaseline(actor, current, instant, { ensure: async (key, value) => { if (!baselines.has(key)) baselines.set(key, value); return baselines.get(key)!; } }, date),
    feed: async (_ctx, options) => { scans++; return ok({ ...feed, scope: options?.scope ?? "mine" }); },
    snoozes: async () => [],
  };
  const read = (date = now, mode: "current" | "snapshot" = "current") => scheduledJudgementFeed(owner, "mine", date, deps, mode).then(unwrap);
  return { owner, deps, read, scans: () => scans, snapshots, setRevision: (v: string | null) => { revision = v; }, setFeed: (v: TopicFeed) => { feed = v; }, setInventory: (v: typeof inventory) => { inventory = v; } };
}
test("opening and refreshing unchanged data reuse one ordered daily result without rerunning rules", async () => {
  const f = fixture(); const first = await f.read(), second = await f.read(new Date(now.getTime() + 3600000));
  assert.equal(f.scans(), 1); assert.equal(second.daily.reused, true); assert.equal(first.daily.generatedAt, second.daily.generatedAt);
  assert.deepEqual(second.visible.judgements.map(j => j.id), ["a", "b"]);
});
test("data changes update facts and promote urgency without disturbing stable peers", async () => {
  const f = fixture(); await f.read(); f.setRevision("two");
  f.setFeed({ scope: "mine", scanned: 3, dataAvailable: true, judgements: [finding("c"), finding("b", "new contact", "today"), finding("a", "updated")] });
  const result = await f.read(); assert.equal(f.scans(), 2); assert.deepEqual(result.visible.judgements.map(j => j.id), ["b", "a", "c"]); assert.equal(result.daily.changes, 3);
});
test("a previous authorized report is returned first; an explicit second read computes the replacement", async () => {
  const f = fixture(); await f.read(); f.setRevision("two");
  f.setFeed({ scope: "mine", scanned: 2, dataAvailable: true, judgements: [finding("a", "changed")] });
  const old = await f.read(now, "snapshot"); assert.equal(old.pendingUpdate, true); assert.equal(f.scans(), 1); assert.equal(old.visible.judgements[0].claim, "a");
  const current = await f.read(); assert.equal(current.pendingUpdate, false); assert.equal(f.scans(), 2); assert.equal(current.visible.judgements[0].claim, "changed");
});
test("object visibility withdrawal withholds old evidence even before updated rules finish", async () => {
  const f = fixture(); await f.read(); f.setRevision("two"); f.setInventory({ accounts: ["a"], opportunities: [], targets: [] });
  const old = await f.read(now, "snapshot"); assert.equal(old.pendingUpdate, true); assert.deepEqual(old.visible.judgements, []); assert.equal(old.visible.scanned, 1);
});
test("08:00 advances report date and date rules; an earlier report remains for the initial view", async () => {
  assert.equal(judgementReportDate(new Date("2026-11-24T23:59:59Z")), "2026-11-24"); assert.equal(judgementReportDate(now), "2026-11-25");
  assert.equal(nextJudgementAt(new Date("2026-11-24T23:59:59Z")), now.toISOString()); assert.equal(nextJudgementAt(now), "2026-11-26T00:00:00.000Z");
  const f = fixture(); await f.read(new Date("2026-11-24T23:59:00Z"));
  const earlier = await f.read(now, "snapshot"); assert.equal(earlier.pendingUpdate, true); assert.equal(f.scans(), 1);
  const current = await f.read(now); assert.equal(current.daily.date, "2026-11-25"); assert.equal(f.scans(), 2);
});
test("workspace, member, scope and permissions never share a cached report", async () => {
  const f = fixture(); await f.read();
  for (const owner of [{ ...f.owner, sub: "bob" }, { ...f.owner, workspaceId: "two" }, { ...f.owner, accessVersion: "role-2" }]) await scheduledJudgementFeed(owner, "mine", now, f.deps);
  await scheduledJudgementFeed(f.owner, "all", now, f.deps); assert.equal(f.snapshots.size, 5); assert.equal(f.scans(), 5);
});
test("simultaneous readers share generation; changes during generation are never cached", async () => {
  const f = fixture(); await Promise.all([f.read(), f.read(), f.read()]); assert.equal(f.scans(), 1);
  f.setRevision("two"); const feed = f.deps.feed;
  f.deps.feed = async (...args) => { const result = await feed(...args); f.setRevision("three"); return result; };
  await assert.rejects(f.read(), /judgement_data_changed/); assert.ok([...f.snapshots.values()].every(s => s.dataVersion !== "two"));
});
test("unavailable revisions fail closed instead of returning cached text", async () => {
  const f = fixture(); await f.read(); f.deps.revision = async () => { throw Error("offline"); }; await assert.rejects(f.read(), /offline/);
});
test("snoozes hide unchanged findings without another source scan and stop hiding at expiry", async () => {
  const f = fixture(); await f.read();
  f.deps.snoozes = async () => [{ judgementId: "a", urgency: "week", until: new Date(now.getTime() + 1000), sub: "alice" }];
  assert.deepEqual((await f.read()).visible.judgements.map(j => j.id), ["b"]);
  f.deps.snoozes = async () => []; assert.deepEqual((await f.read()).visible.judgements.map(j => j.id), ["a", "b"]); assert.equal(f.scans(), 1);
});
test("a replica holding the generation lease supplies the result without another rule scan", async () => {
  const f = fixture(); await f.read();
  const saved = [...f.snapshots.values()][0];
  let reads = 0;
  f.deps.snapshots.read = async () => ++reads === 1 ? null : saved;
  f.deps.snapshots.acquire = async () => null;
  assert.equal((await f.read()).visible.judgements.length, 2);
  assert.equal(f.scans(), 1);
});
test("an expired generation lease cannot publish and is released after refusal", async () => {
  const f = fixture(); let released = false;
  f.deps.snapshots.acquire = async () => ({ publish: async () => { throw Error("lease_expired"); }, release: async () => { released = true; } });
  await assert.rejects(f.read(), /lease_expired/);
  assert.equal(released, true); assert.equal(f.snapshots.size, 0);
});
test("a waiting replica can take over a released lease instead of waiting for an absent result", async () => {
  const f = fixture(); let attempts = 0, released = false;
  f.deps.snapshots.acquire = async key => ++attempts === 1 ? null : ({
    publish: value => f.deps.snapshots.write(key, value), release: async () => { released = true; },
  });
  await f.read(); assert.equal(attempts, 2); assert.equal(f.scans(), 1); assert.equal(released, true);
});
test("development data with no trustworthy revision is never reused as a persisted result", async () => {
  const f = fixture(); f.setRevision(null); await f.read(); await f.read(now, "snapshot");
  assert.equal(f.scans(), 2); assert.equal(f.snapshots.size, 0);
});
