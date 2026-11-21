import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyContent } from "../../domains/planning/plan-model";
import { companyAllocation, planningHref, planningRegionRows } from "./planning-workspace";
function fixture() {
  const c = emptyContent(2026, [{ id: "r", divisionId: "d", name: "East", code: "E", provinces: [], included: true, reason: "", ownerSub: "ops" }], "CNY");
  c.targets.find(t => t.scope === "workspace" && t.period === "Y2026")!.target = "100.01";
  const annual = c.targets.find(t => t.scope === "territory:r" && t.period === "Y2026")!;
  annual.target = "80.01";
  c.budgets = ["a", "a", "b"].map((accountId, i) => ({ key: `b${i}`, accountId, name: accountId, tier: "standard", period: i === 1 ? "2026Q1" : "Y2026", metric: "revenue", currency: "CNY", amount: "10", sourcePlanId: null, sourceReadAt: "2026-11-20T00:00:00Z", note: "" }));
  c.contributions = [{ key: "c", budgetKey: "b0", targetKey: annual.key, regionId: "r", responsibility: "primary", amount: "10.01" }, { key: "q", budgetKey: "b1", targetKey: "quarter", regionId: "r", responsibility: "primary", amount: "10" }];
  c.actions = ["a", "z", "z"].map((accountId, i) => ({ key: `a${i}`, regionId: "r", targetKey: null, accountId, objective: "call", ownerSub: "ops", due: "2026-12-01", evidenceRefs: [] }));
  return c;
}
test("region customers dedupe by UUID across budgets and action-only clients", () => {
  const row = planningRegionRows(fixture())[0];
  assert.equal(row.customers, 2);
  assert.equal(row.actions, 3);
  assert.equal(row.ownerSub, "ops");
});
test("annual support excludes quarter and other metric/currency contributions", () => {
  const c = fixture();
  c.contributions.push({ ...c.contributions[0], key: "other", budgetKey: "b2", amount: "999" });
  c.budgets[2].currency = "USD";
  const row = planningRegionRows(c)[0];
  assert.equal(row.supported, "10.01"); assert.equal(row.gap, "70.00");
});
test("missing support is unknown, explicit zero is zero, over-support remains negative", () => {
  const c = fixture(); c.contributions = [];
  assert.equal(planningRegionRows(c)[0].gap, null);
  c.contributions = [{ key: "c", budgetKey: "b0", targetKey: c.targets.find(t => t.scope === "territory:r" && t.period === "Y2026")!.key, regionId: "r", responsibility: "primary", amount: "0" }];
  assert.equal(planningRegionRows(c)[0].supported, "0.00");
  c.contributions[0].amount = "90";
  assert.equal(planningRegionRows(c)[0].gap, "-9.99");
});
test("company balance excludes nonparticipating regions and is exact to cents", () => {
  const c = fixture(); const target = c.targets.find(t => t.scope === "workspace" && t.period === "Y2026");
  assert.deepEqual(companyAllocation(c, target), { allocated: "80.01", unknown: 0, balance: "20.00" });
  c.regions[0].included = false;
  assert.equal(companyAllocation(c, target).allocated, "0.00");
});
test("unknown regions are identified separately from remaining known allocation", () => {
  const c = fixture(); const target = c.targets.find(t => t.scope === "workspace" && t.period === "Y2026");
  c.targets.find(t => t.scope === "territory:r" && t.period === "Y2026")!.currency = "USD";
  assert.deepEqual(companyAllocation(c, target), { allocated: "0.00", unknown: 1, balance: "100.01" });
});
test("planning links retain revision UUID, period and region without business code keys", () => {
  assert.equal(planningHref({ year: 2026, revision: "draft-uuid", region: "region-uuid", period: "2026Q2" }), "/planning?year=2026&revision=draft-uuid&region=region-uuid&period=2026Q2");
  assert.equal(planningHref({ year: 2026, revision: "current" }), "/planning?year=2026");
});

test("incomplete decimal input keeps allocation unknown without crashing the form", () => {
  const c = fixture(); const target = c.targets.find(t => t.scope === "workspace" && t.period === "Y2026");
  c.targets.find(t => t.scope === "territory:r" && t.period === "Y2026")!.target = "1.";
  assert.equal(companyAllocation(c, target).balance, "100.01");
  assert.equal(planningRegionRows(c)[0].gap, null);
});

test("allocation follows the selected metric and preserves zero and negative balances", () => {
  const c = fixture(); const revenue = c.targets.find(t => t.scope === "workspace")!;
  const count = { ...revenue, key: "count", metric: "new_logo" as const, currency: null, target: "20" };
  c.targets.push(count, { ...count, key: "regional-count", scope: "territory:r", target: "5" });
  assert.deepEqual(companyAllocation(c, count), { allocated: "5.00", unknown: 0, balance: "15.00" });
  revenue.target = "0"; assert.equal(companyAllocation(c, revenue).balance, "-80.01");
  revenue.target = null; assert.equal(companyAllocation(c, revenue).balance, null);
  c.targets = c.targets.filter(t => t.key !== "regional-count");
  assert.deepEqual(companyAllocation(c, count), { allocated: "0.00", unknown: 1, balance: "20.00" });
});
