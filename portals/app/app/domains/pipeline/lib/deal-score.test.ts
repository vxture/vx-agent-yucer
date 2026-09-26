import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DEAL_SCORE_WEIGHTS,
  dealScore,
  dealScoreBand,
  dimensionIndicators,
  planDealScoreWeights,
  type DealFacts,
} from "./deal-score";

// 商机评估 - five dimensions, one set everywhere (owner 2026-09-25/26).

const clean: DealFacts = {
  slots: { pain: true, metrics: true, statusQuo: false, decisionProcess: true },
  budgetKnown: true,
  people: [
    { role: "economic", stance: "supporter", lastDays: 5 },
    { role: "coach", stance: "champion", lastDays: 2 },
  ],
  rivalMentions: 0,
  lastTouchDays: 3,
  theirOverdue: { count: 0, maxDays: 0 },
  hasNextStep: true,
  exit: { met: 3, total: 3 },
  stall: "good",
  stalledDays: 4,
  slips: 0,
  closeDatePassed: false,
  pendingApprovals: 0,
  open: true,
};

const dim = (s: ReturnType<typeof dealScore>, d: string) => s.dimensions.find((x) => x.dimension === d)!;

test("a clean deal scores 100; 竞争位置 with nothing on file is 未知 and leaves the total", () => {
  const s = dealScore(clean);
  assert.equal(s.score, 100);
  assert.equal(dim(s, "competition").score, null);
  assert.equal(dim(s, "competition").gap?.code, "rivalUnknown");
  assert.equal(s.primaryConcern, null);
});

test("each dimension is the mean of its known indicators; its gap is the worst one", () => {
  const s = dealScore({
    ...clean,
    slots: { ...clean.slots, metrics: false },
    people: [{ role: "economic", stance: null, lastDays: null }],
  });
  // 需求价值: pain 100, metrics 50, budget 100, statusQuo 100 -> 88
  assert.equal(dim(s, "value").score, 88);
  assert.equal(dim(s, "value").gap?.code, "metrics");
  // 买方共识: economic not reached 50, no coach 50, no opposition 100, one person 50, process 100 -> 70
  assert.equal(dim(s, "consensus").score, 70);
  assert.equal(dim(s, "consensus").gap?.code, "reachEconomic");
});

test("the total is the weighted mean of known dimensions, reweighted over what is known", () => {
  const s = dealScore({ ...clean, people: [], lastTouchDays: 50 });
  const d = (k: string) => dim(s, k).score!;
  const w = DEFAULT_DEAL_SCORE_WEIGHTS.weights;
  // competition is unknown; the other four share 90 points of weight
  const expected = Math.round((d("value") * w.value + d("consensus") * w.consensus + d("engagement") * w.engagement + d("progress") * w.progress) / 90);
  assert.equal(s.score, expected);
  assert.equal(s.primaryConcern?.dimension, "consensus", "no economic buyer, no coach, nobody on the deal costs the most");
});

test("互动热度: recent is 稳, between recent and quiet is 关注, beyond is 风险, never touched is 风险", () => {
  const tone = (lastTouchDays: number | null) => dimensionIndicators({ ...clean, lastTouchDays }).engagement[0]!.tone;
  assert.deepEqual([tone(14), tone(20), tone(45), tone(null)], ["good", "warn", "bad", "bad"]);
});

test("推进节奏: exit gaps, stall, slips, no next step and approvals each count", () => {
  const s = dealScore({ ...clean, exit: { met: 1, total: 3 }, stall: "bad", stalledDays: 60, slips: 2, hasNextStep: false, pendingApprovals: 1 });
  // exit 0, stall 0, close date 0, next step 50, approval 50 -> 20
  assert.equal(dim(s, "progress").score, 20);
  assert.equal(dealScoreBand(dim(s, "progress").score!), "bad");
});

test("a closed deal's 推进节奏 is 未知, not a failure", () => {
  assert.equal(dim(dealScore({ ...clean, open: false }), "progress").score, null);
});

test("an unreadable chain leaves 买方共识 未知", () => {
  assert.equal(dim(dealScore({ ...clean, people: null }), "consensus").score, null);
});

test("weights must add to 100, quiet must follow recent, watch sits inside 1-99", () => {
  const p = DEFAULT_DEAL_SCORE_WEIGHTS;
  assert.equal(planDealScoreWeights(p).ok, true);
  const r1 = planDealScoreWeights({ ...p, weights: { ...p.weights, value: 30 } });
  assert.equal(r1.ok === false && r1.violations[0]!.code, "weights_not_100");
  const r2 = planDealScoreWeights({ ...p, quietDays: 14 });
  assert.equal(r2.ok === false && r2.violations[0]!.code, "quiet_not_after_recent");
  const r3 = planDealScoreWeights({ ...p, watchScore: 100 });
  assert.equal(r3.ok === false && r3.violations[0]!.code, "watch_out_of_range");
});

test("bands follow the health score's 40 / 70 lines", () => {
  assert.deepEqual([dealScoreBand(39), dealScoreBand(40), dealScoreBand(69), dealScoreBand(70)], ["bad", "warn", "warn", "good"]);
});
