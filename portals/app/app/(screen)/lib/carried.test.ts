import { test } from "node:test";
import assert from "node:assert/strict";
import { carriedPath, carryForward, railX } from "./carried";

const id = (v: number) => v;

test("a gap carries the last reading and is marked as carried", () => {
  const c = carryForward([0.5, null, null, 0.8]);
  assert.deepEqual([...c.pts], [0.5, 0.5, 0.5, 0.8]);
  assert.deepEqual([...c.real], [true, false, false, true]);
  assert.equal(c.first, 0);
});

test("a leading gap is not a zero: the line starts at the first reading", () => {
  // Nothing was measured on days 0-1. Drawing them at 0 would say the humans
  // rejected everything before anyone proposed anything.
  const c = carryForward([null, null, 0.6, null]);
  assert.equal(c.first, 2);
  assert.equal(carriedPath(c, id, id), "M2 0.6 L3 0.6");
});

test("nothing measured: no line at all, every readout a dash", () => {
  const c = carryForward([null, null, null]);
  assert.equal(c.first, -1);
  assert.equal(carriedPath(c, id, id), "");
  assert.deepEqual([...c.real], [false, false, false]);
});

test("an empty series is an empty chart, not a crash", () => {
  const c = carryForward([]);
  assert.equal(c.first, -1);
  assert.equal(carriedPath(c, id, id), "");
});

test("a single point sits at the end of the rail rather than dividing by zero", () => {
  assert.equal(railX(0, 1, 328), 328);
  assert.equal(railX(0, 2, 328), 0);
  assert.equal(railX(1, 2, 328), 328);
  assert.ok(Number.isFinite(railX(0, 1, 328)));
});
