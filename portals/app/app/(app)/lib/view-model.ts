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
import { DEFAULT_PROBABILITY, isProbabilityOverridden } from "../../domains/pipeline/lib/stage";
import type { ForecastCategory } from "../../domains/pipeline/lib/forecast";
import type { ActionStatus } from "../../domains/copilot/lib/action";
import type { RevenueStatus } from "../../domains/delivery/lib/revenue";

/** The DS's closed tone set. */
export type Tone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

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
export function probabilityDisplay(opp: { stage: Stage; probability: number | null }): ProbabilityDisplay {
  return {
    value: opp.probability,
    overridden: isProbabilityOverridden(opp),
    stageDefault: DEFAULT_PROBABILITY[opp.stage],
  };
}

/** Money for display. Formatting only - never rounds the underlying value. */
export function formatMoney(amount: number | null, currency: string, locale = "zh-CN"): string {
  if (amount == null) return "-";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(ratio: number | null, locale = "zh-CN"): string {
  if (ratio == null) return "-";
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(ratio);
}
