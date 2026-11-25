import assert from "node:assert/strict";
import { test } from "node:test";
import { runDailyJudgements, type DailyJobServices } from "./daily-job";
import { InMemoryAuthzStore } from "../../authz/store";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";

const now = new Date("2026-11-24T01:00:00Z");
function fixture() {
  const authz = new InMemoryAuthzStore();
  for (const sub of ["alice", "revoked", "inactive", "no-role"])
    authz.seed("ws", sub, sub === "no-role" ? [] : ["sales_rep"]);
  const generated: string[] = [], scanned: string[] = [];
  const keys = new Set<string>();
  const deps: DailyJobServices = {
    entitlement: async workspace_id => ({ ...EMPTY_ENTITLEMENT, workspace_id, product: "yucer", tier: "pro" }),
    organizations: async () => new Map([["ws", "org-ws"], ["broken", "org-broken"]]),
    roster: async () => ["alice", "inactive", "no-role"].map(subject => ({ subject, displayName: null })),
    authz: () => new Proxy(authz, { get(target, property, receiver) {
      if (property === "listMembers") return async (ws: string) => (await target.listMembers(ws)).map(m => m.sub === "inactive" ? { ...m, status: "inactive" } : m);
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    } }),
    scope: async () => ({ kind: "own", sub: "alice", accountIds: [] }),
    account: () => new InMemoryAccountStore(),
    pipeline: () => new InMemoryPipelineStore(),
    exists: async (owner, scope) => keys.has(owner.accessVersion + scope),
    baseline: async (owner, feed) => {
      keys.add(owner.accessVersion + feed.scope);
      generated.push(owner.sub + ":" + feed.scope);
      return { date: "2026-11-24", generatedAt: now.toISOString(), revalidatedAt: now.toISOString(), changes: 0, judgements: feed.judgements };
    },
    feed: async (ctx, options) => {
      assert.equal(ctx.allowWorkspaceMetrics, false);
      assert.equal((await ctx.stores!.account!().listAccounts(ctx.workspaceId)).length, 0);
      assert.equal((await ctx.stores!.pipeline!().listOpportunities(ctx.workspaceId)).length, 0);
      scanned.push(ctx.sub);
      return { ok: true, value: { judgements: [], scope: options?.scope ?? "mine", scanned: 0, dataAvailable: true } };
    },
  };
  return { deps, authz, generated, scanned };
}

test("daily jobs use the live product roster, local permissions and scoped stores, then skip the same day", async () => {
  const { deps, generated, scanned } = fixture();
  assert.deepEqual(await runDailyJudgements(["ws"], now, deps), { generated: 2, skipped: 1, failed: 0 });
  assert.deepEqual(generated, ["alice:mine", "alice:all"]);
  assert.deepEqual(scanned, ["alice", "alice"]);
  assert.deepEqual(await runDailyJudgements(["ws"], now, deps), { generated: 0, skipped: 3, failed: 0 });
  deps.scope = async () => ({ kind: "workspace" });
  deps.feed = async (ctx, options) => {
    assert.equal(ctx.allowWorkspaceMetrics, true);
    return { ok: true, value: { judgements: [], scope: options?.scope ?? "mine", scanned: 0, dataAvailable: true } };
  };
  assert.equal((await runDailyJudgements(["ws"], now, deps)).generated, 2);
});

test("unavailable roster and revoked entitlement never generate a private baseline", async () => {
  const { deps, scanned } = fixture();
  deps.roster = async () => null;
  assert.deepEqual(await runDailyJudgements(["ws"], now, deps), { generated: 0, skipped: 1, failed: 0 });
  deps.roster = async () => [{ subject: "alice", displayName: null }];
  deps.entitlement = async workspace_id => ({ ...EMPTY_ENTITLEMENT, workspace_id, product: "yucer" });
  assert.deepEqual(await runDailyJudgements(["ws"], now, deps), { generated: 0, skipped: 1, failed: 0 });
  assert.deepEqual(scanned, []);
});

test("one failing workspace or member does not stop later members and scopes", async () => {
  const { deps } = fixture();
  const entitlement = deps.entitlement;
  deps.entitlement = async ws => { if (ws === "broken") throw new Error("offline"); return entitlement(ws); };
  deps.baseline = async () => { throw new Error("redis offline"); };
  assert.deepEqual(await runDailyJudgements(["broken", "ws"], now, deps), { generated: 0, skipped: 1, failed: 2 });
  deps.feed = async () => ({ ok: false, violations: [{ code: "denied", message: "denied" }] });
  assert.deepEqual(await runDailyJudgements(["ws"], now, deps), { generated: 0, skipped: 1, failed: 2 });
});


test("background roster reads use each workspace's current organization and skip absent relations", async () => {
  const { deps } = fixture();
  deps.organizations = async () => new Map([["ws", "org-ws"], ["other", "org-other"]]);
  const calls: string[] = [];
  deps.roster = async (ws, org) => { calls.push(ws + ":" + org); return []; };
  assert.deepEqual(await runDailyJudgements(["ws", "historical", "other"], now, deps), { generated: 0, skipped: 1, failed: 0 });
  assert.deepEqual(calls, ["ws:org-ws", "other:org-other"]);
  deps.organizations = async () => null;
  assert.deepEqual(await runDailyJudgements(["ws"], now, deps), { generated: 0, skipped: 1, failed: 0 });
  assert.equal(calls.length, 2);
});

test("a failed directory cannot generate daily summaries from partial or historical tenant context", async () => {
  const { deps, scanned } = fixture();
  deps.organizations = async () => { throw new Error("directory unavailable"); };
  deps.roster = async () => { assert.fail("roster must not run without authoritative context"); };
  await assert.rejects(runDailyJudgements(["ws"], now, deps), /directory unavailable/);
  assert.deepEqual(scanned, []);
  assert.deepEqual(await runDailyJudgements([], now, deps), { generated: 0, skipped: 0, failed: 0 });
});
