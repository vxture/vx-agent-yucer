import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DEAL_SCORE_WEIGHTS, dealScore, dealScoreBand, planDealScoreWeights } from "./deal-score";

const all = (tone: "good" | "warn" | "bad") =>
  (["stage", "forecast", "chain", "commitment", "price"] as const).map((key) => ({ key, tone }));

test("a clean deal, criteria met and touched this week, scores 100", () => {
  const s = dealScore({ cells: all("good"), exit: { met: 3, total: 3 }, lastTouchDays: 3 });
  assert.equal(s.score, 100);
  assert.equal(s.primaryConcern, null);
});

test("every factor at its worst scores 0", () => {
  assert.equal(dealScore({ cells: all("bad"), exit: { met: 0, total: 3 }, lastTouchDays: null }).score, 0);
});

test("the weighted average, by hand: an unreached decision-maker is the largest loss", () => {
  const cells = all("good").map((c) =>
    c.key === "chain" ? { ...c, tone: "bad" as const } : c.key === "forecast" ? { ...c, tone: "warn" as const } : c,
  );
  const s = dealScore({ cells, exit: { met: 2, total: 3 }, lastTouchDays: 10 });
  // exit 66.7x20 + chain 0x20 + stage 100x15 + recency 100x15 + commitment 100x10 + forecast 50x10 + price 100x10, /100
  assert.equal(s.score, Math.round((66.667 * 20 + 0 + 1500 + 1500 + 1000 + 500 + 1000) / 100));
  assert.equal(s.primaryConcern?.factor, "chain");
});

test("no exit criteria: the factor is left out and its weight spread, not counted as met", () => {
  const s = dealScore({ cells: all("good"), exit: { met: 0, total: 0 }, lastTouchDays: 3 });
  assert.equal(s.score, 100);
  assert.ok(!s.contributions.some((c) => c.factor === "exit"));
  const half = dealScore({ cells: all("warn"), exit: null, lastTouchDays: 3 });
  // five cells at 50 (weight 65) + recency 100 (weight 15), over 80
  assert.equal(half.score, Math.round((50 * 65 + 100 * 15) / 80));
});

test("recency falls linearly from recent to quiet", () => {
  const p = DEFAULT_DEAL_SCORE_WEIGHTS;
  const only = { ...p, weights: { exit: 0, chain: 0, stage: 0, recency: 100, commitment: 0, forecast: 0, price: 0 } };
  const at = (d: number | null) => dealScore({ cells: [], exit: null, lastTouchDays: d }, only).score;
  assert.equal(at(14), 100);
  assert.equal(at(45), 0);
  assert.equal(at(Math.round((14 + 45) / 2)), 48);
  assert.equal(at(null), 0);
});

test("the workspace's weights move the number - the admin knobs are real", () => {
  const cells = all("good").map((c) => (c.key === "chain" ? { ...c, tone: "bad" as const } : c));
  const input = { cells, exit: null, lastTouchDays: 3 };
  const heavy = { ...DEFAULT_DEAL_SCORE_WEIGHTS, weights: { exit: 0, chain: 60, stage: 10, recency: 10, commitment: 10, forecast: 5, price: 5 } };
  assert.ok(dealScore(input, heavy).score < dealScore(input).score);
});

test("weights must add to 100, quiet must follow recent, watch sits inside 1-99", () => {
  const p = DEFAULT_DEAL_SCORE_WEIGHTS;
  assert.equal(planDealScoreWeights(p).ok, true);
  const r1 = planDealScoreWeights({ ...p, weights: { ...p.weights, exit: 30 } });
  assert.equal(r1.ok === false && r1.violations[0]!.code, "weights_not_100");
  const r2 = planDealScoreWeights({ ...p, quietDays: 14 });
  assert.equal(r2.ok === false && r2.violations[0]!.code, "quiet_not_after_recent");
  const r3 = planDealScoreWeights({ ...p, watchScore: 100 });
  assert.equal(r3.ok === false && r3.violations[0]!.code, "watch_out_of_range");
});

test("bands follow the health score's 40 / 70 lines", () => {
  assert.deepEqual([dealScoreBand(39), dealScoreBand(40), dealScoreBand(69), dealScoreBand(70)], ["bad", "warn", "warn", "good"]);
});
