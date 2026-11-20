import { test } from "node:test";
import assert from "node:assert/strict";
import type { AtlasClient, AtlasContext } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { InMemoryAuditStore, setAuditStore } from "../../audit/lib/store";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemorySalesPlanStore } from "./plan-store";
import { changeSalesPlan, type SalesPlanContext } from "./plan-service";
import { emptyContent } from "./plan-model";
import { preparePlanningDraft } from "./plan-assist-service";
import { readPlanningDraft } from "./plan-assist-draft";
async function harness() {
  setAuditStore(new InMemoryAuditStore());
  const store = new InMemorySalesPlanStore();
  const ctx: SalesPlanContext = { workspaceId: "ws", sub: "ops", scope: { kind: "workspace" }, store,
    holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier: "enterprise" }, now: () => new Date("2026-11-20T00:00:00Z") };
  const content = emptyContent(2026, [], "CNY"); content.releaseScope = "company";
  const plan = await changeSalesPlan(ctx, { year: 2026, expectedEventNo: 0, requestKey: "fixture-draft", command: { kind: "draft", scope: "company", content } });
  const draft = plan.revisions[0];
  const input = { year: 2026, revisionId: draft.id, editToken: draft.editToken, values: draft.content, text: "Annual revenue 1000000 and 30 new customers" };
  let reply = '{"message":"Drafted","fields":{"targets":[{"metric":"revenue","value":"1000000"},{"metric":"new_logo","value":"30"}]}}';
  let calls = 0, charges = 0, fail = false, during: (() => Promise<void>) | undefined;
  const contexts: AtlasContext[] = [], prompts: string[] = [];
  const deps = { tenantId: "tenant", subjectToken: "obo-ticket", locale: "zh-CN", copilotStore: new InMemoryCopilotStore(),
    atlasClient: { chat: async (profile: string, request: unknown, context: AtlasContext) => {
      calls++; contexts.push(context); prompts.push(JSON.stringify(request)); assert.equal(profile, "drafting");
      if (fail) throw new Error("offline"); await during?.();
      return { id: "answer", modelCode: "fixture", message: { role: "assistant", content: reply }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    } } as unknown as AtlasClient, runosClient: { discover: async () => [] } as unknown as RunosClient,
    meter: { admit: () => ({ ok: true as const }), record: async () => { charges++; return "metered"; } },
  };
  return { ctx, store, plan, input, deps, contexts, prompts, calls: () => calls, charges: () => charges,
    reply: (value: string) => { reply = value; }, fail: () => { fail = true; }, during: (fn: () => Promise<void>) => { during = fn; } };
}
test("planning drafting uses Atlas OBO, audit/session and usage without saving or publishing", async () => {
  const h = await harness(); const before = structuredClone(await h.store.read("ws", 2026));
  const result = await preparePlanningDraft(h.ctx, h.input, h.deps);
  assert.ok(result.ok); assert.equal(result.patch.targets[0].value, "1000000");
  assert.equal(h.contexts[0].subjectToken, "obo-ticket"); assert.equal(h.contexts[0].workspaceId, "ws");
  assert.equal(h.contexts[0].applicationId, result.sessionId); assert.equal(h.charges(), 1);
  assert.ok(h.prompts[0].includes(h.input.revisionId));
  assert.deepEqual(await h.store.read("ws", 2026), before);
});
test("write/read/assistant/scope/tenant gates run before model spending", async () => {
  const h = await harness();
  for (const denied of ["planning.write", "planning.read", "copilot.use"]) {
    const permissions = new Set(h.ctx.holder.permissions); permissions.delete(denied as never);
    assert.equal((await preparePlanningDraft({ ...h.ctx, holder: { permissions } }, h.input, h.deps)).ok, false);
  }
  assert.equal((await preparePlanningDraft({ ...h.ctx, scope: { kind: "own", sub: "ops", accountIds: [] } }, h.input, h.deps)).ok, false);
  assert.equal((await preparePlanningDraft(h.ctx, h.input, { ...h.deps, tenantId: null })).ok, false);
  assert.equal(h.calls(), 0);
});
test("wrong revision, stale edit token, year, region and task/user/workspace sessions are refused", async () => {
  const h = await harness();
  for (const input of [{ ...h.input, revisionId: "foreign" }, { ...h.input, editToken: 5 }, { ...h.input, year: 2027 }, { ...h.input, regionId: "foreign" }, { ...h.input, text: "" }])
    assert.equal((await preparePlanningDraft(h.ctx, input, h.deps)).ok, false);
  for (const [workspace, actor, title] of [["ws", "other", "[planning-draft]"], ["other", "ops", "[planning-draft]"], ["ws", "ops", "[catalog-product-draft]"]]) {
    const s = await h.deps.copilotStore.createSession(workspace, { actorSub: actor, title });
    assert.equal((await preparePlanningDraft(h.ctx, { ...h.input, sessionId: s.id }, h.deps)).ok, false);
  }
  assert.equal(h.calls(), 0);
});
test("multi-turn sessions are bound to the exact draft token", async () => {
  const h = await harness(); const first = await preparePlanningDraft(h.ctx, h.input, h.deps); assert.ok(first.ok);
  const second = await preparePlanningDraft(h.ctx, { ...h.input, sessionId: first.sessionId, text: "Use 2000000" }, h.deps); assert.ok(second.ok);
  await h.store.transact("ws", 2026, p => { p.revisions[0].editToken++; });
  assert.equal((await preparePlanningDraft(h.ctx, { ...h.input, editToken: 2, sessionId: first.sessionId }, h.deps)).ok, false);
  assert.equal(h.calls(), 2);
});
test("another editor's save during a model call cannot return a stale patch", async () => {
  const h = await harness(); h.during(() => h.store.transact("ws", 2026, p => { p.revisions[0].editToken++; }));
  const result = await preparePlanningDraft(h.ctx, h.input, h.deps);
  assert.deepEqual(result, { ok: false, error: "draft_conflict" });
});
test("prose claims/unknown fields/invalid amounts fail; a failed turn provides retry recovery", async () => {
  const h = await harness(); h.reply("Saved your plan");
  assert.equal((await preparePlanningDraft(h.ctx, h.input, h.deps)).ok, false);
  for (const fields of [{ publish: true }, { targets: [{ metric: "revenue", value: "-1" }] }, { targets: [{ metric: "new_logo", value: "1.2" }] }])
    assert.equal(readPlanningDraft(JSON.stringify({ fields })), null);
  h.fail(); const failure = await preparePlanningDraft(h.ctx, h.input, h.deps);
  assert.ok(!failure.ok && "recovery" in failure && failure.recovery);
  assert.equal((await h.store.read("ws", 2026))!.events.length, 1);
});
