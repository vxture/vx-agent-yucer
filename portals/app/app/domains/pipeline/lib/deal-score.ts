// 商机评估 (owner, 2026-09-25/26). ONE set of five dimensions, the same on
// the deal page's cards, in the 0-100 商机评估分 and in /admin's weights:
//
//   需求价值  do they need it, and is it worth it     (YC-065 R4 意向与价值)
//   买方共识  can the buying side agree                (R4 买方共识)
//   竞争位置  why us and not someone else              (R4 竞争位置)
//   买方参与  are they still engaged                   (R4 买方参与)
//   成交推进  is the deal moving as it should          (R4 成交推进)
//
// The point (owner): a salesperson reads the five, sees the gap, knows the
// work - "约到经济决策人", not a rule's wording. So each dimension is scored
// from INDICATORS, each 稳 / 关注 / 风险 / 未知, and carries the worst
// indicator as its gap line (a code - the sentence is the page's, TD-010).
//
// Scoring: an indicator is 100 / watch score / 0; 未知 is left out, never
// counted as met or failed. A dimension is the mean of its known indicators;
// a dimension with none known is 未知 and leaves the total, its weight spread
// over the rest. The total is the weighted mean of the known dimensions.
//
// OWNER RULING over the design package's ADR-038 (态势研判给档位不给分数): the
// deal carries numbers. What ADR-038 guarded against still holds (YC-063, no
// black box): every indicator is a fact the page shows.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export const DEAL_DIMENSIONS = ["value", "consensus", "competition", "engagement", "progress"] as const;
export type DealDimension = (typeof DEAL_DIMENSIONS)[number];

export type IndicatorTone = "good" | "warn" | "bad" | "unknown";

/** One indicator's verdict. `gap` names the work when it is not 稳. */
export interface Indicator {
  readonly key: string;
  readonly tone: IndicatorTone;
  /** Message code for the gap line; params fill it. */
  readonly gap?: { readonly code: string; readonly n?: number };
}

export interface DealScoreWeights {
  /** Per dimension, 0-100; together exactly 100. */
  readonly weights: Readonly<Record<DealDimension, number>>;
  /** What a 关注 indicator scores (稳 = 100, 风险 = 0). 1-99. */
  readonly watchScore: number;
  /** Touched within this many days: 买方参与's contact indicator is 稳. */
  readonly recentDays: number;
  /** Quiet this long or longer: 风险; in between: 关注. Above recentDays. */
  readonly quietDays: number;
}

export const DEFAULT_DEAL_SCORE_WEIGHTS: DealScoreWeights = {
  weights: { value: 20, consensus: 25, competition: 10, engagement: 20, progress: 25 },
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
  for (const d of DEAL_DIMENSIONS) {
    const w = input.weights[d];
    if (!whole(w) || w < 0 || w > 100) return fail(violation("weight_out_of_range", `${d} weight sits between 0 and 100`, d));
  }
  const sum = DEAL_DIMENSIONS.reduce((n, d) => n + input.weights[d], 0);
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

// --- the facts each dimension reads -------------------------------------------------

export interface DealFacts {
  /** 购买证据槽 filled? (pain / metrics / status_quo / decision_process). */
  readonly slots: { readonly pain: boolean; readonly metrics: boolean; readonly statusQuo: boolean; readonly decisionProcess: boolean };
  readonly budgetKnown: boolean;
  /** People with a role on this deal. Null = the chain could not be read. */
  readonly people:
    | readonly {
        readonly role: string;
        readonly stance: string | null;
        /** Days since this person was last in a follow-up; null = never. */
        readonly lastDays: number | null;
      }[]
    | null;
  /** Follow-ups on this deal that name a rival. */
  readonly rivalMentions: number;
  /** Days since the last follow-up on this deal; null = never. */
  readonly lastTouchDays: number | null;
  /** Their open commitments: how many overdue, and the worst overdue days. */
  readonly theirOverdue: { readonly count: number; readonly maxDays: number };
  /** An open commitment (either side) dated in the future: a next step. */
  readonly hasNextStep: boolean;
  /** This stage's exit check; null or total 0 = none set. */
  readonly exit: { readonly met: number; readonly total: number } | null;
  /** The stall verdict (态势判决's 阶段 rule): good / warn / bad. */
  readonly stall: "good" | "warn" | "bad";
  readonly stalledDays: number | null;
  /** Close date pushed later how many times; is it already past. */
  readonly slips: number;
  readonly closeDatePassed: boolean;
  readonly pendingApprovals: number;
  readonly open: boolean;
}

const REACH_DAYS = 30;

export function dimensionIndicators(f: DealFacts, p: DealScoreWeights = DEFAULT_DEAL_SCORE_WEIGHTS): Record<DealDimension, Indicator[]> {
  const people = f.people ?? [];
  const economic = people.filter((x) => x.role === "economic");
  const reachedEconomic = economic.some((x) => x.lastDays !== null && x.lastDays <= REACH_DAYS);
  return {
    value: [
      { key: "pain", tone: f.slots.pain ? "good" : "warn", gap: { code: "pain" } },
      { key: "metrics", tone: f.slots.metrics ? "good" : "warn", gap: { code: "metrics" } },
      // An unknown budget is 未知, not a failure (R4: 未填为未知, 不升级).
      { key: "budget", tone: f.budgetKnown ? "good" : "unknown", gap: { code: "budget" } },
      { key: "statusQuo", tone: f.slots.statusQuo ? "warn" : "good", gap: { code: "statusQuo" } },
    ],
    consensus:
      f.people === null
        ? [{ key: "chain", tone: "unknown" }]
        : [
            {
              key: "economic",
              tone: economic.length === 0 ? "bad" : reachedEconomic ? "good" : "warn",
              gap: { code: economic.length === 0 ? "noEconomic" : "reachEconomic" },
            },
            { key: "coach", tone: people.some((x) => x.role === "coach") ? "good" : "warn", gap: { code: "coach" } },
            {
              key: "opposition",
              tone: people.some((x) => x.stance === "antagonist") ? "bad" : "good",
              gap: { code: "opposition", n: people.filter((x) => x.stance === "antagonist").length },
            },
            {
              key: "coverage",
              tone: people.length >= 2 ? "good" : people.length === 1 ? "warn" : "bad",
              gap: { code: "coverage", n: people.length },
            },
            { key: "process", tone: f.slots.decisionProcess ? "good" : "warn", gap: { code: "decisionProcess" } },
          ],
    // No structured rival record yet (batch 7): a mention says a rival is in
    // play; none says nothing - 未知, not 稳.
    competition: [
      f.rivalMentions > 0
        ? { key: "rivals", tone: "warn", gap: { code: "rivalMentioned", n: f.rivalMentions } }
        : { key: "rivals", tone: "unknown", gap: { code: "rivalUnknown" } },
    ],
    engagement: [
      {
        key: "contact",
        tone: f.lastTouchDays === null ? "bad" : f.lastTouchDays <= p.recentDays ? "good" : f.lastTouchDays < p.quietDays ? "warn" : "bad",
        gap: f.lastTouchDays === null ? { code: "neverTouched" } : { code: "quiet", n: f.lastTouchDays },
      },
      {
        key: "theirPromises",
        tone: f.theirOverdue.count === 0 ? "good" : f.theirOverdue.maxDays > 7 ? "bad" : "warn",
        gap: { code: "theirOverdue", n: f.theirOverdue.count },
      },
    ],
    progress: f.open
      ? [
          f.exit && f.exit.total > 0
            ? {
                key: "exit",
                tone: f.exit.met === f.exit.total ? "good" : f.exit.met * 2 < f.exit.total ? "bad" : "warn",
                gap: { code: "exitGap", n: f.exit.total - f.exit.met },
              }
            : { key: "exit", tone: "unknown" },
          { key: "stall", tone: f.stall, gap: { code: "stalled", n: f.stalledDays ?? 0 } },
          {
            key: "closeDate",
            tone: f.closeDatePassed || f.slips >= 2 ? "bad" : f.slips === 1 ? "warn" : "good",
            gap: f.closeDatePassed ? { code: "closePassed" } : { code: "slipped", n: f.slips },
          },
          { key: "nextStep", tone: f.hasNextStep ? "good" : "warn", gap: { code: "nextStep" } },
          { key: "approval", tone: f.pendingApprovals > 0 ? "warn" : "good", gap: { code: "approval", n: f.pendingApprovals } },
        ]
      : [{ key: "closed", tone: "unknown" }],
  };
}

export interface DimensionScore {
  readonly dimension: DealDimension;
  /** 0-100; null = nothing known (未知). */
  readonly score: number | null;
  readonly weight: number;
  /** The worst indicator's gap - the work to do. Null when every one is 稳. */
  readonly gap: { readonly code: string; readonly n?: number } | null;
}

export interface DealScore {
  /** 0-100; null when no dimension is known. */
  readonly score: number;
  readonly dimensions: readonly DimensionScore[];
  /** The dimension that cost the most, or null when nothing cost anything. */
  readonly primaryConcern: DimensionScore | null;
}

export function dealScore(f: DealFacts, p: DealScoreWeights = DEFAULT_DEAL_SCORE_WEIGHTS): DealScore {
  const byDim = dimensionIndicators(f, p);
  const toneScore = (t: IndicatorTone) => (t === "good" ? 100 : t === "warn" ? p.watchScore : 0);
  const rank = (t: IndicatorTone) => (t === "bad" ? 2 : t === "warn" ? 1 : 0);
  const dimensions = DEAL_DIMENSIONS.map((d) => {
    const known = byDim[d].filter((i) => i.tone !== "unknown");
    const worst = [...known].filter((i) => i.tone !== "good").sort((a, b) => rank(b.tone) - rank(a.tone))[0];
    const unknownGap = byDim[d].find((i) => i.tone === "unknown" && i.gap)?.gap ?? null;
    return {
      dimension: d,
      score: known.length === 0 ? null : Math.round(known.reduce((n, i) => n + toneScore(i.tone), 0) / known.length),
      weight: p.weights[d],
      gap: worst?.gap ?? (known.length === 0 ? unknownGap : null),
    };
  });
  const counted = dimensions.filter((d) => d.score !== null && d.weight > 0);
  const total = counted.reduce((n, d) => n + d.weight, 0);
  const score = total === 0 ? 0 : Math.round(counted.reduce((n, d) => n + (d.score! * d.weight) / total, 0));
  const worst = [...counted].filter((d) => d.score! < 100).sort((a, b) => (100 - b.score!) * b.weight - (100 - a.score!) * a.weight)[0] ?? null;
  return { score: Math.min(100, Math.max(0, score)), dimensions, primaryConcern: worst };
}
