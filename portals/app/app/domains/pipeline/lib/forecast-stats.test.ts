import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastStats, moreOptimistic, type ForecastStatsRow } from "./forecast-stats";

const row = (over: Partial<ForecastStatsRow> = {}): ForecastStatsRow => ({
  filed: "commit",
  suggested: "commit",
  agrees: true,
  amount: 100_000,
  ...over,
});

test("the categories rank least sure to most sure", () => {
  assert.equal(moreOptimistic("commit", "pipeline"), true);
  assert.equal(moreOptimistic("best_case", "commit"), false);
  assert.equal(moreOptimistic("commit", "commit"), false);
});

test("the primary cut is the category the deal is FILED at", () => {
  const s = forecastStats([
    row({ filed: "commit", amount: 300_000 }),
    row({ filed: "pipeline", amount: 100_000 }),
    row({ filed: "commit", amount: 200_000 }),
  ]);
  assert.deepEqual(
    s.byCategory.map((b) => [b.key, b.amount, b.count]),
    [
      ["pipeline", 100_000, 1],
      ["commit", 500_000, 2],
    ],
    "least sure first, and empty categories are dropped",
  );
});

// The cut this page exists for.
test("a disagreement is split by which way it goes", () => {
  const s = forecastStats([
    row({ filed: "commit", suggested: "pipeline", agrees: false, amount: 400_000 }),
    row({ filed: "pipeline", suggested: "commit", agrees: false, amount: 100_000 }),
  ]);
  assert.equal(s.optimistic.count, 1);
  assert.equal(s.optimistic.amount, 400_000, "filed surer than the rule - an inflated number");
  assert.equal(s.conservative.count, 1);
  assert.equal(s.conservative.amount, 100_000, "filed less sure - work going better than filed");
});

test("a settled deal has no opinion to disagree with", () => {
  const s = forecastStats([row({ filed: "closed", suggested: null, agrees: true })]);
  assert.equal(s.agreed.count, 1);
  assert.equal(s.optimistic.count, 0);
  assert.equal(s.conservative.count, 0);
});

test("agreement is counted, because it is the context a disagreement means anything against", () => {
  const s = forecastStats([
    row(),
    row(),
    row({ filed: "commit", suggested: "pipeline", agrees: false }),
  ]);
  assert.equal(s.agreed.count, 2);
  assert.equal(s.total, 3);
});

test("a deal with no amount still counts as a deal", () => {
  const s = forecastStats([row({ amount: null })]);
  assert.equal(s.agreed.count, 1);
  assert.equal(s.agreed.amount, 0, "it contributes a row, not a number nobody entered");
});

test("nothing at all is not a crash", () => {
  const s = forecastStats([]);
  assert.deepEqual(s.byCategory, []);
  assert.equal(s.total, 0);
  assert.equal(s.optimistic.count, 0);
});
