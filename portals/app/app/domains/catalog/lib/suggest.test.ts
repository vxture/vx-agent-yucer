import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestFloor, unpricedProducts } from "./suggest";
import { knownValues, suggestNextCode } from "../../shared/suggest";
import type { ProductRecord } from "../store";

// The form assistant's data half. Every function here has a REFUSAL built in -
// a case where the honest answer is "say nothing" - and those cases get the
// most tests, because a suggestion engine's failure mode is not wrong numbers,
// it is confident numbers with nothing behind them.

// --- suggestNextCode --------------------------------------------------------

test("continues the dominant series at its own width", () => {
  assert.equal(suggestNextCode(["PRD-001", "PRD-002", "PRD-007"]), "PRD-008");
});

test("two series: the bigger one is continued", () => {
  assert.equal(suggestNextCode(["A-1", "A-2", "A-3", "B-9"]), "A-4");
});

test("no convention, no suggestion", () => {
  // One conforming code is an example, not a convention.
  assert.equal(suggestNextCode(["alpha", "beta"]), null);
  assert.equal(suggestNextCode(["PRD-001"]), null);
  assert.equal(suggestNextCode([]), null);
});

test("width is preserved - a padded series stays padded", () => {
  assert.equal(suggestNextCode(["SKU0009", "SKU0010"]), "SKU0011");
});

// --- knownValues ------------------------------------------------------------

test("most-used first, blanks and nulls dropped", () => {
  assert.deepEqual(knownValues(["软件", null, "硬件", "软件", "  ", "软件", "硬件"]), ["软件", "硬件"]);
});

// --- suggestFloor -----------------------------------------------------------

test("median ratio of existing floors, applied and rounded", () => {
  const entries = [
    { listPrice: 100, floorPrice: 80 },
    { listPrice: 200, floorPrice: 180 }, // 0.9
    { listPrice: 1000, floorPrice: 850 }, // 0.85 - the median
  ];
  const r = suggestFloor(10_000, entries);
  assert.ok(r);
  assert.equal(r.ratioPct, 85);
  assert.equal(r.floor, 8_500);
});

test("one entry is an example, not a practice", () => {
  assert.equal(suggestFloor(10_000, [{ listPrice: 100, floorPrice: 80 }]), null);
});

test("a nonsensical list price gets silence, not arithmetic", () => {
  const entries = [
    { listPrice: 100, floorPrice: 80 },
    { listPrice: 100, floorPrice: 90 },
  ];
  assert.equal(suggestFloor(0, entries), null);
  assert.equal(suggestFloor(-5, entries), null);
  assert.equal(suggestFloor(Number.NaN, entries), null);
});

test("an entry with floor above list is data corruption, not evidence", () => {
  // The database CHECK should prevent it, but a suggestion engine that treats
  // corrupt rows as precedent would launder them into policy.
  const r = suggestFloor(1000, [
    { listPrice: 100, floorPrice: 150 },
    { listPrice: 100, floorPrice: 80 },
    { listPrice: 100, floorPrice: 90 },
  ]);
  assert.ok(r);
  assert.equal(r.ratioPct, 85, "the corrupt row must not have entered the median");
});

// --- unpricedProducts -------------------------------------------------------

test("on sale and unpriced only - a retired product is not a gap", () => {
  const p = (id: string, statusId: string): ProductRecord =>
    ({ id, statusId }) as ProductRecord;
  const out = unpricedProducts(
    [p("a", "st_active"), p("b", "st_active"), p("c", "st_retired")],
    [{ productId: "a" }],
    "st_active",
  );
  assert.deepEqual(out.map((x) => x.id), ["b"]);
});
