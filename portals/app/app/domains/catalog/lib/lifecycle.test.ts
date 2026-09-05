import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSystemStatus,
  mergeStatusVocab,
  planMove,
  planProductType,
  planRemoval,
  planStatusMove,
  planStatusRemoval,
  planStatusVocab,
  planTypeRemoval,
  type StatusVocabRow,
} from "./lifecycle";

const row = (over: Partial<StatusVocabRow> & { statusCode: string }): StatusVocabRow => ({
  id: `id_${over.statusCode}`,
  name: null,
  behavior: "active",
  sortOrder: 0,
  status: "active",
  ...over,
});

// --- planStatusMove ----------------------------------------------------------

const DEV = row({ statusCode: "in_development", behavior: "in_development" });
const ACTIVE = row({ statusCode: "active", behavior: "active" });
const RETIRED = row({ statusCode: "retired", behavior: "retired" });

test("launches, retires, reinstates and abandons", () => {
  const launch = planStatusMove(DEV, ACTIVE);
  assert.equal(launch.ok && launch.value, "active");
  assert.equal(planStatusMove(ACTIVE, RETIRED).ok, true);
  assert.equal(planStatusMove(RETIRED, ACTIVE).ok, true);
  assert.equal(planStatusMove(DEV, RETIRED).ok, true);
});

test("moves between same-behavior rows are legal relabelings", () => {
  const presale = row({ statusCode: "presale", behavior: "active" });
  assert.equal(planStatusMove(ACTIVE, presale).ok, true);
  assert.equal(planStatusMove(presale, ACTIVE).ok, true);
});

test("refuses a no-op and a disabled target with their own codes", () => {
  const same = planStatusMove(ACTIVE, ACTIVE);
  assert.equal(!same.ok && same.violations[0]!.code, "status_unchanged");
  const off = planStatusMove(ACTIVE, row({ statusCode: "presale", status: "retired" }));
  assert.equal(!off.ok && off.violations[0]!.code, "status_disabled");
});

test("never lets a row slide back into development BEHAVIOR", () => {
  // The quotable set must only shrink through the shelf, which is visible -
  // and the rule reads behavior, so a workspace-added dev status is just as
  // closed a door as the system one.
  const devish = row({ statusCode: "prototyping", behavior: "in_development" });
  for (const from of [ACTIVE, RETIRED]) {
    const r = planStatusMove(from, devish);
    assert.equal(!r.ok && r.violations[0]!.code, "development_is_birth_state");
  }
  // ...but dev-to-dev is a relabeling, not a slide back.
  assert.equal(planStatusMove(DEV, devish).ok, true);
});

// --- the vocabulary merge ----------------------------------------------------

test("mergeStatusVocab fills untouched system codes with virtual defaults", () => {
  const merged = mergeStatusVocab([row({ statusCode: "active", sortOrder: 2, name: "在售中" })]);
  assert.deepEqual(
    merged.map((r) => r.statusCode),
    ["in_development", "active", "retired"],
  );
  assert.equal(merged[0]!.id, null, "an untouched code is virtual");
  assert.equal(merged[1]!.name, "在售中", "the stored row wins");
});

test("isSystemStatus is exactly the three seeded codes", () => {
  assert.equal(isSystemStatus("active"), true);
  assert.equal(isSystemStatus("presale"), false);
});

// --- planStatusVocab ---------------------------------------------------------

test("an added status needs code, name and behavior", () => {
  const ok = planStatusVocab({ statusCode: " presale ", name: " 预售 ", behavior: "active", status: "active" });
  assert.equal(ok.ok && ok.value.statusCode, "presale");
  const noName = planStatusVocab({ statusCode: "presale", name: " ", behavior: "active", status: "active" });
  assert.equal(!noName.ok && noName.violations[0]!.code, "name_required");
  const noBehavior = planStatusVocab({ statusCode: "presale", name: "预售", behavior: "" as never, status: "active" });
  assert.equal(!noBehavior.ok && noBehavior.violations[0]!.code, "behavior_required");
});

test("a system row may clear its name back to the default", () => {
  const r = planStatusVocab({ statusCode: "active", name: "  ", behavior: "active", status: "active" });
  assert.equal(r.ok && r.value.name, null);
});

test("a system row's behavior is itself", () => {
  const r = planStatusVocab({ statusCode: "active", name: null, behavior: "retired", status: "active" });
  assert.equal(!r.ok && r.violations[0]!.code, "system_behavior_fixed");
});

test("selling and shelving are load-bearing; development may switch off", () => {
  for (const code of ["active", "retired"] as const) {
    const r = planStatusVocab({ statusCode: code, name: null, behavior: code, status: "retired" });
    assert.equal(!r.ok && r.violations[0]!.code, "status_load_bearing");
  }
  const dev = planStatusVocab({
    statusCode: "in_development",
    name: null,
    behavior: "in_development",
    status: "retired",
  });
  assert.equal(dev.ok, true);
});

// --- planStatusRemoval / planTypeRemoval ------------------------------------

test("system statuses never delete; added ones only when empty", () => {
  const sys = planStatusRemoval("active", 0);
  assert.equal(!sys.ok && sys.violations[0]!.code, "system_status");
  const carried = planStatusRemoval("presale", 2);
  assert.equal(!carried.ok && carried.violations[0]!.code, "status_in_use");
  assert.equal(planStatusRemoval("presale", 0).ok, true);
});

test("a type deletes only when nothing carries it", () => {
  const carried = planTypeRemoval(3);
  assert.equal(!carried.ok && carried.violations[0]!.code, "type_in_use");
  assert.equal(planTypeRemoval(0).ok, true);
});

// --- planRemoval (products) --------------------------------------------------

test("allows deleting an unreferenced product, refuses a referenced one", () => {
  assert.equal(planRemoval({ lines: 0, solutionItems: 0 }).ok, true);
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
