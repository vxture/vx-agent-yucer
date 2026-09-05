import { test } from "node:test";
import assert from "node:assert/strict";
import { planMove, planRemoval } from "./lifecycle";

// The product roster's own rules: deletion and manual order.

test("allows deleting an unreferenced product, refuses a referenced one", () => {
  assert.equal(planRemoval({ lines: 0, solutionItems: 0 }).ok, true);
  const byLine = planRemoval({ lines: 2, solutionItems: 0 });
  assert.equal(!byLine.ok && byLine.violations[0]!.code, "product_in_use");
  const byItem = planRemoval({ lines: 0, solutionItems: 1 });
  assert.equal(!byItem.ok && byItem.violations[0]!.code, "product_in_use");
});

/** "A+ B- C+" -> rows in order; '+' marks the movable roster. */
const rows = (spec: string) =>
  spec.split(" ").map((t) => ({ id: t[0]!, movable: t.endsWith("+") }));

const order = (r: ReturnType<typeof planMove>) =>
  r.ok ? r.value.map((o) => o.id).join("") : r.violations[0]!.code;

test("swaps with the neighbour and renumbers densely", () => {
  const r = planMove(rows("A+ B+ C+"), "B", "up");
  assert.equal(order(r), "BAC");
  // Dense from 1 - this is what heals the all-zero order pre-0028 rows carry.
  assert.deepEqual(r.ok && r.value.map((o) => o.sortOrder), [1, 2, 3]);
});

test("skips over rows from the other roster", () => {
  // C moving up must land beside A (the row the user can SEE above it),
  // hopping the retired B - swapping with an invisible row would be a click
  // that changes nothing on screen.
  assert.equal(order(planMove(rows("A+ B- C+"), "C", "up")), "CBA");
});

test("refuses at the edges", () => {
  assert.equal(order(planMove(rows("A+ B+"), "A", "up")), "move_at_edge");
  assert.equal(order(planMove(rows("A+ B+"), "B", "down")), "move_at_edge");
  // The only movable row is at both edges at once.
  assert.equal(order(planMove(rows("A- B+ C-"), "B", "down")), "move_at_edge");
});

test("refuses an unknown or unmovable row", () => {
  assert.equal(order(planMove(rows("A+"), "Z", "up")), "not_found");
  assert.equal(order(planMove(rows("A+ B-"), "B", "up")), "not_movable");
});
