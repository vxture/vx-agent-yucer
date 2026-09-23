import { test } from "node:test";
import assert from "node:assert/strict";
import type { HealthContribution } from "./health";
import { attributeChange, lastDifferent, snapshotAt, snapshotChanged, type HealthSnapshot } from "./health-history";

const c = (factor: HealthContribution["factor"], points: number, days = 0): HealthContribution => ({
  factor,
  points,
  reason: { code: "x", days } as unknown as HealthContribution["reason"],
});
const snap = (score: number, cs: HealthContribution[], iso: string): HealthSnapshot => ({
  score,
  contributions: cs,
  source: "sweep",
  computedAt: new Date(iso),
});

test("a reading is a new row only when the score or a factor's points moved", () => {
  const base = { score: 58, contributions: [c("recency", -5, 20), c("pipeline", 10)] };
  assert.equal(snapshotChanged(null, base), true, "the first reading is always kept");
  assert.equal(snapshotChanged(base, { ...base }), false);
  assert.equal(
    snapshotChanged(base, { score: 58, contributions: [c("recency", -5, 21), c("pipeline", 10)] }),
    false,
    "a reason's day count ticking is not a change",
  );
  assert.equal(snapshotChanged(base, { score: 58, contributions: [c("recency", -8), c("pipeline", 13)] }), true);
});

test("58 -> 34 is explained factor by factor, biggest move first", () => {
  const from = snap(58, [c("pipeline", 10), c("recency", -2), c("collections", 0)], "2026-09-01T00:00:00Z");
  const to = { score: 34, contributions: [c("pipeline", 10), c("recency", -10), c("collections", -16)] };
  const a = attributeChange(from, to);
  assert.deepEqual(
    a.moved.map((m) => [m.factor, m.delta]),
    [["collections", -16], ["recency", -8]],
  );
  assert.equal(a.moved.reduce((s, m) => s + m.delta, 0), 34 - 58, "the moves add up to the change");
});

test("the reading to explain against is the newest with a different score", () => {
  const rows = [
    snap(34, [], "2026-09-20T00:00:00Z"),
    snap(34, [], "2026-09-15T00:00:00Z"),
    snap(58, [], "2026-09-01T00:00:00Z"),
  ];
  assert.equal(lastDifferent(rows, 34)?.score, 58);
  assert.equal(lastDifferent(rows.slice(0, 2), 34), null, "nothing changed, nothing to explain");
});

test("the score in force at a moment is the newest at or before it", () => {
  const rows = [snap(34, [], "2026-09-20T00:00:00Z"), snap(58, [], "2026-09-01T00:00:00Z")];
  assert.equal(snapshotAt(rows, new Date("2026-09-10T00:00:00Z"))?.score, 58);
  assert.equal(snapshotAt(rows, new Date("2026-09-20T00:00:00Z"))?.score, 34);
  assert.equal(snapshotAt(rows, new Date("2026-08-01T00:00:00Z")), null);
});
