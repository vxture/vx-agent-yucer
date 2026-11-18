import { test } from "node:test";
import assert from "node:assert/strict";
import type { AtlasClient, AtlasContext } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { setAuditStore, InMemoryAuditStore } from "../../audit/lib/store";
import { InMemoryCatalogStore } from "../catalog/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryStrategyStore } from "./store";
import { emptyStrategyResult } from "./lib/strategy-result";
import { preparePlanDraft } from "./plan-assist-service";
function harness() {
  setAuditStore(new InMemoryAuditStore());
  const store = new InMemoryStrategyStore(),
    copilotStore = new InMemoryCopilotStore();
  let calls = 0,
    charges = 0,
    offline = false,
    reply =
      '{"message":"Draft prepared","fields":{"name":"Retail strategy","objective":"Win retail chains"}}';
  const contexts: AtlasContext[] = [];
  const prompts: string[] = [];
  const ctx = {
    workspaceId: "plan-assist",
    sub: "owner",
    store,
    memberDirectory: {
      listMembers: async () => [
        { sub: "owner", displayName: "Owner", status: "active" },
      ],
    },
    holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: "plan-assist",
      product: "yucer",
      tier: "enterprise" as const,
    },
  };
  const deps = {
    tenantId: "tenant",
    subjectToken: "user-ticket",
    locale: "zh-CN",
    catalog: new InMemoryCatalogStore(),
    copilotStore,
    atlasClient: {
      chat: async (
        profile: string,
        request: unknown,
        context: AtlasContext,
      ) => {
        assert.equal(profile, "drafting");
        calls++;
        contexts.push(context);
        prompts.push(JSON.stringify(request));
        if (offline) throw new Error("offline");
        return {
          id: "answer",
          modelCode: "fixture",
          message: { role: "assistant", content: reply },
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    } as unknown as AtlasClient,
    runosClient: { discover: async () => [] } as unknown as RunosClient,
    meter: {
      admit: () => ({ ok: true as const }),
      record: async () => {
        charges++;
        return "metered";
      },
    },
  };
  const values = {
    name: "",
    period: "2099",
    ownerSub: null,
    objective: null,
    result: emptyStrategyResult(),
  };
  return {
    ctx,
    deps,
    values,
    contexts,
    prompts,
    calls: () => calls,
    charges: () => charges,
    setReply: (v: string) => {
      reply = v;
    },
    setOffline: (v: boolean) => {
      offline = v;
    },
  };
}
test("strategy drafting uses shared metered Atlas/Runos context and returns actual fields without creating a strategy", async () => {
  const h = harness(),
    r = await preparePlanDraft(
      h.ctx,
      { text: "Retail strategy", values: h.values },
      h.deps,
    );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.patch.name, "Retail strategy");
  assert.equal(h.contexts[0].subjectToken, "user-ticket");
  assert.equal(h.contexts[0].workspaceId, h.ctx.workspaceId);
  assert.equal(h.contexts[0].applicationId, r.sessionId);
  assert.equal(h.charges(), 1);
  assert.equal((await h.ctx.store.listPlans(h.ctx.workspaceId)).length, 0);
  assert.match(h.prompts[0], /Customer sizes belong to market criteria/);
  const second = await preparePlanDraft(
    h.ctx,
    {
      text: "Refine this",
      values: { ...h.values, ...r.patch },
      sessionId: r.sessionId,
    },
    h.deps,
  );
  assert.equal(second.ok, true);
});
test("missing permissions, tenant, foreign conversations and published targets fail before model spending", async () => {
  const h = harness();
  assert.equal(
    (
      await preparePlanDraft(
        { ...h.ctx, holder: { permissions: new Set() } },
        { text: "Create", values: h.values },
        h.deps,
      )
    ).ok,
    false,
  );
  assert.deepEqual(
    await preparePlanDraft(
      h.ctx,
      { text: "Create", values: h.values },
      { ...h.deps, tenantId: null },
    ),
    { ok: false, error: "no_active_tenant" },
  );
  for (const [actorSub, title] of [
    ["other", "[strategy-draft]"],
    ["owner", "[segment-draft]"],
  ]) {
    const session = await h.deps.copilotStore.createSession(h.ctx.workspaceId, {
      actorSub,
      title,
      subjectType: null,
      subjectId: null,
    });
    assert.deepEqual(
      await preparePlanDraft(
        h.ctx,
        { text: "Create", values: h.values, sessionId: session.id },
        h.deps,
      ),
      { ok: false, error: "not_found" },
    );
  }
  assert.equal(
    (
      await preparePlanDraft(
        h.ctx,
        { text: "Edit", editId: "missing", values: h.values },
        h.deps,
      )
    ).ok,
    false,
  );
  assert.equal(h.calls(), 0);
});
test("prose-only or invented references cannot become a successful form fill", async () => {
  const h = harness();
  h.setReply("The form is already filled");
  const r = await preparePlanDraft(
    h.ctx,
    { text: "Fill", values: h.values },
    h.deps,
  );
  assert.equal(r.ok, false);
  assert.equal(h.calls(), 2);
  h.setReply('{"fields":{"ownerSub":"invented"}}');
  assert.equal(
    (await preparePlanDraft(h.ctx, { text: "Fill", values: h.values }, h.deps))
      .ok,
    false,
  );
});
test("failed shared model turns retain retry identity and recover without duplicating the user question", async () => {
  const h = harness();
  h.setOffline(true);
  const first = await preparePlanDraft(
    h.ctx,
    { text: "Draft retail", values: h.values },
    h.deps,
  );
  assert.equal(first.ok, false);
  if (first.ok || !first.recovery) throw new Error("missing retry");
  h.setOffline(false);
  const r = await preparePlanDraft(
    h.ctx,
    {
      text: "Draft retail",
      values: h.values,
      sessionId: first.recovery.sessionId,
      retryMessageId: first.recovery.messageId,
    },
    h.deps,
  );
  assert.equal(r.ok, true);
  assert.equal(
    (
      await h.deps.copilotStore.listMessages(
        h.ctx.workspaceId,
        first.recovery.sessionId,
      )
    ).filter((m) => m.role === "user").length,
    1,
  );
});
