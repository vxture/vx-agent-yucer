import { test } from "node:test";
import assert from "node:assert/strict";
import type { AtlasClient, AtlasContext } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { InMemoryAuditStore, setAuditStore } from "../../audit/lib/store";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemorySalesPlanStore } from "./plan-store";
import type { SalesPlanContext } from "./plan-service";
import { emptyContent, type SalesPlan } from "./plan-model";
import { prepareFocusDraft, type FocusAssistInput } from "./focus-assist";
async function harness() {
  setAuditStore(new InMemoryAuditStore());
  const store = new InMemorySalesPlanStore(), at = "2026-07-01T00:00:00.000Z";
  const ctx: SalesPlanContext = { workspaceId: "ws", sub: "ops", scope: { kind: "workspace" }, store,
    holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier: "enterprise" }, now: () => new Date(at) };
  const content = emptyContent(2026, [{ id: "east", divisionId: "east", name: "East", code: "east", provinces: [], included: true, reason: "", ownerSub: "ops" }], "CNY");
  content.releaseScope = "regions";
  const base = content.targets.find(t => t.scope === "territory:east")!;
  content.targets.push({ ...base, key: "count-target", metric: "new_logo", currency: null });
  const revision = { id: "v1", state: "sealed" as const, editToken: 2, version: 1, baseId: null, restoresId: null, content, contentHash: "hash", reason: "", createdBy: "ops", createdAt: at, sealedBy: "ops", sealedAt: at };
  const plan: SalesPlan = { id: "plan", workspaceId: "ws", year: 2026, revisions: [revision, { ...revision, id: "draft", state: "draft", editToken: 1, version: null, baseId: "v1", content: structuredClone(content) }], events: [{ id: "e1", no: 1, kind: "release", revisionId: "v1", relatedId: null, period: null, at, effectiveAt: at, actor: "ops", reason: "", requestKey: "release1", requestHash: "hash" }], legacy: [] };
  store.seed([plan]);
  const input: FocusAssistInput = { year: 2026, revisionId: "draft", editToken: 1, accountId: "a", regionId: "east", text: "Prepare procurement review", values: { objective: "", due: "", budget: "", amount: "", note: "" } };
  let answer = '{"message":"Draft prepared","fields":{"objective":"Confirm procurement window","due":"2026-08-01"}}';
  let calls = 0, charges = 0, fail = false, during: (() => Promise<void>) | undefined;
  const contexts: AtlasContext[] = [], prompts: string[] = [];
  const deps = { account: { id: "a", name: "Ordinary customer", tier: "standard" }, tenantId: "tenant", subjectToken: "obo-ticket", locale: "zh-CN", copilotStore: new InMemoryCopilotStore(),
    atlasClient: { chat: async (profile: string, request: unknown, context: AtlasContext) => {
      calls++; contexts.push(context); prompts.push(JSON.stringify(request)); assert.equal(profile, "drafting");
      if (fail) throw new Error("offline"); await during?.();
      return { id: "reply", modelCode: "fixture", message: { role: "assistant", content: answer }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    } } as unknown as AtlasClient, runosClient: { discover: async () => [] } as unknown as RunosClient,
    meter: { admit: () => ({ ok: true as const }), record: async () => { charges++; return "metered"; } },
  };
  return { ctx, store, input, deps, prompts, contexts, calls: () => calls, charges: () => charges, reply: (value: string) => { answer = value; }, fail: () => { fail = true; }, during: (fn: () => Promise<void>) => { during = fn; } };
}
test("focus assistant uses Atlas OBO/session/usage and returns real field patches without writes", async () => {
  const h = await harness(), before = structuredClone(await h.store.read("ws", 2026));
  const result = await prepareFocusDraft(h.ctx, h.input, h.deps);
  assert.ok(result.ok); assert.equal(result.patch.objective, "Confirm procurement window");
  assert.equal(h.contexts[0].subjectToken, "obo-ticket"); assert.equal(h.contexts[0].applicationId, result.sessionId); assert.equal(h.charges(), 1);
  assert.ok(h.prompts[0].includes("draft")); assert.ok(h.prompts[0].includes("Ordinary customer"));
  assert.deepEqual(await h.store.read("ws", 2026), before);
});
test("permission, tenant, scope, sources and invalid field values fail before model spending", async () => {
  const h = await harness();
  for (const denied of ["planning.write", "planning.read", "copilot.use", "admin.manage"]) {
    const permissions = new Set(h.ctx.holder.permissions); permissions.delete(denied as never);
    assert.equal((await prepareFocusDraft({ ...h.ctx, holder: { permissions } }, h.input, h.deps)).ok, false);
  }
  assert.equal((await prepareFocusDraft(h.ctx, h.input, { ...h.deps, tenantId: null })).ok, false);
  assert.equal((await prepareFocusDraft({ ...h.ctx, scope: { kind: "own", sub: "ops", accountIds: [] } }, h.input, h.deps)).ok, false);
  for (const input of [{ ...h.input, values: { ...h.input.values, amount: "-1" } }, { ...h.input, editToken: 9 }, { ...h.input, regionId: "foreign" }, { ...h.input, accountId: "foreign" }, { ...h.input, targetKey: "foreign" }, { ...h.input, text: "" }])
    assert.equal((await prepareFocusDraft(h.ctx, input, h.deps)).ok, false);
  assert.equal(h.calls(), 0);
});
test("multi-turn context is isolated by actor, workspace, customer and draft token", async () => {
  const h = await harness(), first = await prepareFocusDraft(h.ctx, h.input, h.deps); assert.ok(first.ok);
  assert.ok((await prepareFocusDraft(h.ctx, { ...h.input, sessionId: first.sessionId }, h.deps)).ok);
  assert.equal((await prepareFocusDraft(h.ctx, { ...h.input, accountId: "b", sessionId: first.sessionId }, { ...h.deps, account: { ...h.deps.account, id: "b" } })).ok, false);
  for (const [workspace, actor, title] of [["ws", "other", "[focus-draft]"], ["other", "ops", "[focus-draft]"], ["ws", "ops", "[planning-draft]"]]) {
    const s = await h.deps.copilotStore.createSession(workspace, { actorSub: actor, title });
    assert.equal((await prepareFocusDraft(h.ctx, { ...h.input, sessionId: s.id }, h.deps)).ok, false);
  }
  await h.store.transact("ws", 2026, p => { p.revisions[1].editToken++; });
  assert.equal((await prepareFocusDraft(h.ctx, { ...h.input, editToken: 2, sessionId: first.sessionId }, h.deps)).ok, false);
  assert.equal(h.calls(), 2);
});
test("concurrent saves cannot return a stale model patch", async () => {
  const h = await harness(); h.during(() => h.store.transact("ws", 2026, p => { p.revisions[1].editToken++; }));
  assert.deepEqual(await prepareFocusDraft(h.ctx, h.input, h.deps), { ok: false, error: "draft_conflict" });
});
test("out-of-year dates, fractional customer counts, false save claims fail and tool failure remains retryable", async () => {
  const h = await harness(); h.reply('{"fields":{"due":"2027-01-01"}}');
  assert.equal((await prepareFocusDraft(h.ctx, h.input, h.deps)).ok, false);
  const count = (await h.store.read("ws", 2026))!.revisions[1].content.targets.find(t => t.scope === "territory:east" && t.metric === "new_logo")!;
  h.reply('{"fields":{"amount":"1.5"}}'); assert.equal((await prepareFocusDraft(h.ctx, { ...h.input, targetKey: count.key }, h.deps)).ok, false);
  h.reply("Saved successfully"); assert.equal((await prepareFocusDraft(h.ctx, h.input, h.deps)).ok, false);
  h.fail(); const failure = await prepareFocusDraft(h.ctx, h.input, h.deps); assert.ok(!failure.ok && "recovery" in failure && failure.recovery);
  assert.equal((await h.store.read("ws", 2026))!.events.length, 1);
});
