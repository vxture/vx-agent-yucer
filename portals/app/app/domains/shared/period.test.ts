import assert from "node:assert/strict";
import { test } from "node:test";
import { periodRange, within } from "./period";

test("a quarter covers three months and stops before the next one starts", () => {
  const q = periodRange("2026Q3")!;
  assert.equal(q.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(q.end.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("the range is half-open, so a deal belongs to exactly one period", () => {
  const q3 = periodRange("2026Q3")!;
  const q4 = periodRange("2026Q4")!;
  const boundary = new Date("2026-10-01T00:00:00.000Z");
  assert.equal(within(q3, boundary), false, "the last instant of Q3 is Q4's first");
  assert.equal(within(q4, boundary), true);
});

test("months and years parse too", () => {
  assert.equal(periodRange("2026-02")!.end.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(periodRange("2026")!.end.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("an unknown convention is null, never a guessed range", () => {
  // A workspace's fiscal calendar is its own business. Inventing a range would
  // produce a count nobody could reproduce, which is worse than not counting.
  for (const bad of ["FY26H1", "Q3", "2026Q5", "2026-13", "", "next quarter"]) {
    assert.equal(periodRange(bad), null, bad);
  }
});

test("a null instant is inside nothing", () => {
  assert.equal(within(periodRange("2026Q3")!, null), false);
});
