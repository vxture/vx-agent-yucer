import { test } from "node:test";
import assert from "node:assert/strict";
import { priceLine, lineTotal, reconciles, byProduct, planPrice, planPriceRemoval, listComparison, concessionSheet } from "./pricing";
import type { PriceEntryRecord } from "../store";

const entry = (list: number, floor: number): PriceEntryRecord => ({
  id: "pe_1",
  workspaceId: "ws_1",
  productId: "prd_1",
  currency: "CNY",
  listPrice: list,
  floorPrice: floor,
  minPrice: null,
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

// --- planPrice: the three prices (incr/0099) ----------------------------------

const draft = (list: number, floor: number, min: number | null) => ({
  productId: "prd_1",
  currency: "CNY",
  listPrice: list,
  floorPrice: floor,
  minPrice: min,
  effectiveAt: new Date("2026-01-01T00:00:00Z"),
});

test("planPrice: a new price must carry a 保底价 (owner: 新设价必填)", () => {
  const r = planPrice(draft(1000, 800, null));
  assert.equal(r.ok === false && r.violations[0].code, "min_price_required");
});

test("planPrice: 保底价 above 审批价 is refused - the signature would be unreachable", () => {
  const r = planPrice(draft(1000, 800, 801));
  assert.equal(r.ok === false && r.violations[0].code, "min_above_floor");
});

test("planPrice: min <= floor <= list is accepted, equality included", () => {
  assert.equal(planPrice(draft(1000, 800, 600)).ok, true);
  assert.equal(planPrice(draft(1000, 1000, 1000)).ok, true, "not discountable at all is a stance");
});

test("planPrice: a negative 保底价 is refused", () => {
  const r = planPrice(draft(1000, 800, -1));
  assert.equal(r.ok === false && r.violations[0].code, "amount_negative");
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
    minPrice: null,
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

test("concessionSheet (让价对照): each line against list and floor, and the deal's concession in total", () => {
  const at = new Date("2026-01-01T00:00:00Z");
  const e = (productId: string, list: number, floor: number): PriceEntryRecord => ({
    id: `pe_${productId}`, workspaceId: "ws", productId, currency: "CNY", listPrice: list, floorPrice: floor, minPrice: null, effectiveAt: at, supersedesId: null,
  });
  const line = (productId: string, quantity: number, unitPrice: number, needsApproval = false, approved = false) => ({
    productId, currency: "CNY", quantity, unitPrice, amount: quantity * unitPrice, needsApproval, approved,
  });
  const r = concessionSheet(
    [line("a", 2, 900), line("b", 1, 600, true, false), line("c", 3, 50)],
    [e("a", 1000, 800), e("b", 1000, 700)],
  );
  // a: 100 under list, above floor; b: 100 under its floor; c: never priced.
  assert.deepEqual(r.rows.map((x) => [x.productId, x.listPrice, x.floorPrice, x.belowFloor]), [
    ["a", 1000, 800, 0],
    ["b", 1000, 700, 100],
    ["c", null, null, 0],
  ]);
  // Totals over the priced lines only: list 3000, quoted 2400.
  assert.equal(r.listAmount, 3000);
  assert.equal(r.concession, 600);
  assert.equal(r.rate, 0.2);
  assert.equal(r.unpriced, 1);
  // Nothing priced: no total rather than a zero.
  const none = concessionSheet([line("c", 1, 10)], []);
  assert.equal(none.listAmount, null);
  assert.equal(none.rate, null);
});
