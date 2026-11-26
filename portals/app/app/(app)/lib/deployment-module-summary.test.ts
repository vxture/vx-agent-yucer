import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyContent } from "../../domains/planning/plan-model";
import type { FocusRow } from "../../domains/planning/focus-model";
import { salesPlanningModuleSummary, focusModuleSummary } from "./deployment-module-summary";

function content() {
  return emptyContent(2026, [
    { id: "east", divisionId: "e", code: "E", name: "East", provinces: [], included: true, ownerSub: null, reason: "" },
    { id: "west", divisionId: "w", code: "W", name: "West", provinces: [], included: false, ownerSub: null, reason: "Outside scope" },
  ], "CNY");
}

test("sales overview uses annual workspace revenue, excluding quarterly and regional allocations", () => {
  const c = content();
  const base = c.targets.find(t => t.metric === "revenue")!;
  c.targets = [
    { ...base, key: "annual", scope: "workspace", period: "Y2026", target: "100" },
    { ...base, key: "quarter", scope: "workspace", period: "2026Q1", target: "25" },
    { ...base, key: "regional", scope: "territory:east", period: "Y2026", target: "50" },
    { ...base, key: "customers", scope: "workspace", period: "Y2026", metric: "new_logo", currency: null, target: "3" },
  ];
  assert.deepEqual(salesPlanningModuleSummary(c), { revenue: "100", currency: "CNY", ambiguous: false, regions: 1, withoutOwner: 1 });
});

test("zero is an explicit target, while no annual target remains unknown", () => {
  const c = content();
  c.targets = c.targets.filter(t => t.scope === "workspace" && t.metric === "revenue" && t.period === "Y2026");
  c.targets[0].target = "0";
  c.regions[0].ownerSub = "owner";
  assert.deepEqual(salesPlanningModuleSummary(c), { revenue: "0", currency: "CNY", ambiguous: false, regions: 1, withoutOwner: 0 });
  c.targets = [];
  assert.equal(salesPlanningModuleSummary(c).revenue, null);
});

test("ambiguous or multi-currency annual targets are never silently chosen or summed", () => {
  const c = content(), base = c.targets.find(t => t.scope === "workspace" && t.metric === "revenue")!;
  c.targets = [{ ...base, target: "100" }, { ...base, key: "usd", currency: "USD", target: "200" }];
  assert.deepEqual(salesPlanningModuleSummary(c), { revenue: null, currency: null, ambiguous: true, regions: 1, withoutOwner: 1 });
  c.targets[1].currency = "CNY";
  assert.equal(salesPlanningModuleSummary(c).ambiguous, true);
});

function customer(id: string, state: "ready" | "denied" | "unavailable", amount: string | null, complete = true): FocusRow {
  return { id, name: id, accountNo: `ACC-${id}`, tier: "standard", ownerSub: null,
    contacts: { state: "ready", total: 0, first: null },
    regions: [], contributions: [], unallocated: [], actions: [],
    revenue: amount === null ? [] : [{ currency: "CNY", amount }],
    coverage: state === "ready" ? { state, keyPeople: 3, coveredRoles: complete ? 3 : 2, requiredRoles: 3, chains: 1, totalChains: 1, completeChains: complete ? 1 : 0, unreachableChains: complete ? 0 : 1 } : { state },
  };
}

test("customer summary deduplicates identity and retains explicit zero contributions", () => {
  const a = customer("a", "ready", "0");
  assert.deepEqual(focusModuleSummary([a, a, customer("b", "ready", null)]), { total: 2, missingRevenue: 1, attention: 1, unknown: 0 });
});

test("denied and unavailable relationship sources stay unknown rather than becoming business gaps", () => {
  assert.deepEqual(focusModuleSummary([
    customer("a", "denied", "50"), customer("b", "unavailable", "50"), customer("c", "ready", "50", false),
  ]), { total: 3, missingRevenue: 0, attention: 1, unknown: 2 });
});

test("an empty deployment is empty rather than complete", () => {
  assert.deepEqual(focusModuleSummary([]), { total: 0, missingRevenue: 0, attention: 0, unknown: 0 });
});
