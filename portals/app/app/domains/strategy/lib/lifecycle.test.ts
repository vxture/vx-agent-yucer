import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import {
  planExecution,
  planNewPlan,
  CAMPAIGN_STATUSES,
  PLAN_STATUSES,
  canCompleteCampaign,
  executionProgress,
  planAcceptsNewWork,
  planCampaignTransition,
  planStrategyTransition,
  validateCampaignWindow,
  type CampaignStatus,
  type PlanStatus,
} from "./lifecycle";

const AT = new Date("2026-08-15T00:00:00Z");

// --- D1 strategy plan -------------------------------------------------------

test("a plan runs draft -> approved -> active -> closed -> archived", () => {
  assert.ok(planStrategyTransition({ status: "draft", approvedAt: null }, "approved").ok);
  assert.ok(planStrategyTransition({ status: "approved", approvedAt: AT }, "active").ok);
  assert.ok(planStrategyTransition({ status: "active", approvedAt: AT }, "closed").ok);
  assert.ok(planStrategyTransition({ status: "closed", approvedAt: AT }, "archived").ok);
});

test("approving stamps the approval moment, and later moves do not re-stamp it", () => {
  // approved_at answers "when was this signed off", not "when did it last change".
  const first = unwrap(planStrategyTransition({ status: "draft", approvedAt: null }, "approved", { at: AT }));
  assert.equal(first.approvedAt, AT);

  const back = unwrap(planStrategyTransition({ status: "approved", approvedAt: AT }, "draft"));
  assert.equal(back.approvedAt, undefined, "the original approval stamp is left alone");

  const again = unwrap(planStrategyTransition({ status: "draft", approvedAt: AT }, "approved"));
  assert.equal(again.approvedAt, undefined, "re-approving does not overwrite the first stamp");
});

test("an approved plan can be sent back for rework; a running one cannot", () => {
  assert.ok(planStrategyTransition({ status: "approved", approvedAt: AT }, "draft").ok);
  const r = planStrategyTransition({ status: "active", approvedAt: AT }, "draft");
  assert.equal(r.ok === false && r.violations[0].code, "illegal_transition");
});

test("a running plan ends by being closed, never by being archived directly", () => {
  const r = planStrategyTransition({ status: "active", approvedAt: AT }, "archived");
  assert.equal(r.ok, false);
});

test("archived is terminal", () => {
  for (const to of PLAN_STATUSES) {
    assert.equal(planStrategyTransition({ status: "archived", approvedAt: AT }, to).ok, false, to);
  }
});

test("a draft can be abandoned - it was never a commitment", () => {
  assert.ok(planStrategyTransition({ status: "draft", approvedAt: null }, "archived").ok);
});

test("only an active plan attracts new downstream work", () => {
  assert.equal(planAcceptsNewWork("active"), true);
  for (const s of PLAN_STATUSES.filter((x) => x !== "active")) {
    assert.equal(planAcceptsNewWork(s as PlanStatus), false, s);
  }
});

test("an unknown plan status is refused", () => {
  const r = planStrategyTransition({ status: "draft", approvedAt: null }, "cancelled" as PlanStatus);
  assert.equal(r.ok === false && r.violations[0].code, "unknown_status");
});

// --- D3 campaign ------------------------------------------------------------

const campaign = (status: CampaignStatus, startsAt: Date | null = AT) => ({ status, startsAt, endsAt: null });

test("a campaign runs draft -> scheduled -> running -> completed", () => {
  assert.ok(planCampaignTransition(campaign("draft"), "scheduled").ok);
  assert.ok(planCampaignTransition(campaign("scheduled"), "running").ok);
  assert.ok(planCampaignTransition(campaign("running"), "completed").ok);
});

test("scheduling requires a start time", () => {
  const r = planCampaignTransition(campaign("draft", null), "scheduled");
  assert.equal(r.ok === false && r.violations[0].code, "start_required");
});

test("running can pause and resume", () => {
  assert.ok(planCampaignTransition(campaign("running"), "paused").ok);
  assert.ok(planCampaignTransition(campaign("paused"), "running").ok);
});

test("completed and cancelled are both terminal and stay distinct", () => {
  // A campaign that ran and one that never did are different facts.
  for (const from of ["completed", "cancelled"] as CampaignStatus[]) {
    for (const to of CAMPAIGN_STATUSES) {
      assert.equal(planCampaignTransition(campaign(from), to).ok, false, `${from} -> ${to}`);
    }
  }
});

test("a campaign can be cancelled from any live state", () => {
  for (const from of ["draft", "scheduled", "running", "paused"] as CampaignStatus[]) {
    assert.ok(planCampaignTransition(campaign(from), "cancelled").ok, from);
  }
});

test("a campaign cannot end before it starts", () => {
  const r = validateCampaignWindow(AT, new Date(AT.getTime() - 1));
  assert.equal(r.ok === false && r.violations[0].code, "window_inverted");
  assert.ok(validateCampaignWindow(AT, AT).ok);
  assert.ok(validateCampaignWindow(null, null).ok);
  assert.ok(validateCampaignWindow(AT, null).ok);
});

// --- Execution progress -----------------------------------------------------

test("skipped work is counted separately from completed work", () => {
  // A campaign where half the outreach was skipped and one where all of it
  // landed have the same "nothing outstanding" state and different meanings.
  const p = executionProgress([{ status: "done" }, { status: "skipped" }, { status: "pending" }]);
  assert.equal(p.done, 1);
  assert.equal(p.skipped, 1);
  assert.equal(p.outstanding, 1);
  assert.ok(Math.abs(p.completionRatio! - 1 / 3) < 1e-9);
});

test("an empty campaign has a null ratio rather than a divide by zero", () => {
  assert.equal(executionProgress([]).completionRatio, null);
});

test("a campaign with outstanding work cannot be completed", () => {
  // Otherwise demand generation is marked done that never happened.
  const r = canCompleteCampaign([{ status: "done" }, { status: "in_progress" }]);
  assert.equal(r.ok === false && r.violations[0].code, "executions_outstanding");
});

test("explicitly skipped work does not block completion", () => {
  assert.ok(canCompleteCampaign([{ status: "done" }, { status: "skipped" }]).ok);
});

test("a campaign with no executions completes trivially", () => {
  assert.ok(canCompleteCampaign([]).ok);
});

// --- Creating a plan (TD-016) ------------------------------------------------

const planDraft = {
  planNo: "PLAN-2027H1",
  name: "Enterprise push",
  period: "2027H1",
  objective: "  ",
  ownerSub: null as string | null,
};

test("a plan needs a number, a name and a period", () => {
  for (const [field, over] of [
    ["plan_no_required", { planNo: "  " }],
    ["name_required", { name: " " }],
    ["period_required", { period: "" }],
  ] as const) {
    const r = planNewPlan({ ...planDraft, ...over });
    assert.equal(r.ok === false && r.violations[0].code, field);
  }
});

test("a period is required because every downstream reader joins on it", () => {
  // Targets carry a period, campaigns hang off a plan, and "which half-year is
  // this" is not derivable from anything else on the row.
  const r = planNewPlan({ ...planDraft, period: "   " });
  assert.equal(r.ok === false && r.violations[0].code, "period_required");
});

test("a new plan is ALWAYS a draft, and the status is not an input", () => {
  // planStrategyTransition owns every move after this, including the approval
  // that stamps approved_at. Starting at "approved" would be a way to reach
  // that state without the transition that records it - the same reason a
  // target starts as a draft and a deal starts at qualify.
  const t = unwrap(planNewPlan(planDraft));
  assert.equal(t.status, "draft");
});

test("blank optional text becomes null rather than an empty string", () => {
  assert.equal(unwrap(planNewPlan(planDraft)).objective, null);
});

test("the anchor and the name are trimmed", () => {
  const t = unwrap(planNewPlan({ ...planDraft, planNo: " PLAN-X ", name: " Push " }));
  assert.equal(t.planNo, "PLAN-X");
  assert.equal(t.name, "Push");
});

// --- Executions, the lock whose key did not exist (TD-016) -------------------

const execDraft = {
  id: null as string | null,
  title: "Webinar invite wave",
  actionType: "outreach" as const,
  assigneeSub: null as string | null,
  dueAt: null as Date | null,
  status: "pending" as const,
};

test("an execution needs a title", () => {
  const r = planExecution({ ...execDraft, title: "  " }, { status: "running" });
  assert.equal(r.ok === false && r.violations[0].code, "title_required");
});

test("the action type must be one the database will accept", () => {
  // chk_campaign_execution_action. The record's actionType was a bare `string`
  // until this batch, so a surface could offer a value Postgres refuses and
  // only the write would find out.
  const r = planExecution({ ...execDraft, actionType: "webinar" as never }, { status: "running" });
  assert.equal(r.ok === false && r.violations[0].code, "unknown_action_type");
});

test("a COMPLETED campaign's executions are frozen", () => {
  // The campaign was completed on the basis that nothing was outstanding.
  // Reopening an item afterwards makes that completion retroactively untrue,
  // and canCompleteCampaign is never consulted again to notice. The same reason
  // a closed deal's lines are the record of what was sold.
  const r = planExecution(execDraft, { status: "completed" });
  assert.equal(r.ok === false && r.violations[0].code, "campaign_completed");
});

test("a running campaign's executions are editable, including back to pending", () => {
  // Deliberately permissive between the open states: whether an item is done or
  // still going is the marketer's judgement, and the only thing the product
  // enforces is that outstanding items block completion.
  for (const status of ["pending", "in_progress", "done", "skipped"] as const) {
    assert.ok(planExecution({ ...execDraft, status }, { status: "running" }).ok, status);
  }
});

test("done and skipped both settle an item - that is what canCompleteCampaign counts", () => {
  // The pair that makes the campaign completable. Skipping is a real outcome,
  // not a failure to do the work: a webinar nobody signed up for is skipped,
  // and the campaign should still be able to close.
  assert.equal(canCompleteCampaign([{ status: "done" }, { status: "skipped" }]).ok, true);
  assert.equal(canCompleteCampaign([{ status: "done" }, { status: "pending" }]).ok, false);
  assert.equal(canCompleteCampaign([{ status: "in_progress" }]).ok, false);
});
