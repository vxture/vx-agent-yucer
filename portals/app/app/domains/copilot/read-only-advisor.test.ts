import { test } from "node:test";
import assert from "node:assert/strict";
import type { AtlasClient, AtlasContext } from "../../agent/atlas/client";
import type { ChatRequest } from "../../agent/atlas/types";
import type { RunosClient, RunosContext } from "../../agent/runos/client";
import { InMemoryAuditStore, setAuditStore } from "../../audit/lib/store";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { InMemoryCopilotStore } from "./store";
import { runReadOnlyAdvisor } from "./read-only-advisor";
import { fail, ok, unwrap, violation } from "../shared/result";

function harness() {
  setAuditStore(new InMemoryAuditStore());
  const ctx = { workspaceId: "ws", sub: "leader", store: new InMemoryCopilotStore(),
    holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier: "enterprise" as const } };
  const atlas: AtlasContext[] = [], runos: RunosContext[] = [], requests: ChatRequest[] = [], charges: string[] = [];
  let answer = "Draft prepared", offline = false;
  const deps = {
    atlasClient: { chat: async (_profile: string, request: ChatRequest, context: AtlasContext) => {
      atlas.push(context); requests.push(request);
      if (offline) throw new Error("offline");
      return { id: "answer", modelCode: "fixture", message: { role: "assistant", content: answer },
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    } } as unknown as AtlasClient,
    runosClient: { discover: async (_query: unknown, context: RunosContext) => { runos.push(context); return []; } } as unknown as RunosClient,
    advisorMeter: { admit: () => ({ ok: true as const }), record: async (_ws: string, runId: string) => { charges.push(runId); return runId; } },
    meter: { admit: () => ({ ok: true as const }), record: async () => { assert.fail("advisor must not bill a member turn too"); } },
  };
  const input = { capability: "forecast.brief" as const, kind: "forecast_brief" as const,
    subject: { type: "forecast_scope" as const, id: "Y2026|workspace|v1" },
    question: "Explain the supplied facts", tenantId: "tenant", subjectToken: "obo-ticket", scope: { kind: "workspace" },
    admit: (text: string) => text === "Draft prepared" ? ok({ summary: text }) : fail(violation("invalid_draft", "invalid reply", "answer")) };
  return { ctx, input, deps, atlas, runos, requests, charges, answer: (text: string) => { answer = text; }, offline: (value: boolean) => { offline = value; } };
}

test("both deployment advisors carry the user's OBO and one shared metering/task identity", async () => {
  const h = harness();
  for (const input of [h.input, { ...h.input, capability: "deal.review" as const, kind: "review_draft" as const,
    subject: { type: "opportunity" as const, id: "opportunity", summary: "Closed deal" } }]) {
    const result = unwrap(await runReadOnlyAdvisor(h.ctx, input, h.deps));
    const atlas = h.atlas.at(-1)!, runos = h.runos.at(-1)!;
    assert.equal(atlas.subjectToken, "obo-ticket"); assert.equal(runos.subjectToken, "obo-ticket");
    assert.equal(atlas.taskId, runos.taskId); assert.equal(atlas.businessId, result.runId);
    assert.equal(atlas.applicationId, result.runId); assert.equal(atlas.featureId, input.capability);
    const request = JSON.stringify(h.requests.at(-1));
    assert.ok(request.includes("READ-ONLY RESEARCH")); assert.ok(!request.includes('"name":"propose_action"'));
    assert.equal((await runReadOnlyAdvisor(h.ctx, input, h.deps)).ok, true);
  }
  assert.equal(h.charges.length, 2); assert.equal(h.atlas.length, 2);
  assert.deepEqual(await h.ctx.store.listProposals("ws"), []);
});

test("cache reuse is limited to the same actor, permissions, workspace, scope and business context", async () => {
  const h = harness(), first = unwrap(await runReadOnlyAdvisor(h.ctx, h.input, h.deps));
  const rotated = unwrap(await runReadOnlyAdvisor(h.ctx, { ...h.input, subjectToken: "rotated-ticket" }, h.deps));
  assert.equal(rotated.cached, true, "credentials are never fingerprinted or stored in cache keys");
  const variants = [
    { ctx: { ...h.ctx, sub: "other" }, input: h.input },
    { ctx: { ...h.ctx, workspaceId: "other" }, input: h.input },
    { ctx: h.ctx, input: { ...h.input, scope: { kind: "own" } } },
    { ctx: h.ctx, input: { ...h.input, subject: { ...h.input.subject, id: "2026Q1|workspace|v1" } } },
    { ctx: h.ctx, input: { ...h.input, subject: { ...h.input.subject, id: "Y2026|workspace|v2" } } },
  ];
  for (const v of variants) assert.equal(unwrap(await runReadOnlyAdvisor(v.ctx, v.input, h.deps)).cached, false);
  const permissions = new Set(h.ctx.holder.permissions); permissions.delete("admin.manage");
  const changed = unwrap(await runReadOnlyAdvisor({ ...h.ctx, holder: { permissions } }, h.input, h.deps));
  assert.equal(changed.cached, false); assert.notEqual(changed.runId, first.runId);
  const reordered = new Set([...permissions].reverse());
  assert.equal(unwrap(await runReadOnlyAdvisor({ ...h.ctx, holder: { permissions: reordered } }, h.input, h.deps)).cached, true);
});

test("invalid replies and transport failures remain retryable instead of caching an unusable success", async () => {
  const h = harness(); h.answer("Saved successfully");
  assert.equal((await runReadOnlyAdvisor(h.ctx, h.input, h.deps)).ok, false);
  h.answer("Draft prepared"); h.offline(true);
  assert.equal((await runReadOnlyAdvisor(h.ctx, h.input, h.deps)).ok, false);
  h.offline(false);
  assert.equal(unwrap(await runReadOnlyAdvisor(h.ctx, h.input, h.deps)).cached, false);
  assert.equal(h.atlas.length, 3); assert.equal(new Set(h.charges).size, 1, "retry retains the advisor usage id");
});

test("permission and entitlement denials happen before cache reads, calls or charges", async () => {
  const h = harness(); await runReadOnlyAdvisor(h.ctx, h.input, h.deps);
  const calls = h.atlas.length;
  for (const ctx of [{ ...h.ctx, holder: { permissions: new Set<never>() } },
    { ...h.ctx, entitlement: { ...h.ctx.entitlement, tier: null } }])
    assert.equal((await runReadOnlyAdvisor(ctx, h.input, h.deps)).ok, false);
  assert.equal(h.atlas.length, calls); assert.equal(h.charges.length, calls);
});
