// What the forecast category WOULD be, if a rule decided it.
//
// The owner's ruling, 2026-08-31: SUGGEST AND LET A PERSON APPLY IT, one deal
// at a time. Not force. That ruling is what lets this file exist at all,
// because forecast.ts already records the opposite-facing decision:
//
//   "forecast_category is DECOUPLED from stage. A rep at `negotiate` who is
//    not willing to commit says `best_case`, and that disagreement is the
//    actual content of a forecast review."
//
// A rule that DERIVED the category would delete exactly that. A rule that
// SUGGESTS one makes the disagreement legible instead of leaving it to be
// found by reading a board - which is the thing nobody does. So the suggestion
// is a second opinion standing beside the rep's, never a replacement for it.
//
// NOTHING HERE IS STORED, and that is the second half of the ruling.
// `agrees` is computed from the deal in front of you every time it is asked,
// the way `isProbabilityOverridden` computes "a human overrode the machine"
// without a column. A stored copy of a derivable fact is a copy that can drift
// from what it copies.
//
// EVERY ADJUSTMENT IS A DOWNGRADE. Time passing is not progress: a deal that
// has sat at `negotiate` for two months is less likely to land than one that
// arrived there yesterday, never more. A rule that could talk itself upward
// would eventually forecast confidence out of inactivity.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { DEFAULT_PROBABILITY, isTerminal, type Stage } from "./stage";
import type { ForecastCategory } from "./forecast";

/**
 * The three open categories, weakest first.
 *
 * `closed` is deliberately absent. It is not a confidence band - it states the
 * deal is done, and planCategoryChange already binds it to a terminal stage in
 * both directions. Putting it on this scale would let a downgrade walk a live
 * deal into "closed", which is a rule inventing an outcome.
 */
export const CONFIDENCE_BANDS = ["pipeline", "best_case", "commit"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

/**
 * Where the bands start, and how long a stall takes to count.
 *
 * THE WORKSPACE'S, SINCE incr/0041. These were three constants in this file,
 * and they decide what a forecast review tells a sales leader their book is
 * worth - which is a company's own forecast discipline rather than a fact
 * about selling. The BANDS stay code (the rule branches on them and the
 * database constrains them); where they START is data.
 */
export interface ForecastThresholds {
  /** At or above this, the deal's own probability reads as commit. */
  readonly commitAt: number;
  /** At or above this, and below commitAt, best case. */
  readonly bestCaseAt: number;
  /** Days at one stage before the clock caps the band. */
  readonly stallDays: number;
}

/**
 * What a workspace gets before anybody changes it - and the same numbers
 * incr/0041 writes as the column defaults, so the two cannot disagree.
 *
 * 80 rather than 90 for commit: `negotiate` defaults to 90 and `propose` to 70,
 * so a threshold at 90 would make the band a restatement of "is it at
 * negotiate" and the suggestion would carry no information the stage badge does
 * not already carry. At 80 a rep who has marked a `propose` deal at 85 lands in
 * commit on their own judgement, which is the case worth surfacing.
 *
 * 45 days for the stall, and deliberately NOT judgement.ts's STALE_DAYS (30),
 * which measures something different - days since anyone TALKED to the
 * customer. A deal can be actively worked and still not move, and it is the
 * not-moving that a forecast category is wrong about.
 */
export const DEFAULT_FORECAST_THRESHOLDS: ForecastThresholds = {
  commitAt: 80,
  bestCaseAt: 50,
  stallDays: 45,
};

/**
 * Thresholds a workspace may actually be given.
 *
 * The pair has to be ordered or the ladder is unorderable and every deal lands
 * in whichever branch is tested first - chk_forecast_threshold_ordered says the
 * same thing in the database, and this is the sentence a person reads.
 */
export function planForecastThresholds(
  input: ForecastThresholds,
): RuleResult<ForecastThresholds> {
  const whole = (n: number) => Number.isInteger(n);
  if (!whole(input.commitAt) || input.commitAt < 1 || input.commitAt > 100) {
    return fail(violation("commit_out_of_range", "commit sits between 1 and 100", "commitAt"));
  }
  if (!whole(input.bestCaseAt) || input.bestCaseAt < 1 || input.bestCaseAt > 100) {
    return fail(violation("best_case_out_of_range", "best case sits between 1 and 100", "bestCaseAt"));
  }
  if (input.bestCaseAt >= input.commitAt) {
    return fail(violation(
      "bands_cross",
      "best case has to start below commit, or the bands cannot be ordered",
      "bestCaseAt",
    ));
  }
  if (!whole(input.stallDays) || input.stallDays < 1 || input.stallDays > 365) {
    return fail(violation("stall_out_of_range", "a stall clock runs from 1 to 365 days", "stallDays"));
  }
  return ok(input);
}

const DAY = 86_400_000;

export interface CategorizableDeal {
  id: string;
  stage: Stage;
  /** What a person currently has it filed as. The thing being second-guessed. */
  forecastCategory: ForecastCategory;
  probability: number | null;
  expectedCloseAt: Date | null;
  /** When it last moved stage. Null when the journal has nothing for it. */
  lastStageChangeAt: Date | null;
}

/** Why the suggestion came out where it did, in the rule's own terms. */
export interface SuggestionBasis {
  /** The band the probability alone would give. */
  readonly band: ConfidenceBand;
  /** The probability used, and whether a person put it there. */
  readonly probability: number;
  readonly probabilityIsHuman: boolean;
  /** Downgrades applied, in order. Empty when the band survived intact. */
  readonly caps: readonly CapReason[];
}

export type CapReason = "no_close_date" | "close_date_passed" | "stalled";

export type CategoryVerdict =
  | {
      readonly kind: "suggested";
      readonly category: ConfidenceBand;
      /** True when the rule lands on what the person already chose. */
      readonly agrees: boolean;
      readonly basis: SuggestionBasis;
    }
  /**
   * No judgement to offer. A terminal deal's category is settled by a rule
   * rather than by an opinion, so a second opinion about it would be noise.
   */
  | { readonly kind: "settled"; readonly reason: "terminal" };

/**
 * The category this deal would be filed under, if the rule filed it.
 *
 * THE PROBABILITY IS USED AS-IS, overridden or not, and the basis says which.
 * A rep's own 35% on a `validate` deal is their statement about it, and when
 * they have also filed it as commit the rule is surfacing them contradicting
 * THEMSELVES - a better finding than the stage comparison, and one nothing in
 * the product could make before. Reporting whether the number was theirs is
 * what keeps that from reading as the rule inventing a disagreement.
 */
export function suggestCategory(
  deal: CategorizableDeal,
  now: Date,
  thresholds: ForecastThresholds = DEFAULT_FORECAST_THRESHOLDS,
): CategoryVerdict {
  if (isTerminal(deal.stage)) return { kind: "settled", reason: "terminal" };

  const probability = deal.probability ?? DEFAULT_PROBABILITY[deal.stage];
  const probabilityIsHuman =
    deal.probability != null && deal.probability !== DEFAULT_PROBABILITY[deal.stage];

  let band: ConfidenceBand =
    probability >= thresholds.commitAt
      ? "commit"
      : probability >= thresholds.bestCaseAt
        ? "best_case"
        : "pipeline";
  const fromProbability = band;
  const caps: CapReason[] = [];

  // A COMMITMENT TO AN UNNAMED DATE IS NOT A COMMITMENT. Committing means
  // saying it lands in this period, and a deal with no expected close date has
  // not said which period it is in - so there is nothing to commit to.
  if (!deal.expectedCloseAt) {
    caps.push("no_close_date");
    band = "pipeline";
  } else if (deal.expectedCloseAt.getTime() < now.getTime()) {
    // THE DATE CAME AND WENT AND THE DEAL IS STILL OPEN. This is the single
    // most common way a forecast stays at commit forever: the date slips, the
    // category does not, and the number keeps being reported.
    caps.push("close_date_passed");
    band = "pipeline";
  }

  if (
    deal.lastStageChangeAt &&
    Math.floor((now.getTime() - deal.lastStageChangeAt.getTime()) / DAY) >
      thresholds.stallDays
  ) {
    // ONE BAND, NOT STRAIGHT TO PIPELINE. A stall is evidence, not a verdict -
    // long negotiations are ordinary in this business, and a rule that dropped
    // every slow deal to the bottom would be ignored within a week.
    caps.push("stalled");
    band = demote(band);
  }

  return {
    kind: "suggested",
    category: band,
    agrees: deal.forecastCategory === band,
    basis: { band: fromProbability, probability, probabilityIsHuman, caps },
  };
}

/** Days at the current stage, or null when the journal has nothing. */
export function daysAtStage(deal: Pick<CategorizableDeal, "lastStageChangeAt">, now: Date): number | null {
  if (!deal.lastStageChangeAt) return null;
  return Math.floor((now.getTime() - deal.lastStageChangeAt.getTime()) / DAY);
}

/**
 * The category change a person would apply, having seen the suggestion.
 *
 * A THIN PLAN, and it stays thin on purpose: applying it goes through
 * `categorizeOpportunity`, which runs `planCategoryChange` - the rule that
 * keeps `closed` and a terminal stage agreeing. This one only refuses the two
 * cases where there is nothing to apply, so that a stale page cannot write a
 * suggestion that no longer exists.
 */
export function planSuggestedCategory(
  deal: CategorizableDeal,
  verdict: CategoryVerdict,
): RuleResult<{ forecastCategory: ConfidenceBand }> {
  if (verdict.kind === "settled") {
    return fail(
      violation(
        "category_settled",
        `${deal.id} is at a terminal stage; its category is not a judgement`,
        "forecastCategory",
      ),
    );
  }
  if (verdict.agrees) {
    return fail(
      violation(
        "category_already_agrees",
        `${deal.id} is already filed as ${verdict.category}`,
        "forecastCategory",
      ),
    );
  }
  return ok({ forecastCategory: verdict.category });
}

function demote(band: ConfidenceBand): ConfidenceBand {
  const i = CONFIDENCE_BANDS.indexOf(band);
  return CONFIDENCE_BANDS[Math.max(0, i - 1)];
}
