import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import {
  CAMPAIGN_STATUSES,
  PLAN_STATUSES,
  nextCampaignStatuses,
  nextPlanStatuses,
  planCampaignTransition,
  planStrategyTransition,
  type CampaignStatus,
  type PlanStatus,
} from "./lib/lifecycle";
import { InMemoryStrategyStore } from "./store";
import { transitionCampaign, transitionPlan, type StrategyContext } from "./service";
import { money } from "../shared/money";

// The moves a surface is allowed to offer.
//
// nextPlanStatuses / nextCampaignStatuses exist so a picker can show exactly the
// legal moves. That only helps if the two agree with the machine - a list that
// drifted from the transition map would either hide a move that works or offer
// one that cannot, and the second is worse because it teaches people the
// product refuses for reasons they cannot predict.

const WS = "ws_1";

function ctx(role: RoleCode, tier: Entitlement["tier"], store: InMemoryStrategyStore): StrategyContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

function planRow(status: PlanStatus) {
  return {
    id: "plan_1",
    workspaceId: WS,
    planNo: "PLAN-1",
    name: "Plan",
    period: "2026H2",
    objective: null,
    ownerSub: "usr_cro",
    status,
    approvedAt: null,
  };
}

function campaignRow(status: CampaignStatus) {
  return {
    id: "camp_1",
    workspaceId: WS,
    campaignNo: "CAMP-1",
    name: "Campaign",
    planId: null,
    segmentId: null,
    channel: "outbound",
    budgetAmount: money(1000, "CNY"),
    ownerSub: "usr_mkt",
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: new Date("2026-03-01T00:00:00Z"),
    status,
    currency: "CNY",
  };
}

// --- The offered list is exactly the legal list ----------------------------

test("every move a plan picker offers is one the machine accepts", () => {
  for (const from of PLAN_STATUSES) {
    for (const to of PLAN_STATUSES) {
      const offered = nextPlanStatuses(from).includes(to);
      const accepted = planStrategyTransition(planRow(from), to).ok;
      assert.equal(offered, accepted, `${from} -> ${to}: offered=${offered} accepted=${accepted}`);
    }
  }
});

test("every move a campaign picker offers is one the machine accepts", () => {
  for (const from of CAMPAIGN_STATUSES) {
    for (const to of CAMPAIGN_STATUSES) {
      const offered = nextCampaignStatuses(from).includes(to);
      const accepted = planCampaignTransition(campaignRow(from), to).ok;
      assert.equal(offered, accepted, `${from} -> ${to}: offered=${offered} accepted=${accepted}`);
    }
  }
});

test("a terminal record offers nothing, so the surface renders no control", () => {
  assert.deepEqual([...nextPlanStatuses("archived")], []);
  assert.deepEqual([...nextCampaignStatuses("completed")], []);
  assert.deepEqual([...nextCampaignStatuses("cancelled")], []);
});

test("no status ever offers a move to itself", () => {
  for (const s of PLAN_STATUSES) assert.equal(nextPlanStatuses(s).includes(s), false, `plan ${s}`);
  for (const s of CAMPAIGN_STATUSES) {
    assert.equal(nextCampaignStatuses(s).includes(s), false, `campaign ${s}`);
  }
});

// --- Through the service, the way the action calls it ----------------------

test("approving a plan stamps the approval and only once", () => {
  // approved_at answers "when was this signed off", not "when did it last
  // change", so a later move must not re-stamp it.
  const first = unwrap(planStrategyTransition(planRow("draft"), "approved"));
  assert.ok(first.approvedAt, "the moment of approval is recorded");

  const already = { ...planRow("approved"), approvedAt: new Date("2026-01-01T00:00:00Z") };
  const back = unwrap(planStrategyTransition(already, "draft"));
  assert.equal("approvedAt" in back, false, "an existing approval is left alone");
});

test("approving is a distinct ACTION but not yet a distinct permission", async () => {
  // Recorded as it actually is, not as it reads. strategy.plan.approve and
  // strategy.plan.update are separate action ids that both resolve to
  // strategy.write, so anyone who may edit a plan may also sign it off.
  //
  // Whether drafting and approving should require different permissions is a
  // role-catalog decision - it would move catalog.ts, the seed SQL and the
  // published role doc together - so this asserts today's behaviour rather than
  // quietly introducing a separation of duties nobody agreed to.
  const store = new InMemoryStrategyStore();
  store.seed({ plans: [planRow("draft")] });
  unwrap(await transitionPlan(ctx("marketing_manager", "business", store), "plan_1", "approved"));
  assert.equal((await store.getPlan(WS, "plan_1"))?.status, "approved");
});

test("a role without strategy.write cannot move a plan at all", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ plans: [planRow("draft")] });
  const r = await transitionPlan(ctx("sales_rep", "business", store), "plan_1", "approved");
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
  assert.equal((await store.getPlan(WS, "plan_1"))?.status, "draft", "nothing moved");
});

test("the plan lifecycle is a business-tier capability", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ plans: [planRow("draft")] });
  const r = await transitionPlan(ctx("sales_leader", "pro", store), "plan_1", "approved");
  assert.equal(r.ok, false);
  assert.equal((await store.getPlan(WS, "plan_1"))?.status, "draft");
});

test("a campaign with outstanding executions cannot be completed", async () => {
  // "We finished" and "we stopped looking" are different claims, and only one
  // belongs in an attribution report.
  const store = new InMemoryStrategyStore();
  store.seed({
    campaigns: [campaignRow("running")],
    executions: [
      { id: "e1", workspaceId: WS, campaignId: "camp_1", title: "a", actionType: "outreach", assigneeSub: null, dueAt: null, status: "done" },
      { id: "e2", workspaceId: WS, campaignId: "camp_1", title: "b", actionType: "outreach", assigneeSub: null, dueAt: null, status: "pending" },
    ],
  });

  const r = await transitionCampaign(ctx("marketing_manager", "business", store), "camp_1", "completed");
  assert.equal(r.ok === false && r.violations[0].code, "executions_outstanding");
  assert.equal((await store.getCampaign(WS, "camp_1"))?.status, "running");
});

test("a campaign whose executions are all settled completes", async () => {
  // Skipped counts as settled: a deliberate decision not to run something is an
  // answer, and requiring it to be marked done instead would push people to lie.
  const store = new InMemoryStrategyStore();
  store.seed({
    campaigns: [campaignRow("running")],
    executions: [
      { id: "e1", workspaceId: WS, campaignId: "camp_1", title: "a", actionType: "outreach", assigneeSub: null, dueAt: null, status: "done" },
      { id: "e2", workspaceId: WS, campaignId: "camp_1", title: "b", actionType: "outreach", assigneeSub: null, dueAt: null, status: "skipped" },
    ],
  });

  unwrap(await transitionCampaign(ctx("marketing_manager", "business", store), "camp_1", "completed"));
  assert.equal((await store.getCampaign(WS, "camp_1"))?.status, "completed");
});

test("a record in another workspace is not found rather than moved", async () => {
  const store = new InMemoryStrategyStore();
  store.seed({ plans: [{ ...planRow("draft"), workspaceId: "ws_other" }] });
  const r = await transitionPlan(ctx("sales_leader", "business", store), "plan_1", "approved");
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});
