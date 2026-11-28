import { test } from "node:test";
import assert from "node:assert/strict";
import type { AttainmentAnalysis } from "./analysis-board";
import type { AnalysisDeal } from "../../domains/pipeline/lib/attainment-analysis";
import { customerGoalRows, customerGoalSummary } from "./goal-model";
import { dealDiagnosis } from "./deal-diagnosis";
import { matchesProjectFilter, personalCustomerGroups, personalPending } from "./personal-model";
import { periodPhase, targetProgress } from "./progress-model";

const deal = (over: Partial<AnalysisDeal> = {}): AnalysisDeal => ({
  id: "p1", opportunityNo: "OPP-1", name: "Renewal", accountId: "a", ownerSub: "rep", territoryId: "east",
  status: "open", stage: "qualification", forecastCategory: "pipeline", amount: { amount: 80, currency: "CNY" }, currency: "CNY",
  expectedCloseAt: "2026-12-01T00:00:00Z", closedAt: null, ...over,
});
const account = { id: "a", name: "Acme", accountNo: "ACC-1", ownerSub: "rep", status: "active", tier: "standard", regionId: "east" } as const;
function data(): AttainmentAnalysis {
  return {
    years: [2026], year: 2026, period: "Y2026", observedAt: "2026-11-28T12:00:00Z", currency: "CNY",
    dealState: "failed", accountState: "failed", review: {}, self: "rep", workspace: true, completeRoster: true,
    targets: [], revision: null, current: null, versions: [], regions: [], members: [], deals: [deal()], accounts: [account], history: [],
    actionResults: [], canVerifyAction: true, canPlan: true, canEditAccount: true, canForecast: true,
    focus: { rows: [], revision: null, closed: false },
  };
}
function focusRow(): NonNullable<AttainmentAnalysis["focus"]>["rows"][number] {
  const budget = { key: "budget", accountId: "a", name: "Acme", tier: "standard", period: "Y2026", metric: "revenue" as const,
    currency: "CNY", amount: "100.00", sourcePlanId: null, sourceReadAt: "2026-01-01", note: "" };
  return {
    ...account, coverage: { state: "unavailable" }, contacts: { state: "unavailable" }, unallocated: [], revenue: [],
    regions: [{ id: "east", name: "East", ownerSub: "rep" }, { id: "west", name: "West", ownerSub: "other" }],
    actions: [{ key: "action", accountId: "a", regionId: "east", targetKey: null, objective: "Verify the reference case", ownerSub: "rep", due: "2026-10-01", evidenceRefs: [] }],
    contributions: [
      { key: "c1", budgetKey: "budget", targetKey: "t1", regionId: "east", responsibility: "primary", amount: "40.00", budget, target: { key: "t1", period: "Y2026", metric: "revenue", currency: "CNY" } },
      { key: "c2", budgetKey: "budget", targetKey: "t2", regionId: "west", responsibility: "support", amount: "60.00", budget, target: { key: "t2", period: "Y2026", metric: "revenue", currency: "CNY" } },
    ],
  };
}
test("planned tiers keep actual configured amounts when actuals are unavailable", () => {
  const planned = targetProgress(null, { floor: 50, target: 90, stretch: 200 });
  assert.equal(planned.state, "unknown");
  assert.deepEqual(planned.scale?.marks.map((m) => m.value), [50, 90, 200]);
  assert.ok(planned.scale!.marks[2]!.position > 90 && planned.scale!.marks[2]!.position < 95);
});
test("zero and missing quotas never report attainment; settled shortfalls use a distinct tone", () => {
  assert.equal(targetProgress(0, { floor: null, target: 0, stretch: null }).state, "zeroTarget");
  assert.equal(targetProgress(90, null).state, "noTarget");
  assert.equal(targetProgress(30, { floor: 50, target: 90, stretch: null }, "ended").tone, "negative");
  assert.equal(targetProgress(30, { floor: 50, target: 90, stretch: null }).tone, "active");
  assert.equal(targetProgress(90, { floor: 50, target: 90, stretch: 120 }).state, "targetReached");
  assert.equal(targetProgress(130, { floor: 50, target: 90, stretch: 120 }).state, "stretchReached");
});
test("period boundaries use the observed data time", () => {
  assert.equal(periodPhase("2026Q1", "2026-04-01T00:00:00Z"), "ended");
  assert.equal(periodPhase("2026Q2", "2026-04-01T00:00:00Z"), "active");
  assert.equal(periodPhase("2026Q3", "2026-04-01T00:00:00Z"), "upcoming");
});
test("diagnosis uses structured conditions, includes overlapping issues and ignores suggestive names", () => {
  const d = deal({ name: "Missing budget and late close", forecastCategory: "commit", expectedCloseAt: "2026-10-01T00:00:00Z", amount: null });
  assert.deepEqual(dealDiagnosis(d, "2026-11-28", { exit: { total: 2, unmet: ["Review"], unknown: ["Buyer"] }, risk: false, score: null }).issues,
    ["delayed", "unpriced", "conditions", "missingBasis"]);
  assert.deepEqual(dealDiagnosis(deal({ name: d.name }), "2026-11-28").issues, []);
  assert.deepEqual(dealDiagnosis({ ...d, status: "won" }, "2026-11-28").issues, []);
});
test("missing-evidence filters include structured reviews even when another issue has priority", () => {
  const model = data(); model.deals = [deal({ expectedCloseAt: "2026-10-01T00:00:00Z" })];
  model.review = { p1: { exit: { total: 1, unmet: [], unknown: ["Buyer"] }, risk: false, score: null } };
  assert.equal(matchesProjectFilter(model.deals[0]!, model, "missingBasis"), true);
  assert.equal(matchesProjectFilter(model.deals[0]!, model, "delayed"), true);
});
test("customer budget identity is counted once across allocations, while the regional view uses its own allocation", () => {
  const model = data(); model.focus!.rows = [focusRow()];
  model.deals = [deal({ status: "won", stage: "won", closedAt: "2026-02-01T00:00:00Z", amount: { amount: 30, currency: "CNY" } }),
    deal({ id: "p2", status: "won", stage: "won", territoryId: "west", closedAt: "2026-02-01T00:00:00Z", amount: { amount: 50, currency: "CNY" } })];
  const company = customerGoalRows(model)[0]!.goals, east = customerGoalRows(model, "territory:east")[0]!.goals;
  assert.equal(company.length, 1); assert.equal(company[0]!.target, 100); assert.equal(company[0]!.actual, 80);
  assert.equal(east[0]!.target, 40); assert.equal(east[0]!.actual, 30);
  assert.equal(customerGoalRows(model, "territory:unseen").length, 0);
});
test("redacted global budgets are never reconstructed from hidden data", () => {
  const model = data(), row = focusRow();
  row.contributions = row.contributions.slice(0, 1).map((c) => ({ ...c, budget: { ...c.budget, amount: null } }));
  model.focus!.rows = [row];
  assert.equal(customerGoalRows(model)[0]!.goals[0]!.target, 40);
});
test("historical pipeline stays unknown and execution plans do not become attainment indicators", () => {
  const model = data(), row = focusRow();
  row.contributions = row.contributions.map((c) => ({ ...c, budget: { ...c.budget, period: "2026Q1", metric: "pipeline" } }));
  model.focus!.rows = [row];
  const goals = customerGoalRows(model)[0]!.goals;
  assert.equal(goals[0]!.actual, null); assert.equal(goals[0]!.state, "unverified");
  assert.equal(goals.length, 1);
  assert.equal(customerGoalSummary(model).total, 1);
  row.contributions = []; row.unallocated = [];
  assert.equal(customerGoalRows(model).length, 0);
  assert.equal(customerGoalSummary(model).accounts, 0);
  assert.equal(model.focus!.rows[0]!.actions.length, 1);
});
test("goal-only customers remain visible and collaborative projects remain separate", () => {
  const model = data(); model.focus!.rows = [focusRow()]; model.deals = [];
  assert.equal(personalCustomerGroups(model, "owner:rep", true).length, 1);
  model.deals = [deal(), deal({ id: "p2", ownerSub: "other" })];
  const group = personalCustomerGroups(model, "owner:rep", true)[0]!;
  assert.equal(group.owned.length, 1); assert.equal(group.other.length, 1);
});
test("personal pending counts owned projects once, goals independently, and never adds collaborative exposure", () => {
  const model = data(); model.focus!.rows = [focusRow()];
  model.deals = [deal({ expectedCloseAt: "2026-10-01T00:00:00Z", amount: null }), deal({ id: "p2", ownerSub: "other", expectedCloseAt: "2026-10-01T00:00:00Z" })];
  const summary = personalPending(model)!;
  assert.equal(summary.kinds.delayed, 1); assert.equal(summary.kinds.missingBasis, 0);
  assert.equal(summary.kinds.goals, 0); assert.equal(summary.total, 1);
  model.review = null; assert.equal(personalPending(model), null);
  model.review = {}; model.period = "2026Q1"; assert.equal(personalPending(model), null);
});
