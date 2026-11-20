import test from "node:test";
import assert from "node:assert/strict";
import type { AtlasClient, AtlasContext } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { InMemoryAuditStore, setAuditStore } from "../../audit/lib/store";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryCatalogStore } from "./store";
import { prepareCatalogDraft } from "./catalog-assist-service";
const values = { name: "", novelty: null };
function harness() {
  setAuditStore(new InMemoryAuditStore());
  const store = new InMemoryCatalogStore(), copilotStore = new InMemoryCopilotStore();
  store.seed({ products: [{ id: "p1", workspaceId: "ws", name: "ERP", productCode: "ERP", unitId: "seat", typeId: null, statusId: "active", sortOrder: 1 }],
    units: [{ id: "seat", workspaceId: "ws", unitCode: "seat", name: "User", sortOrder: 1 }],
    statuses: [{ id: "active", workspaceId: "ws", statusCode: "active", name: "Active", description: null, sortOrder: 1 }],
  });
  const ctx = { workspaceId: "ws", sub: "member", holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier: "enterprise" as const }, store };
  let reply = '{"fields":{"name":"Enterprise ERP","unitId":"seat","novelty":"new"}}', calls = 0, charges = 0, failure = false;
  const contexts: AtlasContext[] = [], prompts: string[] = [];
  const deps = { tenantId: "tenant", subjectToken: "obo-ticket", locale: "zh-CN", copilotStore,
    atlasClient: { chat: async (profile: string, request: unknown, context: AtlasContext) => {
      calls++; contexts.push(context); prompts.push(JSON.stringify(request)); assert.equal(profile, "drafting");
      if (failure) throw new Error("offline");
      return { id: "answer", modelCode: "fixture", message: { role: "assistant", content: reply }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    } } as unknown as AtlasClient, runosClient: { discover: async () => [] } as unknown as RunosClient,
    meter: { admit: () => ({ ok: true as const }), record: async () => { charges++; return "metered"; } },
  };
  return { ctx, deps, store, copilotStore, contexts, prompts, calls: () => calls, charges: () => charges, reply: (s: string) => { reply = s; }, offline: (v: boolean) => { failure = v; } };
}
test("product draft uses shared Atlas/OBO metering and never saves product rows", async () => {
  const h = harness(), result = await prepareCatalogDraft(h.ctx, "product", { text: "New ERP product", values }, h.deps);
  assert.ok(result.ok); assert.equal(result.patch.name, "Enterprise ERP");
  assert.equal(h.contexts[0].subjectToken, "obo-ticket"); assert.equal(h.contexts[0].workspaceId, "ws");
  assert.equal(h.contexts[0].applicationId, result.sessionId); assert.equal(h.charges(), 1);
  assert.equal((await h.store.listProducts("ws")).length, 1);
});
test("solution draft returns existing catalog UUID composition without saving", async () => {
  const h = harness();h.reply('{"fields":{"name":"ERP package","items":[{"productId":"p1","quantity":2,"optional":false}]}}');
  const r = await prepareCatalogDraft(h.ctx, "solution", { text: "Retail ERP bundle", values }, h.deps);
  assert.ok(r.ok); assert.equal(r.patch.items?.[0].productId, "p1"); assert.equal((await h.store.listSolutions("ws")).length, 0);
});
test("write/read/assistant gates and tenant precede model spending", async () => {
  const h = harness();
  for (const permissions of [[], ["copilot.use"], ["catalog.write"], ["catalog.write", "copilot.use"]]) {
    const r = await prepareCatalogDraft({ ...h.ctx, holder: { permissions: new Set(permissions as never[]) } }, "product", { text: "ERP", values }, h.deps);
    assert.equal(r.ok, false);
  }
  assert.deepEqual(await prepareCatalogDraft(h.ctx, "product", { text: "ERP", values }, { ...h.deps, tenantId: null }), { ok: false, error: "no_active_tenant" });
  assert.equal(h.calls(), 0);
});
test("foreign workspace/user/task-kind sessions and missing edit records are refused", async () => {
  const h = harness();
  for (const [workspaceId, actorSub, title] of [["other", "member", "[catalog-product-draft]"], ["ws", "other", "[catalog-product-draft]"], ["ws", "member", "[catalog-solution-draft]"]]) {
    const session = await h.copilotStore.createSession(workspaceId, { actorSub, title, subjectId: null, subjectType: null });
    assert.deepEqual(await prepareCatalogDraft(h.ctx, "product", { text: "ERP", values, sessionId: session.id }, h.deps), { ok: false, error: "not_found" });
  }
  assert.deepEqual(await prepareCatalogDraft(h.ctx, "product", { text: "ERP", values, editId: "foreign" }, h.deps), { ok: false, error: "not_found" });assert.equal(h.calls(), 0);
});
test("client-supplied foreign UUIDs cannot extend the model's reference allowlist", async () => {
  const h = harness(); h.reply('{"fields":{"items":[{"productId":"foreign","quantity":1,"optional":false}]}}');
  const r = await prepareCatalogDraft(h.ctx, "solution", { text: "Use supplied item", values: { ...values, items: [{ productId: "foreign", quantity: 1, optional: false, note: "" }] } }, h.deps);
  assert.ok(r.ok);assert.deepEqual(r.patch, {});assert.equal(h.calls(), 2);
});
test("multi-turn retains manual corrections; invalid JSON and failed turns do not claim success", async () => {
  const h = harness(); const first = await prepareCatalogDraft(h.ctx, "product", { text: "ERP", values }, h.deps);assert.ok(first.ok);
  const next = await prepareCatalogDraft(h.ctx, "product", { text: "Refine", sessionId: first.sessionId, values: { ...values, name: "Manual ERP" }, manualFields: ["name"] }, h.deps);
  assert.ok(next.ok);assert.equal(next.patch.name, undefined);
  h.reply("I saved your product");assert.equal((await prepareCatalogDraft(h.ctx, "product", { text: "ERP", values }, h.deps)).ok, false);
  h.offline(true);const failed = await prepareCatalogDraft(h.ctx, "product", { text: "ERP", values }, h.deps);assert.equal(failed.ok, false);assert.ok(!failed.ok && failed.recovery);
  assert.equal((await h.store.listProducts("ws")).length, 1);
});
test("invalid input and store failures stop without model calls", async () => {
  const h = harness();
  for (const text of ["", "x".repeat(4001)]) assert.equal((await prepareCatalogDraft(h.ctx, "product", { text, values }, h.deps)).ok, false);
  h.store.listProducts = async () => { throw new Error("database offline"); };
  assert.deepEqual(await prepareCatalogDraft(h.ctx, "product", { text: "ERP", values }, h.deps), { ok: false, error: "turn_failed" });assert.equal(h.calls(), 0);
});
