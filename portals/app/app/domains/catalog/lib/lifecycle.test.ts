import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planMove,
  planProductType,
  planRemoval,
  planStatusChange,
} from "./lifecycle";

// --- planStatusChange --------------------------------------------------------

test("launches, retires, reinstates and abandons", () => {
  const launch = planStatusChange("in_development", "active");
  assert.equal(launch.ok && launch.value, "active");
  assert.equal(planStatusChange("active", "retired").ok, true);
  assert.equal(planStatusChange("retired", "active").ok, true);
  assert.equal(planStatusChange("in_development", "retired").ok, true);
});

test("refuses a no-op with its own code", () => {
  const r = planStatusChange("active", "active");
  assert.equal(!r.ok && r.violations[0]!.code, "status_unchanged");
});

test("never lets a row slide back into development", () => {
  // The quotable set must only shrink through `retired`, which is visible - a
  // product silently back in development would vanish from quoting with no
  // record of the retirement decision.
  for (const from of ["active", "retired"] as const) {
    const r = planStatusChange(from, "in_development");
    assert.equal(!r.ok && r.violations[0]!.code, "development_is_birth_state");
  }
});

// --- planRemoval -------------------------------------------------------------

test("allows deleting an unreferenced product", () => {
  assert.equal(planRemoval({ lines: 0, solutionItems: 0 }).ok, true);
});

test("refuses while deal lines or solution items point at it", () => {
  const byLine = planRemoval({ lines: 2, solutionItems: 0 });
  assert.equal(!byLine.ok && byLine.violations[0]!.code, "product_in_use");
  const byItem = planRemoval({ lines: 0, solutionItems: 1 });
  assert.equal(!byItem.ok && byItem.violations[0]!.code, "product_in_use");
});

// --- planMove ----------------------------------------------------------------

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

// --- planProductType ---------------------------------------------------------

test("trims and accepts a code and a name", () => {
  const r = planProductType({ typeCode: " 平台 ", name: " 平台 ", status: "active" });
  assert.equal(r.ok && r.value.typeCode, "平台");
});

test("refuses a blank code or name", () => {
  assert.equal(planProductType({ typeCode: " ", name: "x", status: "active" }).ok, false);
  assert.equal(planProductType({ typeCode: "x", name: " ", status: "active" }).ok, false);
});
