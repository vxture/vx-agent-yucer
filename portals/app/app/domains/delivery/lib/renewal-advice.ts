// 续约检查 - what the renewal dock says about the subscriptions coming back
// round. A pure function: the page reads, this decides, the panel renders.
//
// EVERY FINDING IS A GAP BETWEEN THE CONTRACT'S CLOCK AND WHAT ANYBODY HAS
// DONE. `assessRenewal` in renewal.ts already answers "is this due"; this
// answers the question after it - of the ones that are, which need a person
// now, and which of the ones that are NOT are not due for a reason that will
// quietly cost money.
//
// IT PROPOSES, IT NEVER OPENS. Creating the opportunity stays a person's act
// (ADR-003, and renewal.ts says it with extra force because the proposal is a
// commercial approach to a customer). What this file decides is what to say
// and how loudly.

export type RenewalAdviceKind =
  /** The term has already ended and nothing is open. */
  | "lapsed"
  /** A subscription with no end date - the renewal will never surface at all. */
  | "no_end_date"
  /** Due, and delivery health says watch. */
  | "watch_risk"
  /** Due inside the window, delivery healthy - the ordinary queue. */
  | "due_soon"
  /** Due, and there is no amount to carry into the proposal. */
  | "no_amount";

export interface RenewalAdvice {
  readonly id: string;
  readonly kind: RenewalAdviceKind;
  readonly projectId: string;
  readonly projectNo: string;
  readonly projectName: string;
  /** Days to the end of term; negative once lapsed, null when there is none. */
  readonly daysToEnd: number | null;
}

export interface RenewalAdviceRow {
  readonly projectId: string;
  readonly projectNo: string;
  readonly projectName: string;
  readonly daysToEnd: number | null;
  readonly amount: number | null;
  /** "low" | "watch" when the rule found it due; null when it did not. */
  readonly risk: "low" | "watch" | null;
  /** Why it is not due, when it is not - `assessRenewal`'s own reason code. */
  readonly notDueReason: string | null;
}

/** Worst first, so the dock's top item is the one to act on. */
const ORDER: readonly RenewalAdviceKind[] = [
  "lapsed",
  "watch_risk",
  "no_end_date",
  "no_amount",
  "due_soon",
];

export function analyseRenewals(
  rows: readonly RenewalAdviceRow[],
): readonly RenewalAdvice[] {
  const out: RenewalAdvice[] = [];

  for (const r of rows) {
    const at = (kind: RenewalAdviceKind) =>
      out.push({
        id: `${kind}:${r.projectId}`,
        kind,
        projectId: r.projectId,
        projectNo: r.projectNo,
        projectName: r.projectName,
        daysToEnd: r.daysToEnd,
      });

    // NOT DUE IS MOSTLY SILENCE, with one exception. `too_far_out` is a
    // subscription doing exactly what it should; `already_renewed` is somebody
    // having done the work; `not_subscription` was never a renewal. But
    // `no_end_date` on a subscription means the term will never come round on
    // any screen - the one not-due reason that costs a renewal by being quiet.
    if (r.notDueReason !== null) {
      if (r.notDueReason === "no_end_date") at("no_end_date");
      continue;
    }

    if (r.daysToEnd !== null && r.daysToEnd < 0) at("lapsed");
    else at(r.risk === "watch" ? "watch_risk" : "due_soon");

    // Said IN ADDITION to the timing finding, not instead of it: a due renewal
    // with no figure is still due, and the proposal would open with a blank
    // number in front of a customer.
    if (r.amount === null) at("no_amount");
  }

  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
