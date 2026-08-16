import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryStrategyStore, type CampaignRecord, type ExecutionRecord, type PlanRecord } from "./store";
import { campaignReturn, listPlans, transitionCampaign, transitionPlan, type StrategyContext } from "./service";

const WS = "ws_1";
const AT = new Date("2026-08-15T00:00:00Z");

function plan(over: Partial<PlanRecord> = {}): PlanRecord {
  return {
    id: "plan_1",
    workspaceId: WS,
    planNo: "PLAN-1",
    name: "2026 H2 GTM",
    period: "2026H2",
    objective: null,
    ownerSub: "usr_cro",
    status: "draft",
    approvedAt: null,
    ...over,
  };
}

function campaign(over: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp_1",
    workspaceId: WS,
    campaignNo: "CAMP-1",
    name: "Q3 Outbound",
    planId: "plan_1",
    segmentId: null,
    channel: "outbound",
    budgetAmount: money(200_000),
    ownerSub: "usr_mkt",
    startsAt: AT,
    endsAt: null,
    status: "running",
    currency: "CNY",
    ...over,
  };
}

const exec = (status: ExecutionRecord["status"], id = "e1"): ExecutionRecord & { workspaceId: string } => ({
  id,
  campaignId: "camp_1",
  title: "outreach",
  actionType: "outreach",
  assigneeSub: null,
  dueAt: null,
  status,
  workspaceId: WS,
});

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryStrategyStore()): StrategyContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

// --- D1 plan lifecycle ------------------------------------------------------

test("strategy is a business-tier capability", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ plans: [plan()] });
  assert.equal((await listPlans(ctx("sales_leader", "pro", store))).ok, false);
  assert.equal(unwrap(await listPlans(ctx("sales_leader", "business", store))).length, 1);
});

test("approving stamps the moment, and later moves do not re-stamp it", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ plans: [plan()] });
  const c = ctx("sales_leader", "business", store);

  unwrap(await transitionPlan(c, "plan_1", "approved", { at: AT }));
  assert.equal((await store.getPlan(WS, "plan_1"))?.approvedAt?.getTime(), AT.getTime());

  unwrap(await transitionPlan(c, "plan_1", "draft"));
  assert.equal(
    (await store.getPlan(WS, "plan_1"))?.approvedAt?.getTime(),
    AT.getTime(),
    "the original approval stamp survives",
  );
});

test("a running plan cannot be sent back to draft", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ plans: [plan({ status: "active", approvedAt: AT })] });
  const r = await transitionPlan(ctx("sales_leader", "business", store), "plan_1", "draft");
  assert.equal(r.ok === false && r.violations[0].code, "illegal_transition");
});

test("a marketing manager may edit strategy; a rep may not", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ plans: [plan()] });
  assert.ok((await transitionPlan(ctx("marketing_manager", "business", store), "plan_1", "approved")).ok);

  const store2 = new InMemoryStrategyStore();
  store2.seed({ plans: [plan()] });
  const r = await transitionPlan(ctx("sales_rep", "business", store2), "plan_1", "approved");
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

// --- D3 campaign lifecycle --------------------------------------------------

test("a campaign with pending work cannot be completed", async () => {
  // Otherwise demand generation is marked done that never happened.
  const store = new InMemoryStrategyStore();
  store.seed({ campaigns: [campaign()], executions: [exec("done", "a"), exec("pending", "b")] });
  const r = await transitionCampaign(ctx("marketing_manager", "business", store), "camp_1", "completed");
  assert.equal(r.ok === false && r.violations[0].code, "executions_outstanding");
});

test("explicitly skipped work does not block completion", async () => {
  // Skipping is a decision; pending is an omission.
  const store = new InMemoryStrategyStore();
  store.seed({ campaigns: [campaign()], executions: [exec("done", "a"), exec("skipped", "b")] });
  assert.ok((await transitionCampaign(ctx("marketing_manager", "business", store), "camp_1", "completed")).ok);
});

test("a completed campaign is terminal", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ campaigns: [campaign({ status: "completed" })] });
  const r = await transitionCampaign(ctx("marketing_manager", "business", store), "camp_1", "running");
  assert.equal(r.ok === false && r.violations[0].code, "illegal_transition");
});

test("an inverted window is refused before the status even moves", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ campaigns: [campaign({ startsAt: AT, endsAt: new Date(AT.getTime() - 1) })] });
  const r = await transitionCampaign(ctx("marketing_manager", "business", store), "camp_1", "paused");
  assert.equal(r.ok === false && r.violations[0].code, "window_inverted");
});

// --- The join the whole product rests on ------------------------------------

test("campaign return is measured against WON revenue, not pipeline", async () => {
  // A campaign that generated unclosed pipeline has returned nothing yet, and
  // reporting it as if it had is how spend gets justified twice.
  const store = new InMemoryStrategyStore();
  store.seed({
    campaigns: [campaign({ budgetAmount: money(200_000) })],
    attributed: {
      [`${WS}|camp_1`]: [
        { id: "o1", amount: money(600_000), status: "won" },
        { id: "o2", amount: money(900_000), status: "open" },
        { id: "o3", amount: money(100_000), status: "lost" },
      ],
    },
  });
  const r = unwrap(await campaignReturn(ctx("marketing_manager", "business", store), "camp_1"));

  assert.equal(r.attributedCount, 3);
  assert.equal(r.wonCount, 1);
  assert.equal(r.attributedAmount.amount, 1_600_000, "everything attributed");
  assert.equal(r.wonAmount.amount, 600_000, "only the won subset");
  assert.equal(r.returnOnBudget, 3, "600k won against 200k budget");
});

test("no budget yields a null return rather than a divide by zero", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({
    campaigns: [campaign({ budgetAmount: null })],
    attributed: { [`${WS}|camp_1`]: [{ id: "o1", amount: money(500_000), status: "won" }] },
  });
  const r = unwrap(await campaignReturn(ctx("marketing_manager", "business", store), "camp_1"));
  assert.equal(r.returnOnBudget, null);
  assert.equal(r.wonAmount.amount, 500_000);
});

test("a campaign that produced nothing reports zeroes, not an error", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ campaigns: [campaign()] });
  const r = unwrap(await campaignReturn(ctx("marketing_manager", "business", store), "camp_1"));
  assert.equal(r.attributedCount, 0);
  assert.equal(r.wonAmount.amount, 0);
  assert.equal(r.returnOnBudget, 0);
});

test("campaign execution reporting is business-tier", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ campaigns: [campaign()] });
  const r = await campaignReturn(ctx("marketing_manager", "starter", store), "camp_1");
  assert.equal(r.ok === false && r.violations[0].code, "feature_not_in_tier");
});

test("campaigns never cross a workspace boundary", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ campaigns: [campaign({ workspaceId: "ws_other" })] });
  const r = await campaignReturn(ctx("marketing_manager", "business", store), "camp_1");
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});
