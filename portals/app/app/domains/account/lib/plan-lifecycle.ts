// A customer plan's lifecycle: close it, and bring it back.
//
// Its own file so reachable-codes.test.ts keeps these codes out of the other
// account forms' dictionaries.
//
// THE REASON IS OPTIONAL (owner, 2026-10-02) but bounded, and it is kept with
// the closed plan rather than discarded: "why did we stop working this account"
// is what the next person asks. Reopening clears it - a plan that is live again
// has no reason to be closed.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export const PLAN_CLOSE_REASON_MAX = 500;

/**
 * Close acts on the LIVE plan, not on the newest one: a customer can hold an
 * older live plan beside a newer closed one, and "the newest is closed" must not
 * read as "nothing to close".
 */
export function planPlanClose(
  latest: { status: string } | null,
  active: { status: string } | null,
  reason: string | null | undefined,
): RuleResult<{ reason: string | null }> {
  if (!latest) return fail(violation("plan_none", "this customer has no plan to close", "accountId"));
  if (!active) {
    return fail(violation("plan_already_closed", "this plan is already closed", "accountId"));
  }
  const text = reason?.trim() || null;
  if (text !== null && text.length > PLAN_CLOSE_REASON_MAX) {
    return fail(
      violation("plan_reason_too_long", `a reason is at most ${PLAN_CLOSE_REASON_MAX} characters`, "reason"),
    );
  }
  return ok({ reason: text });
}

/**
 * Reopening acts on the newest plan, and only when no plan is live: one live
 * plan per account is what the cadence rule reads.
 */
export function planPlanReopen(
  latest: { status: string } | null,
  active: { id: string } | null,
): RuleResult<true> {
  if (!latest) return fail(violation("plan_none", "this customer has no plan to reopen", "accountId"));
  if (latest.status === "active" || active) {
    return fail(violation("plan_already_active", "this customer already has a live plan", "accountId"));
  }
  return ok(true);
}
