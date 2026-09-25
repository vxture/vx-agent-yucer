// 商机评估分 (owner, 2026-09-25: 我需要一个评估数字，不是把态势内容又列一遍；
// 100分，设计一套加权计算逻辑，参数调整放到admin板块).
//
// A 0-100 WEIGHTED AVERAGE of seven factors, each itself 0-100, read off facts
// the deal page already derives - the five rule verdicts of 态势判决, the
// stage's exit check, and how recently anyone touched the deal. The weights
// and the three scoring knobs are the workspace's own (incr/0091), edited in
// /admin/opportunity; the shipped defaults are below and in the DDL.
//
// OWNER RULING over the design package's ADR-038 (态势研判给档位不给分数): the
// deal carries a number. What ADR-038 guarded against still holds (YC-063, no
// black box): every factor is a rule the page shows, the formula is a
// weighted average anyone can redo by hand, and the largest loss is named.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import type { BriefCell, BriefTone } from "./brief";

export const DEAL_SCORE_FACTORS = ["exit", "chain", "stage", "recency", "commitment", "forecast", "price"] as const;
export type DealScoreFactor = (typeof DEAL_SCORE_FACTORS)[number];

export interface DealScoreWeights {
  /** Per factor, 0-100; together exactly 100. */
  readonly weights: Readonly<Record<DealScoreFactor, number>>;
  /** What a 关注 verdict scores (稳 = 100, 风险 = 0). 1-99. */
  readonly watchScore: number;
  /** Touched within this many days = 100 for 互动新鲜度. */
  readonly recentDays: number;
  /** Quiet this long or longer = 0; linear in between. Above recentDays. */
  readonly quietDays: number;
}

export const DEFAULT_DEAL_SCORE_WEIGHTS: DealScoreWeights = {
  weights: { exit: 20, chain: 20, stage: 15, recency: 15, commitment: 10, forecast: 10, price: 10 },
  watchScore: 50,
  recentDays: 14,
  quietDays: 45,
};

/** Display bands - the same 40 / 70 lines the customer health score uses. */
export function dealScoreBand(score: number): "good" | "warn" | "bad" {
  return score >= 70 ? "good" : score >= 40 ? "warn" : "bad";
}

export function planDealScoreWeights(input: DealScoreWeights): RuleResult<DealScoreWeights> {
  const whole = (n: number) => Number.isInteger(n);
  for (const f of DEAL_SCORE_FACTORS) {
    const w = input.weights[f];
    if (!whole(w) || w < 0 || w > 100) return fail(violation("weight_out_of_range", `${f} weight sits between 0 and 100`, f));
  }
  const sum = DEAL_SCORE_FACTORS.reduce((n, f) => n + input.weights[f], 0);
  if (sum !== 100) return fail(violation("weights_not_100", `weights add up to ${sum}, not 100`, "weights"));
  if (!whole(input.watchScore) || input.watchScore < 1 || input.watchScore > 99) {
    return fail(violation("watch_out_of_range", "a watch verdict scores between 1 and 99", "watchScore"));
  }
  if (!whole(input.recentDays) || input.recentDays < 1 || input.recentDays > 365) {
    return fail(violation("recent_out_of_range", "recent runs from 1 to 365 days", "recentDays"));
  }
  if (!whole(input.quietDays) || input.quietDays <= input.recentDays || input.quietDays > 365) {
    return fail(violation("quiet_not_after_recent", "quiet has to come after recent, within 365 days", "quietDays"));
  }
  return ok(input);
}

export interface DealScoreContribution {
  readonly factor: DealScoreFactor;
  /** The factor's own 0-100. */
  readonly value: number;
  readonly weight: number;
  /** Points it cost against a perfect score, after reweighting. */
  readonly lost: number;
}

export interface DealScore {
  readonly score: number;
  readonly contributions: readonly DealScoreContribution[];
  /** The factor that cost the most, or null when nothing cost anything. */
  readonly primaryConcern: DealScoreContribution | null;
}

export function dealScore(
  input: {
    readonly cells: readonly Pick<BriefCell, "key" | "tone">[];
    /** This stage's exit check; null or total 0 = the factor is left out. */
    readonly exit: { readonly met: number; readonly total: number } | null;
    /** Days since the last touch on this deal; null = never touched. */
    readonly lastTouchDays: number | null;
  },
  params: DealScoreWeights = DEFAULT_DEAL_SCORE_WEIGHTS,
): DealScore {
  const toneScore = (t: BriefTone) => (t === "good" ? 100 : t === "warn" ? params.watchScore : 0);
  const values: Partial<Record<DealScoreFactor, number>> = {};
  if (input.exit && input.exit.total > 0) values.exit = (100 * input.exit.met) / input.exit.total;
  for (const c of input.cells) values[c.key] = toneScore(c.tone);
  const d = input.lastTouchDays;
  values.recency =
    d === null
      ? 0
      : d <= params.recentDays
        ? 100
        : d >= params.quietDays
          ? 0
          : (100 * (params.quietDays - d)) / (params.quietDays - params.recentDays);

  // A factor with nothing to read (no criteria on this stage) is left out and
  // its weight spread over the rest - never counted as met, never as failed.
  const present = DEAL_SCORE_FACTORS.filter((f) => values[f] !== undefined && params.weights[f] > 0);
  const total = present.reduce((n, f) => n + params.weights[f], 0);
  if (total === 0) return { score: 0, contributions: [], primaryConcern: null };
  const contributions = present.map((f) => {
    const value = values[f]!;
    const weight = params.weights[f];
    return { factor: f, value: Math.round(value), weight, lost: ((100 - value) * weight) / total };
  });
  const score = Math.round(contributions.reduce((n, c) => n + (c.value * c.weight) / total, 0));
  const worst = [...contributions].filter((c) => c.lost > 0).sort((a, b) => b.lost - a.lost)[0] ?? null;
  return { score: Math.min(100, Math.max(0, score)), contributions, primaryConcern: worst };
}
