import { test } from "node:test";
import assert from "node:assert/strict";
import { marketModuleSummary, productModuleSummary, solutionModuleSummary, strategyModuleSummary } from "./planning-module-summary";
import { inForceByProduct } from "../../domains/catalog/lib/pricing";
import { solutionPricingFacts } from "./solution-prices";
import type { StrategyAdoption } from "../../domains/planning/strategy-adoption";
import type { PriceEntryRecord } from "../../domains/catalog/store";
import type { MarketView } from "./market-strategy";

const publication = { id: "v1", lineageId: "strategy", versionNo: 1, status: "active" as const, period: "Y2027" };
const handoff: StrategyAdoption = { strategyId: "v1", lineageId: "strategy", strategyVersion: 1,
  state: "current", year: 2027, revisionId: "sales-v1", planVersion: 1 };

test("strategy summary keeps the latest publication beside its draft and requires adoption of that version", () => {
  const plans = [publication, { ...publication, id: "v2", versionNo: 2 },
    { ...publication, id: "draft", versionNo: null, status: "draft" as const },
    { ...publication, id: "closed", lineageId: "closed", status: "closed" as const },
    { ...publication, id: "foreign-period", lineageId: "other", period: "Y2026" }];
  assert.deepEqual(strategyModuleSummary(plans, "Y2027", { state: "ready", rows: [handoff] }),
    { active: 1, published: 1, accepted: 0, draft: 1 });
  const current = { ...handoff, strategyId: "v2", strategyVersion: 2 };
  assert.equal(strategyModuleSummary(plans, "Y2027", { state: "ready", rows: [current, current] })?.accepted, 1);
  assert.equal(strategyModuleSummary(plans, "", { state: "ready", rows: [] })?.active, 2);
});

test("scheduled or draft acceptance is not effective adoption and unreadable adoption is unknown", () => {
  for (const state of ["scheduled", "draft", "closed"] as const) {
    assert.equal(strategyModuleSummary([publication], "", { state: "ready", rows: [{ ...handoff, state }] })?.accepted, 0);
  }
  for (const state of ["restricted", "unavailable"] as const) {
    assert.equal(strategyModuleSummary([publication], "", { state })?.accepted, null);
  }
  assert.equal(strategyModuleSummary(null, "", { state: "ready", rows: [] }), null);
  assert.deepEqual(strategyModuleSummary([], "", { state: "ready", rows: [] }), { active: 0, published: 0, accepted: 0, draft: 0 });
});

function customer(id: string, match: NonNullable<MarketView["customers"]>[number]["match"] = "match") {
  return { id, name: id, accountNo: id, industry: null, region: null, customerSize: null, segmentId: null, match, assigned: false };
}

test("market coverage deduplicates actual matches and ignores incomplete profiles and paused markets", () => {
  const markets = [
    { status: "active" as const, customers: [customer("a"), customer("b"), customer("unknown", "missing")], productIds: ["p"] },
    { status: "active" as const, customers: [customer("a"), customer("c")], solutionIds: ["s"] },
    { status: "active" as const, customers: [], productIds: [], solutionIds: [] },
    { status: "paused" as const, customers: [customer("hidden")] },
  ];
  assert.deepEqual(marketModuleSummary(markets), { active: 3, matched: 3, withoutOfferings: 1 });
  assert.equal(marketModuleSummary([...markets, { status: "active", customers: null }])?.matched, null);
  assert.equal(marketModuleSummary(null), null);
});

test("solution preparation counts each active gap once without requiring optional-item prices", () => {
  const item = (productId: string, optional = false) => ({ productId, optional, quantity: 1 });
  const solutions = [
    { solution: { id: "ready", status: "active" }, items: [item("a"), item("b", true)] },
    { solution: { id: "unpriced", status: "active" }, items: [item("b"), item("b")] },
    { solution: { id: "missing", status: "active" }, items: [item("missing")] },
    { solution: { id: "empty", status: "active" }, items: [item("b", true)] },
    { solution: { id: "retired", status: "retired" }, items: [item("c")] },
  ];
  const prices = new Map([["a", { listPrice: 0, floorPrice: null, minPrice: null }]]);
  const facts = Object.fromEntries(solutions.map(s => [s.solution.id, solutionPricingFacts(s.items, new Map(), [], prices)]));
  assert.deepEqual(solutionModuleSummary(solutions, [{ id: "a" }, { id: "b" }, { id: "c" }], facts, true, true),
    { active: 4, covered: 2, unready: 3 });
  assert.equal(solutionModuleSummary(solutions, [], facts, false, true)?.unready, null);
  assert.equal(solutionModuleSummary([], [], {}, true, false), null);
});

test("product price coverage uses current currency and effective time; valid zero prices count", () => {
  const products = ["zero", "future", "foreign", "development"].map(id => ({ id, statusId: id === "development" ? "dev" : "sale" }));
  const statuses = [{ id: "sale", statusCode: "active", name: "Renamed status" }, { id: "dev", statusCode: "in_development" }];
  const price = (productId: string, currency: string, effectiveAt: string): PriceEntryRecord => ({ id: productId,
    workspaceId: "w", productId, currency, effectiveAt: new Date(effectiveAt), listPrice: 0, floorPrice: 0, minPrice: 0, supersedesId: null });
  const current = inForceByProduct([price("zero", "CNY", "2026-11-01"), price("future", "CNY", "2027-01-01"),
    price("foreign", "USD", "2026-11-01")], "CNY", Date.parse("2026-11-26"));
  assert.deepEqual(productModuleSummary(products, statuses, current, true, true), { active: 3, development: 1, priced: 1 });
  assert.equal(productModuleSummary(products, statuses, current, true, false)?.priced, null);
  assert.equal(productModuleSummary(products, statuses, current, false, true), null);
  assert.equal(productModuleSummary(products, [], current, true, true), null);
});
