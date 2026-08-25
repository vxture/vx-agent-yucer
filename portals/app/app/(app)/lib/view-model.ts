// Presentation mapping for the domain views.
//
// These functions turn domain values into the design system's vocabulary. They
// live here rather than inside components for one reason: a component cannot be
// unit-tested in this repo's runner (it runs `app/**/*.test.ts`, no JSX), and
// "which stage is shown as danger" is exactly the kind of rule that should be
// tested rather than eyeballed.
//
// Nothing here defines a colour. It selects a DS semantic tone, and the DS
// decides what that looks like.

import type { Stage } from "../../domains/pipeline/lib/stage";
import {
  DEFAULT_PROBABILITY,
  isProbabilityOverridden,
} from "../../domains/pipeline/lib/stage";
import type { ForecastCategory } from "../../domains/pipeline/lib/forecast";
import type { ActionStatus } from "../../domains/copilot/lib/action";
import type { RevenueStatus } from "../../domains/delivery/lib/revenue";

/** The DS's closed tone set. */
export type Tone =
  "neutral" | "brand" | "info" | "success" | "warning" | "danger";

/**
 * Stage tone. Progression reads neutral -> info -> brand so the eye can see
 * momentum, and only the two terminal stages are success/danger. Notably
 * `negotiate` is NOT success: a deal at 90% is not a won deal, and colouring it
 * green is how a forecast gets read as revenue.
 */
export const STAGE_TONE: Record<Stage, Tone> = {
  qualify: "neutral",
  discover: "neutral",
  validate: "info",
  propose: "info",
  negotiate: "brand",
  won: "success",
  lost: "danger",
};

/**
 * Forecast tone. `commit` is deliberately the loudest of the open categories:
 * it is the number someone promised upward, and it should look like a promise.
 */
export const FORECAST_TONE: Record<ForecastCategory, Tone> = {
  pipeline: "neutral",
  best_case: "info",
  commit: "warning",
  closed: "success",
};

/**
 * Proposal tone. `proposed` is `warning` because a pending proposal is work
 * waiting on a human, and `expired` is `danger` rather than neutral: a proposal
 * that timed out is a decision nobody made, which the spec insists must stay
 * visible rather than fading away.
 */
export const ACTION_STATUS_TONE: Record<ActionStatus, Tone> = {
  proposed: "warning",
  accepted: "info",
  rejected: "neutral",
  executed: "success",
  failed: "danger",
  expired: "danger",
};

export const REVENUE_STATUS_TONE: Record<RevenueStatus, Tone> = {
  planned: "neutral",
  invoiced: "info",
  settled: "success",
  overdue: "danger",
  written_off: "neutral",
};

/** Health score bands, for sorting and for the account list's tone. */
export function healthTone(score: number | null): Tone {
  if (score == null) return "neutral";
  if (score >= 70) return "success";
  if (score >= 40) return "warning";
  return "danger";
}

/**
 * Confidence tone for a copilot proposal. The threshold matches the one
 * batchRisk() calls "low", so the badge on a row and the warning on a bulk
 * accept cannot disagree about what "low confidence" means.
 */
/**
 * A tone as INK, in one place, because it was in five.
 *
 * Every semantic colour in the DS ships as a PAIR: `--x` is what a surface of
 * that tone is PAINTED, `--x-text` is the same hue calibrated to be READ. Five
 * files had each hand-rolled their own `{bad,warn,good} -> text-*` map and all
 * five had reached for the fill, which is fine for three of the four tones and
 * silently broken for the fourth.
 *
 * Measured against a white card:
 *
 *   tone         --x     --x-text
 *   warning      1.72    5.03      <- unreadable; this is the bug
 *   destructive  4.77    6.42
 *   success      5.36    5.36      <- the DS defines these two identically
 *   info         5.86    5.86
 *
 * So `text-warning` on a light surface was 1.72:1 against a floor of 4.5 - not
 * "a bit low", invisible. The other three passed, which is exactly why the
 * mistake survived review five times: four out of five reviewers looking at a
 * red or green number see nothing wrong.
 *
 * Using `-text` for all four rather than only for warning is deliberate. Two of
 * them are the same value, so it costs nothing, and it means the map names the
 * DS's ink slot uniformly - there is no longer a per-tone judgement call for a
 * sixth copy of this map to get wrong.
 *
 * ON A MUTED SURFACE THIS MAP IS THE WRONG ONE. The DS carries a third slot,
 * `--x-muted-foreground`, for ink over a muted panel, and a caller sitting on
 * `bg-muted` should name it directly - the signal queue's score drawer does.
 * That is a per-surface choice the caller can see and this map cannot.
 */
export const TONE_INK: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  brand: "text-primary",
  info: "text-(color:--info-text)",
  success: "text-(color:--success-text)",
  warning: "text-(color:--warning-text)",
  danger: "text-(color:--destructive-text)",
};

/**
 * The board's own three-value vocabulary, mapped onto the same ink.
 *
 * `bad | warn | good` is what board.ts and the brief components speak, and it
 * is a verdict rather than a colour - it is set from the data, never from
 * taste. Routing it through Tone keeps one definition of what each verdict
 * looks like.
 */
export const LEVEL_TONE = {
  bad: "danger",
  warn: "warning",
  good: "success",
} as const;

export type Level3 = keyof typeof LEVEL_TONE;

export const LEVEL_INK: Record<Level3, string> = {
  bad: TONE_INK.danger,
  warn: TONE_INK.warning,
  good: TONE_INK.success,
};

export function confidenceTone(confidence: number | null): Tone {
  if (confidence == null) return "neutral";
  if (confidence >= 80) return "success";
  if (confidence >= 60) return "info";
  return "warning";
}

export interface ProbabilityDisplay {
  value: number | null;
  /** True when a human set it, so the UI can mark it as a judgement call. */
  overridden: boolean;
  /** The stage default, so the caller can explain what was overridden. */
  stageDefault: number;
}

/**
 * How to present a win rate. Surfacing the override is the point: a number the
 * machine suggested and a number a salesperson committed to look identical in
 * the database and mean completely different things in a review.
 */
export function probabilityDisplay(opp: {
  stage: Stage;
  probability: number | null;
}): ProbabilityDisplay {
  return {
    value: opp.probability,
    overridden: isProbabilityOverridden(opp),
    stageDefault: DEFAULT_PROBABILITY[opp.stage],
  };
}

/** Money for display. Formatting only - never rounds the underlying value. */
export function formatMoney(
  amount: number | null,
  currency: string,
  locale = "zh-CN",
): string {
  if (amount == null) return "-";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Money at scan size, for a metric card.
 *
 * A CARD IS NOT A LEDGER. Four of these sit side by side in a fixed-width
 * pane, and `CN¥4,200,000` needs 147px inside a card that has 24px of padding
 * on each side - so at four columns the reader got `CN¥4,20…`, which is not a
 * smaller number but a WRONG one. A truncated figure is worse than a rounded
 * one: rounding says "about this much" and the reader knows it, truncation says
 * "exactly this much" and is lying.
 *
 * Compact notation is also what the page already does one block above - the
 * headline reads 4.2M / 420 万 - so the card agreeing with it removes a
 * discrepancy rather than introducing one. The exact figure is a column away in
 * the table below, where a row has the width for it.
 */
export function formatMoneyCompact(
  amount: number | null,
  currency: string,
  locale: string,
): string {
  if (amount == null) return "-";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatPercent(ratio: number | null, locale = "zh-CN"): string {
  if (ratio == null) return "-";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio);
}
