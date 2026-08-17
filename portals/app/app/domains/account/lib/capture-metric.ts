// The instrument for ADR-012's kill criterion.
//
// ADR-012 attaches a condition to the evidence plane: if the capture habit does not
// form, stages 2 and 3 (claims, judgements) are not built, because a reasoning
// layer over an empty evidence table is a machine for producing confident
// fiction. That condition was written down and then not measured, which makes
// it a form of words rather than a criterion - so this file computes it.
//
// WHAT IS MEASURED, AND WHY THIS AND NOT THE OBVIOUS THING.
//
// The obvious metric is interactions per week. It is also the wrong one: a
// single enthusiastic user dumping twenty notes onto one deal would carry the
// number while nineteen other deals stayed dark, and the conclusion drawn from
// it - "the habit formed" - would be false in the only way that matters.
//
// So COVERAGE is primary: of the opportunities that were open in a given week,
// what fraction had ANY follow-up recorded against them. It cannot be inflated
// by volume, it degrades honestly when a team half-adopts, and it answers the
// question stage 2 actually depends on - will there be evidence under a deal
// when the product tries to reason about it.
//
// Rate (interactions per open opportunity) is reported alongside as context,
// never as the test.
//
// WHAT IS DELIBERATELY NOT MEASURED: anything per-person. This is an adoption
// diagnostic for a product decision, and the moment it can be read as a
// scoreboard the thing it measures changes - people record to be seen
// recording, and the evidence plane fills with notes written for the metric
// rather than for the next person to open the deal. There is no per-owner
// breakdown here and adding one would invalidate the measurement, not enrich
// it.

const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;

/** Only the two fields the metric needs. Keeps the pure function free of the
 * store's record shape and therefore free of IO. */
export interface CaptureInteraction {
  /** Null means it was recorded against the customer, not a deal. Deliberately
   * excluded: the criterion is per OPPORTUNITY, and counting account-level
   * notes would let the number rise while deals stayed dark. */
  opportunityId: string | null;
  occurredAt: Date;
}

export interface OpportunityWindow {
  id: string;
  createdAt: Date;
  /** Null while still open. */
  closedAt: Date | null;
}

export interface CaptureWeek {
  /** Monday 00:00 UTC. */
  weekStart: Date;
  weekEnd: Date;
  /**
   * Has this week finished?
   *
   * The current week is shown and NEVER judged. Judging it means a Monday
   * morning is scored as a week in which almost nothing was recorded, so the
   * same unchanged data reads `adopted` on Sunday evening and `not_adopted`
   * four hours later. A criterion that moves at midnight is not a criterion.
   */
  complete: boolean;
  /** Opportunities that were open at some point during the week. */
  opportunities: number;
  /** Interactions recorded against any of them, in the week. */
  interactions: number;
  /** Of those opportunities, how many got at least one. The primary number. */
  covered: number;
  /** covered / opportunities. Null when nothing was open - not zero. A week
   * with no deals is not a week the team failed to record. */
  coverage: number | null;
  /** interactions / opportunities. Context only. */
  rate: number | null;
}

/**
 * Monday 00:00 UTC containing `d`.
 *
 * UTC rather than local: the window boundaries have to be stable across the
 * server's timezone and across a reader in a different one, or two people
 * comparing the same week get different numbers.
 */
export function weekStartOf(d: Date): Date {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  // getUTCDay: 0 = Sunday. Shift so Monday is 0.
  const dayIndex = (d.getUTCDay() + 6) % 7;
  return new Date(utc - dayIndex * DAY_MS);
}

/**
 * Per-week capture, oldest first.
 *
 * An opportunity counts for a week when it existed before the week ended and
 * had not closed before the week began. Using only "open right now" as the
 * denominator would quietly rewrite history every time a deal closed - last
 * month's coverage would improve on its own, which is the sort of number that
 * makes a decision feel supported by data it does not have.
 */
export function captureByWeek(
  interactions: readonly CaptureInteraction[],
  opportunities: readonly OpportunityWindow[],
  options: { now?: Date; weeks?: number } = {},
): CaptureWeek[] {
  const now = options.now ?? new Date();
  const weeks = Math.max(1, options.weeks ?? 6);
  const currentWeek = weekStartOf(now);

  const out: CaptureWeek[] = [];
  // weeks COMPLETE weeks, plus the in-progress one. The current week is worth
  // showing - a manager wants to know what has happened so far - but it is
  // marked and excluded from the verdict.
  for (let i = weeks; i >= 0; i -= 1) {
    const weekStart = new Date(currentWeek.getTime() - i * WEEK_MS);
    const weekEnd = new Date(weekStart.getTime() + WEEK_MS);

    const inScope = opportunities.filter(
      (o) =>
        o.createdAt.getTime() < weekEnd.getTime() &&
        (o.closedAt === null || o.closedAt.getTime() >= weekStart.getTime()),
    );
    const ids = new Set(inScope.map((o) => o.id));

    const hits = interactions.filter(
      (n) =>
        n.opportunityId !== null &&
        ids.has(n.opportunityId) &&
        n.occurredAt.getTime() >= weekStart.getTime() &&
        n.occurredAt.getTime() < weekEnd.getTime(),
    );
    const touched = new Set(hits.map((n) => n.opportunityId));

    out.push({
      weekStart,
      weekEnd,
      complete: weekEnd.getTime() <= now.getTime(),
      opportunities: inScope.length,
      interactions: hits.length,
      covered: touched.size,
      coverage: inScope.length === 0 ? null : touched.size / inScope.length,
      rate: inScope.length === 0 ? null : hits.length / inScope.length,
    });
  }
  return out;
}

/**
 * The criterion itself, as data rather than as a paragraph in a document.
 *
 * Judged on the LAST TWO weeks rather than the six-week average, because the
 * question is whether a habit exists now, not whether there was enthusiasm in
 * week one. Every tool gets used in week one.
 */
export const CAPTURE_CRITERION = {
  windowWeeks: 6,
  judgeWeeks: 2,
  /** Half the open deals touched in a week. Below this there is not enough
   * under a deal for stage 2 to reason about without inventing. */
  minCoverage: 0.5,
} as const;

export type CaptureVerdict = "adopted" | "not_adopted" | "too_early" | "no_data";

export interface CaptureAssessment {
  verdict: CaptureVerdict;
  /** Mean coverage across the judged weeks, ignoring weeks with no deals. */
  judgedCoverage: number | null;
  /** How many of the judged weeks actually had open opportunities. */
  judgedWeeks: number;
  /**
   * Whole weeks elapsed since the FIRST recorded interaction - how long this
   * workspace has actually been observed.
   *
   * This is what gates `too_early`, and it has to be, because the alternative
   * does not work: the previous version tested `weeks.length`, which
   * captureByWeek makes a constant, so the guard was dead on every production
   * call. A workspace switching the evidence plane on over deals that predate
   * it read the stage-2 KILL verdict within days.
   *
   * Null when nothing has ever been recorded - there is no observation to
   * measure the length of.
   */
  observedWeeks: number | null;
}

/**
 * Read the weeks and say what they mean.
 *
 * Returns `too_early` rather than `not_adopted` before the window closes. The
 * distinction is the whole point: a criterion that can fail early is one that
 * will be quoted early, and stage 2 would be cancelled on three weeks of data
 * by whoever happened to look.
 */
export function assessCapture(
  weeks: readonly CaptureWeek[],
  options: { firstRecordedAt?: Date | null; now?: Date; criterion?: typeof CAPTURE_CRITERION } = {},
): CaptureAssessment {
  const criterion = options.criterion ?? CAPTURE_CRITERION;
  const now = options.now ?? new Date();

  // The in-progress week is shown, never scored. See CaptureWeek.complete.
  const done = weeks.filter((w) => w.complete);

  const observedWeeks =
    options.firstRecordedAt == null
      ? null
      : Math.floor((now.getTime() - options.firstRecordedAt.getTime()) / WEEK_MS);

  const withDeals = done.filter((w) => w.opportunities > 0);
  if (withDeals.length === 0) {
    return { verdict: "no_data", judgedCoverage: null, judgedWeeks: 0, observedWeeks };
  }

  const judged = done.slice(-criterion.judgeWeeks).filter((w) => w.opportunities > 0);
  const judgedCoverage =
    judged.length === 0
      ? null
      : judged.reduce((sum, w) => sum + (w.coverage ?? 0), 0) / judged.length;

  // Not enough OBSERVATION yet. Gated on elapsed time since the first recorded
  // interaction, never on how many rows the table happens to have - a table
  // length is a property of this function's arguments, not of the world.
  const tooYoung = observedWeeks === null || observedWeeks < criterion.windowWeeks;
  if (tooYoung || judged.length < criterion.judgeWeeks) {
    return { verdict: "too_early", judgedCoverage, judgedWeeks: judged.length, observedWeeks };
  }

  return {
    verdict:
      judgedCoverage !== null && judgedCoverage >= criterion.minCoverage ? "adopted" : "not_adopted",
    judgedCoverage,
    judgedWeeks: judged.length,
    observedWeeks,
  };
}

/**
 * Which opportunities were touched at all inside a window.
 *
 * The weekly table describes the team; this names the deals. A manager can do
 * something about a named deal sitting in negotiate with nothing recorded
 * against it for six weeks, and can do nothing about a percentage.
 *
 * `to` is exclusive, matching the week boundaries above so a note on the last
 * instant of the window is not counted twice by two callers using it
 * differently.
 */
export function dealsTouched(
  interactions: readonly CaptureInteraction[],
  from: Date,
  to: Date,
): Set<string> {
  const out = new Set<string>();
  for (const n of interactions) {
    if (n.opportunityId === null) continue;
    const t = n.occurredAt.getTime();
    if (t >= from.getTime() && t < to.getTime()) out.add(n.opportunityId);
  }
  return out;
}
