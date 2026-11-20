import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { emptyContent, type PlanRevision, type SalesPlan } from "../../domains/planning/plan-model";
import { InMemorySalesPlanStore } from "../../domains/planning/plan-store";
import type { SalesPlanContext } from "../../domains/planning/plan-service";
import { readDeploymentOverview } from "../domain/[key]/deployment-data";
import { deploymentOverviewFacts } from "../domain/[key]/facts";

const at = "2026-11-19T12:00:00.000Z";
function setup() {
  const store = new InMemorySalesPlanStore();
  const ctx: SalesPlanContext = {
    workspaceId: "ws", sub: "ops", scope: { kind: "workspace" }, store,
    holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier: "enterprise" },
  };
  const content = emptyContent(2026, [
    { id: "east", divisionId: "east-division", name: "East", code: "E", provinces: [], included: true, reason: "", ownerSub: null },
    { id: "west", divisionId: "west-division", name: "West", code: "W", provinces: [], included: false, reason: "Excluded", ownerSub: null },
  ], "CNY");
  content.releaseScope = "regions";
  content.budgets = ["a", "a", "b"].map((id, i) => ({
    key: `budget-${i}`, accountId: id, name: id, tier: "standard", period: i === 1 ? "2026Q1" : "Y2026",
    metric: "revenue", currency: "CNY", amount: "10", sourcePlanId: null, sourceReadAt: at, note: "",
  }));
  content.actions = ["a", "a", "c"].map((id, i) => ({
    key: `action-${i}`, regionId: "east", targetKey: null, accountId: id,
    objective: "Follow up", ownerSub: null, due: "2026-12-01", evidenceRefs: [],
  }));
  const revision: PlanRevision = {
    id: "regional-v2", state: "sealed", editToken: 1, version: 2, baseId: null, restoresId: null,
    content, contentHash: "fixture", reason: "", createdBy: "ops", createdAt: "2026-01-01T00:00:00.000Z",
    sealedBy: "ops", sealedAt: "2026-01-01T00:00:00.000Z",
  };
  const plan: SalesPlan = {
    id: "plan", workspaceId: "ws", year: 2026, revisions: [revision], legacy: [],
    events: [{ id: "release-2", no: 1, kind: "release", revisionId: revision.id, relatedId: null, period: null,
      at: "2026-01-01T00:00:00.000Z", effectiveAt: "2026-01-01T00:00:00.000Z", actor: "ops", reason: "", requestKey: "fixture-release", requestHash: "fixture" }],
  };
  return { ctx, store, plan, revision };
}

test("deployment uses the published snapshot, UUID dedupe and explicit responsibility only", async () => {
  const { ctx, store, plan } = setup();
  store.seed([plan]);
  const result = await readDeploymentOverview(ctx, 2026, at);
  assert.deepEqual(result, { status: "published", revisionId: "regional-v2", version: 2, regionalVersion: 2,
    closed: false, regions: 1, customers: 3, regionsWithoutOwner: 1, customersWithoutAction: 1 });
  const facts = deploymentOverviewFacts(result, 2026);
  assert.equal(facts.length, 4);
  assert.ok(facts.every(f => f.href === "/planning?year=2026&revision=regional-v2"));
});

test("drafts and scheduled revisions do not replace the effective deployment", async () => {
  const { ctx, store, plan, revision } = setup();
  const next = structuredClone(revision);
  next.id = "future"; next.version = 3; next.content.budgets = []; next.content.actions = [];
  plan.revisions.push(next, { ...structuredClone(next), id: "draft", version: null, state: "draft" });
  plan.events.push({ ...plan.events[0], id: "release-future", no: 2, revisionId: next.id, at, effectiveAt: "2026-12-01T00:00:00.000Z" });
  store.seed([plan]);
  const result = await readDeploymentOverview(ctx, 2026, at);
  assert.equal(result.revisionId, revision.id);
  assert.equal(result.customers, 3);
});

test("company revisions identify the original regional publication across multiple revisions", async () => {
  const { ctx, store, plan, revision } = setup();
  for (const version of [3, 4]) {
    const next = { ...structuredClone(revision), id: `company-${version}`, version, baseId: plan.revisions.at(-1)!.id };
    next.content.releaseScope = "company";
    plan.revisions.push(next);
    plan.events.push({ ...plan.events[0], id: `release-${version}`, no: version, revisionId: next.id, at: "2026-02-01T00:00:00.000Z", effectiveAt: "2026-02-01T00:00:00.000Z" });
  }
  store.seed([plan]);
  const result = await readDeploymentOverview(ctx, 2026, at);
  assert.equal(result.version, 4);
  assert.equal(result.regionalVersion, 2);
  assert.equal(result.customers, 3);
});

test("company-only publication has no fictional regional coverage figures", async () => {
  const { ctx, store, plan, revision } = setup();
  revision.content.releaseScope = "company";
  revision.content.regions = []; revision.content.budgets = []; revision.content.actions = [];
  store.seed([plan]);
  const result = await readDeploymentOverview(ctx, 2026, at);
  assert.equal(result.status, "published");
  assert.equal(result.regionalVersion, null);
  assert.deepEqual(deploymentOverviewFacts(result, 2026), []);
});

test("no publication, another workspace and another year are not zero coverage", async () => {
  const { ctx, store, plan } = setup();
  store.seed([plan]);
  assert.deepEqual(await readDeploymentOverview(ctx, 2027, at), { status: "unpublished" });
  assert.deepEqual(await readDeploymentOverview({ ...ctx, workspaceId: "other" }, 2026, at), { status: "unpublished" });
  const draftStore = new InMemorySalesPlanStore();
  plan.events = []; plan.revisions[0].state = "draft";
  draftStore.seed([plan]);
  assert.deepEqual(await readDeploymentOverview({ ...ctx, store: draftStore }, 2026, at), { status: "unpublished" });
});

test("permission, entitlement and restricted scope fail before the store read", async () => {
  const { ctx } = setup();
  ctx.store.read = async () => { throw new Error("must not be called"); };
  const blockedContexts: SalesPlanContext[] = [
    { ...ctx, holder: { permissions: new Set() } },
    { ...ctx, entitlement: { ...ctx.entitlement, tier: null } },
    { ...ctx, scope: { kind: "own" as const, sub: "ops", accountIds: [] } },
  ];
  for (const blocked of blockedContexts) assert.deepEqual(await readDeploymentOverview(blocked, 2026, at), { status: "denied" });
});

test("source permission refusals do not leak snapshot counts", async () => {
  const { ctx, store, plan } = setup();
  store.seed([plan]);
  for (const permission of ["account.read", "admin.manage"] as const) {
    const permissions = new Set(ctx.holder.permissions); permissions.delete(permission);
    const result = await readDeploymentOverview({ ...ctx, holder: { permissions } }, 2026, at);
    assert.deepEqual(result, { status: "denied" });
    assert.deepEqual(deploymentOverviewFacts(result, 2026), []);
  }
});

test("failed reads remain distinguishable from missing or refused planning", async () => {
  const { ctx } = setup();
  ctx.store.read = async () => { throw new Error("database unavailable"); };
  const result = await readDeploymentOverview(ctx, 2026, at);
  assert.deepEqual(result, { status: "failed" });
  assert.deepEqual(deploymentOverviewFacts(result, 2026), []);
});

test("action-only customer references still require customer read access", async () => {
  const { ctx, store, plan } = setup();
  plan.revisions[0].content.budgets = [];
  store.seed([plan]);
  const permissions = new Set(ctx.holder.permissions); permissions.delete("account.read");
  assert.deepEqual(await readDeploymentOverview({ ...ctx, holder: { permissions } }, 2026, at), { status: "denied" });
});

test("closed years retain their publication context", async () => {
  const { ctx, store, plan } = setup();
  plan.events.push({ ...plan.events[0], id: "closed", kind: "close", no: 2, at });
  store.seed([plan]);
  const result = await readDeploymentOverview(ctx, 2026, at);
  assert.equal(result.closed, true);
  assert.equal(result.revisionId, "regional-v2");
});
