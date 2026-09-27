import { test } from "node:test";
import assert from "node:assert/strict";
import { priceLine, lineTotal, reconciles, byProduct, planPriceRemoval, listComparison } from "./pricing";
import type { PriceEntryRecord } from "../store";

const entry = (list: number, floor: number): PriceEntryRecord => ({
  id: "pe_1",
  workspaceId: "ws_1",
  productId: "prd_1",
  currency: "CNY",
  listPrice: list,
  floorPrice: floor,
  effectiveAt: new Date("2026-01-01T00:00:00Z"),
  supersedesId: null,
});

test("a price below the floor needs a signature", () => {
  const l = priceLine({ productId: "prd_1", quantity: 2, unitPrice: 80_000 }, entry(120_000, 90_000), "CNY");
  assert.equal(l.needsApproval, true);
  assert.equal(l.amount, 160_000);
});

test("a price at the floor does not - the floor is the last acceptable price", () => {
  const l = priceLine({ productId: "prd_1", quantity: 1, unitPrice: 90_000 }, entry(120_000, 90_000), "CNY");
  assert.equal(l.needsApproval, false);
});

// The distinction that keeps the flag meaningful.
test("an unpriced product is not a discount breach", () => {
  const l = priceLine({ productId: "prd_new", quantity: 1, unitPrice: 1 }, null, "CNY");
  assert.equal(l.needsApproval, false, "no floor and below floor are different states");
});

test("the header reconciles to its lines, and no lines is legal", () => {
  const lines = [{ amount: 160_000 }, { amount: 40_000 }];
  assert.equal(lineTotal(lines), 200_000);
  assert.equal(reconciles(200_000, lines), true);
  assert.equal(reconciles(199_000, lines), false, "a drifting header must be caught, not tolerated");
  // Legacy deals carry a header and no lines. That is the old shape, not a bug.
  assert.equal(reconciles(500_000, []), true);
  // Lines with no header is a mismatch: something priced the deal and lost it.
  assert.equal(reconciles(null, lines), false);
});

test("cents do not drift when lines are summed", () => {
  const l1 = priceLine({ productId: "a", quantity: 3, unitPrice: 33.335 }, null, "CNY");
  const l2 = priceLine({ productId: "b", quantity: 3, unitPrice: 33.335 }, null, "CNY");
  assert.equal(reconciles(lineTotal([l1, l2]), [l1, l2]), true);
});

test("rolling up by product is what the whole table is for", () => {
  const rolled = byProduct([
    { productId: "a", amount: 100, quantity: 1 },
    { productId: "b", amount: 250, quantity: 2 },
    { productId: "a", amount: 50, quantity: 1 },
  ]);
  assert.equal(rolled.get("a")!.amount, 150);
  assert.equal(rolled.get("a")!.lines, 2);
  assert.equal(rolled.get("b")!.quantity, 2);
});

// --- planPriceRemoval --------------------------------------------------------

test("the price in force is never deletable", () => {
  const r = planPriceRemoval({ inForce: true, signaturesOnFloor: 0 });
  assert.equal(!r.ok && r.violations[0]!.code, "price_in_force");
});

test("a superseded entry a signature cites is not deletable either", () => {
  const r = planPriceRemoval({ inForce: false, signaturesOnFloor: 2 });
  assert.equal(!r.ok && r.violations[0]!.code, "price_signed");
});

test("a superseded entry nothing leans on is deletable - the typo case", () => {
  assert.equal(planPriceRemoval({ inForce: false, signaturesOnFloor: 0 }).ok, true);
});

test("listComparison: values each line at its latest entry, like for like", () => {
  const at = (d: string) => new Date(d);
  const entry = (productId: string, currency: string, listPrice: number, effective: string) => ({
    id: `${productId}-${effective}`,
    workspaceId: "w",
    productId,
    currency,
    listPrice,
    floorPrice: listPrice / 2,
    effectiveAt: at(effective),
    supersedesId: null,
  });
  const entries = [entry("p1", "CNY", 100, "2026-01-01"), entry("p1", "CNY", 120, "2026-06-01"), entry("p2", "CNY", 50, "2026-01-01")];
  const r = listComparison(
    [
      { productId: "p1", currency: "CNY", quantity: 2, amount: 200 }, // list 240
      { productId: "p2", currency: "CNY", quantity: 4, amount: 160 }, // list 200
      { productId: "p3", currency: "CNY", quantity: 1, amount: 999 }, // no entry
    ],
    entries,
  );
  assert.equal(r.listAmount, 440);
  assert.equal(r.quotedOnListed, 360, "the unpriced line is left out of the quoted side too");
  assert.equal(r.unpriced, 1);
  assert.ok(Math.abs(r.discount! - (1 - 360 / 440)) < 1e-9);
});

test("listComparison: no listed line means no list total, not zero", () => {
  const r = listComparison([{ productId: "p9", currency: "USD", quantity: 1, amount: 10 }], []);
  assert.deepEqual(r, { listAmount: null, quotedOnListed: 0, unpriced: 1, discount: null });
});
