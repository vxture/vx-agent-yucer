import assert from "node:assert/strict";
import { test } from "node:test";
import { solutionPricingFacts } from "./solution-prices";
import { inForceByProduct } from "../../domains/catalog/lib/pricing";
import type { PriceEntryRecord } from "../../domains/catalog/store";

test("solution totals use actual tier prices and quantities, exclude optional items, and round cents", () => {
  const facts = solutionPricingFacts([
    { productId: "a", quantity: 2, optional: false },
    { productId: "b", quantity: 3, optional: false },
    { productId: "extra", quantity: 100, optional: true },
  ], new Map([["a", "software"], ["b", "service"], ["extra", "hardware"]]),
  ["hardware", "service", "software"], new Map([
    ["a", { listPrice: 100.01, floorPrice: 81, minPrice: 63 }],
    ["b", { listPrice: 0.1, floorPrice: 0.07, minPrice: 0.05 }],
    ["extra", { listPrice: 9999, floorPrice: 8888, minPrice: 7777 }],
  ]));
  assert.deepEqual(facts.typeIds, ["hardware", "service", "software"]);
  assert.deepEqual(facts.prices, { listPrice: 200.32, floorPrice: 162.21, minPrice: 126.15 });
  assert.deepEqual(facts.missing, { listPrice: 0, floorPrice: 0, minPrice: 0 });
});

test("legacy missing tiers and unpriced products stay explicit; zero is a real price", () => {
  const items = ["legacy", "free", "unknown"].map((productId) => ({ productId, quantity: 2, optional: false }));
  const facts = solutionPricingFacts(items, new Map(), [], new Map([
    ["legacy", { listPrice: 100, floorPrice: 60, minPrice: null }],
    ["free", { listPrice: 0, floorPrice: 0, minPrice: 0 }],
  ]));
  assert.deepEqual(facts.prices, { listPrice: 200, floorPrice: 120, minPrice: 0 });
  assert.deepEqual(facts.missing, { listPrice: 1, floorPrice: 1, minPrice: 2 });
  const absent = solutionPricingFacts(items, new Map(), [], new Map());
  assert.deepEqual(absent.prices, { listPrice: null, floorPrice: null, minPrice: null });
  assert.deepEqual(absent.missing, { listPrice: 3, floorPrice: 3, minPrice: 3 });
  const empty = solutionPricingFacts([], new Map(), [], new Map());
  assert.deepEqual(empty.prices, absent.prices);
  assert.deepEqual(empty.missing, { listPrice: 0, floorPrice: 0, minPrice: 0 });
});

test("solution totals resolve only the current default-currency product versions", () => {
  const entry = (id: string, at: string, currency: string, listPrice: number): PriceEntryRecord => ({
    id, productId: "p", workspaceId: "w", effectiveAt: new Date(at), currency,
    listPrice, floorPrice: listPrice * 0.8, minPrice: listPrice * 0.6, supersedesId: null,
  });
  const current = inForceByProduct([
    entry("old", "2026-01-01", "CNY", 10), entry("today", "2026-10-01", "CNY", 100),
    entry("future", "2026-12-01", "CNY", 200), entry("foreign", "2026-10-01", "USD", 300),
  ], "CNY", Date.parse("2026-11-10"));
  const facts = solutionPricingFacts([{ productId: "p", quantity: 2, optional: false }], new Map(), [], current);
  assert.deepEqual(facts.prices, { listPrice: 200, floorPrice: 160, minPrice: 120 });
});
