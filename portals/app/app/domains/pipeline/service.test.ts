import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryPipelineStore, type OpportunityRecord } from "./store";
import { advanceStage, listPipeline, submitForecast, type PipelineContext } from "./service";

const WS = "ws_1";

function opp(over: Partial<OpportunityRecord> = {}): OpportunityRecord {
  return {
    id: "opp_1",
    workspaceId: WS,
    opportunityNo: "OPP-1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
    name: "Deal",
    accountId: "acc_1",
    planId: null,
    campaignId: "camp_1",
    territoryId: "t_1",
    ownerSub: "usr_rep",
    stage: "discover",
    forecastCategory: "commit",
    amount: money(100_000),
    probability: 25,
    expectedCloseAt: new Date("2026-09-30T00:00:00Z"),
    closedAt: null,
    status: "open",
    currency: "CNY",
    ...over,
  };
}

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryPipelineStore()): PipelineContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

// --- The gate runs before the rule -----------------------------------------

test("an unentitled workspace is told about the tier, not about the stage machine", async () => {
  // A member who may not touch the pipeline should learn that, not learn that
  // their transition was invalid.
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await advanceStage(ctx("sales_rep", null, store), "opp_1", { to: "validate" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "no_data_access");
});

test("a member without pipeline.write cannot advance a stage", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const r = await advanceStage(ctx("sales_ops", "enterprise", store), "opp_1", { to: "validate" });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("listing is gated too", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  assert.equal(unwrap(await listPipeline(ctx("viewer", "free", store))).length, 1);
  assert.equal((await listPipeline(ctx("viewer", null, store))).ok, false);
});

// --- Workspace isolation ----------------------------------------------------

test("an opportunity in another workspace is not found, not forbidden", async () => {
  // Distinguishing the two would turn a 404 into an existence oracle.
  const store = new InMemoryPipelineStore();
  store.seed([opp({ workspaceId: "ws_other" })]);
  const r = await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "validate" });
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

test("listing never crosses a workspace boundary", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ id: "mine" }), opp({ id: "theirs", workspaceId: "ws_other" })]);
  const rows = unwrap(await listPipeline(ctx("sales_rep", "pro", store)));
  assert.deepEqual(rows.map((r) => r.id), ["mine"]);
});

// --- Stage change: patch and journal together ------------------------------

test("advancing writes the patch and the journal event as one act", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_rep", "pro", store);

  const r = unwrap(await advanceStage(c, "opp_1", { to: "validate" }));
  assert.equal(r.stage, "validate");

  const row = await store.getOpportunity(WS, "opp_1");
  assert.equal(row?.stage, "validate");
  assert.equal(row?.probability, 50, "stage default follows when nobody overrode it");

  const events = await store.listStageEvents(WS, "opp_1");
  assert.equal(events.length, 1);
  assert.equal(events[0].fromStage, "discover");
  assert.equal(events[0].toStage, "validate");
});

test("the actor is the session subject, never the caller's choice", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "validate" });
  const events = await store.listStageEvents(WS, "opp_1");
  assert.equal(events[0].actorSub, "usr_me");
});

test("an illegal transition is refused after the gate passes", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ stage: "won", status: "won", probability: 100, closedAt: new Date() })]);
  const r = await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "negotiate" });
  assert.equal(r.ok === false && r.violations[0].code, "terminal_stage");
  // Nothing was journalled for a refused change.
  assert.equal((await store.listStageEvents(WS, "opp_1")).length, 0);
});

test("winning sets stage, status and closed_at together", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp({ stage: "negotiate", probability: 90 })]);
  await advanceStage(ctx("sales_rep", "pro", store), "opp_1", { to: "won" });
  const row = await store.getOpportunity(WS, "opp_1");
  assert.equal(row?.status, "won");
  assert.ok(row?.closedAt instanceof Date);
  assert.equal(row?.probability, 100);
});

// --- Forecast ---------------------------------------------------------------

test("submitting a forecast needs the dedicated forecast permission", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const scope = { scopeType: "workspace" as const, territoryId: null, ownerSub: null };

  // A rep may advance deals but not commit a number upward.
  const rep = await submitForecast(ctx("sales_rep", "pro", store), { period: "2026Q3", scope });
  assert.equal(rep.ok === false && rep.violations[0].code, "permission_denied");

  const opsResult = unwrap(await submitForecast(ctx("sales_ops", "pro", store), { period: "2026Q3", scope }));
  assert.equal(opsResult.commitAmount.amount, 100_000);
});

test("a snapshot includes closed deals, because attainment is measured from them", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([
    opp({ id: "open", forecastCategory: "commit", amount: money(100) }),
    opp({
      id: "won",
      stage: "won",
      status: "won",
      forecastCategory: "closed",
      amount: money(900),
      closedAt: new Date(),
    }),
  ]);
  const snap = unwrap(
    await submitForecast(ctx("sales_ops", "pro", store), {
      period: "2026Q3",
      scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
    }),
  );
  assert.equal(snap.commitAmount.amount, 100);
  assert.equal(snap.closedAmount.amount, 900);
});

test("snapshots accumulate rather than replace - that is the whole point", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([opp()]);
  const c = ctx("sales_ops", "pro", store);
  const scope = { scopeType: "workspace" as const, territoryId: null, ownerSub: null };

  await submitForecast(c, { period: "2026Q3", scope, snapshotAt: new Date("2026-07-01T00:00:00Z") });
  await submitForecast(c, { period: "2026Q3", scope, snapshotAt: new Date("2026-08-01T00:00:00Z") });

  const history = await store.listForecastSnapshots(WS, { period: "2026Q3" });
  assert.equal(history.length, 2, "forecast accuracy needs every historical snapshot");
});
