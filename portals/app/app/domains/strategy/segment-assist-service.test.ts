import test from "node:test";
import type { PermissionHolder } from "../../authz/decide";
import assert from "node:assert/strict";
import { prepareSegmentDraft, segmentVocabulary } from "./segment-assist-service";
import { InMemoryStrategyStore } from "./store";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryCatalogStore } from "../catalog/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryAuditStore, setAuditStore } from "../../audit/lib/store";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import type { AtlasClient, AtlasContext } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { segmentFillValues } from "./lib/segment-draft";
const values = segmentFillValues("", { industries: [], regions: [] });
function harness() {
  setAuditStore(new InMemoryAuditStore());
  const strategy = new InMemoryStrategyStore();
  const account = new InMemoryAccountStore();
  const ctx = { workspaceId: "segment-workspace", sub: "member", store: strategy,
    holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "segment-workspace", product: "yucer", tier: "enterprise" as const } };
  const copilotStore = new InMemoryCopilotStore();
  let reply = '{"fields":{"name":"Retail chains","customerNeed":"Inventory mismatch (hypothesis)"}}';
  let calls = 0, charges = 0;
  let failure = false;
  const contexts: AtlasContext[] = [];
  const prompts: string[] = [];
  const deps = { tenantId: "tenant", subjectToken: "user-ticket", locale: "zh-CN", account: { ...ctx, store: account }, catalog: new InMemoryCatalogStore(), copilotStore,
    atlasClient: { chat: async (_profile: string, request: { messages: { content: string }[] }, context: AtlasContext) => {
      calls++; contexts.push(context); prompts.push(JSON.stringify(request));
      assert.equal(_profile, "drafting");
      if (failure) throw new Error("offline");
      return { id: "answer", modelCode: "fixture", message: { role: "assistant", content: reply }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    } } as unknown as AtlasClient,
    runosClient: { discover: async () => [] } as unknown as RunosClient,
    meter: { admit: () => ({ ok: true as const }), record: async () => { charges++; return "metered"; } } };
  return { ctx, deps, strategy, account, copilotStore, contexts, prompts, calls: () => calls, charges: () => charges, reply: (v: string) => { reply = v; }, offline: (v: boolean) => { failure = v; } };
}

test("market filling uses shared metered Atlas/OBO context and leaves market persistence untouched", async () => {
  const h = harness();
  const result = await prepareSegmentDraft(h.ctx, { text: "Target medium retail chains", values }, h.deps);
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.patch.name, "Retail chains");
  assert.equal(h.contexts[0]!.subjectToken, "user-ticket");
  assert.equal(h.contexts[0]!.workspaceId, h.ctx.workspaceId);
  assert.equal(h.contexts[0]!.applicationId, result.sessionId);
  assert.equal(h.contexts[0]!.featureId, "copilot.chat");
  assert.equal(h.charges(), 1);
  assert.equal((await h.strategy.listSegments(h.ctx.workspaceId)).length, 0);
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 0);
  assert.match(h.prompts[0]!, /SALES REGIONS/);
});
test("configured vocabulary exists with no customers and without catalog access", async () => {
  const h = harness();
  const vocab = await segmentVocabulary({ ...h.deps.account, holder: { permissions: new Set(["account.read"]) } }, h.deps.catalog);
  assert.ok(vocab.industries.length > 0);
  assert.ok(vocab.sizes.length > 0);
  assert.equal(vocab.products, null); assert.equal(vocab.solutions, null);
  assert.equal((await h.account.listAccounts(h.ctx.workspaceId)).length, 0);
});
test("write permission, assistant permission and tenant are checked before model spending", async () => {
  const h = harness();
  const holders: PermissionHolder[] = [{ permissions: new Set() }, { permissions: new Set(["strategy.write"]) }];
  for (const holder of holders) {
    const result = await prepareSegmentDraft({ ...h.ctx, holder }, { text: "Retail", values }, h.deps);
    assert.equal(result.ok, false);
  }
  const result = await prepareSegmentDraft(h.ctx, { text: "Retail", values }, { ...h.deps, tenantId: null });
  assert.deepEqual(result, { ok: false, error: "no_active_tenant" });
  assert.equal(h.calls(), 0);
});
test("foreign threads and unrelated conversation types cannot be reused", async () => {
  const h = harness();
  for (const [workspaceId, actorSub, title] of [[h.ctx.workspaceId, "other", "[segment-draft]"], [h.ctx.workspaceId, "member", "[account-registration]"], ["other-workspace", "member", "[segment-draft]"]]) {
    const thread = await h.copilotStore.createSession(workspaceId!, { actorSub: actorSub!, title: title!, subjectType: null, subjectId: null });
    const result = await prepareSegmentDraft(h.ctx, { text: "Retail", sessionId: thread.id, values }, h.deps);
    assert.deepEqual(result, { ok: false, error: "not_found" });
  }
  assert.equal(h.calls(), 0);
});
test("unvalidated client selections cannot become model-approved catalog IDs", async () => {
  const h = harness(); h.reply('{"fields":{"productIds":["invented"],"regions":["department"]}}');
  const result = await prepareSegmentDraft(h.ctx, { text: "Use these", values: { ...values, productIds: ["invented"], regions: ["department"] } }, h.deps);
  assert.equal(result.ok, true); if (result.ok) assert.deepEqual(result.patch, {});
  assert.equal(h.calls(), 2, "shared answer review automatically attempts one repair");
});
test("follow-up turns retain manual corrections, including empty optional fields", async () => {
  const h = harness();
  const first = await prepareSegmentDraft(h.ctx, { text: "Retail", values }, h.deps);
  assert.equal(first.ok, true); if (!first.ok) return;
  const next = await prepareSegmentDraft(h.ctx, { text: "Refine buying scenario", sessionId: first.sessionId, values: { ...values, name: "My market", customerNeed: "" }, manualFields: ["name", "customerNeed"] }, h.deps);
  assert.equal(next.ok, true); if (next.ok) assert.deepEqual(next.patch, {});
});
test("failed turns preserve retry context and can continue without duplicate questions", async () => {
  const h = harness(); h.offline(true);
  const first = await prepareSegmentDraft(h.ctx, { text: "Retail", values }, h.deps);
  assert.equal(first.ok, false); if (first.ok || !first.recovery) throw new Error("missing retry context");
  h.offline(false);
  const result = await prepareSegmentDraft(h.ctx, { text: "Retail", ...first.recovery, retryMessageId: first.recovery.messageId, values }, h.deps);
  assert.equal(result.ok, true);
  const messages = await h.copilotStore.listMessages(h.ctx.workspaceId, first.recovery.sessionId);
  assert.equal(messages.filter(row => row.role === "user").length, 1);
});
