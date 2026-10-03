// Taking a milestone off a plan.
//
// A milestone is a COMMERCIAL GATE (incr/0032): instalments name the gate that
// releases them, and every move of its date after it was committed is written to
// an append-only journal. So only a gate that never did any of that may go - one
// that was entered by mistake and never relied on.
//
// Its own file so reachable-codes.test.ts keeps these codes out of the other
// delivery forms' dictionaries.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export function planMilestoneRemoval(
  milestone: { status: string; acceptance: unknown | null },
  facts: { changes: number; instalments: number },
): RuleResult<true> {
  if (milestone.status !== "pending" || milestone.acceptance !== null) {
    return fail(
      violation("milestone_not_pending", "a gate that was completed or accepted is a record", "status"),
    );
  }
  if (facts.changes > 0) {
    return fail(
      violation("milestone_moved", "this gate's date was moved after it was committed - that history stays", "sequence"),
    );
  }
  if (facts.instalments > 0) {
    return fail(
      violation("milestone_has_instalments", "collection instalments are released by this gate", "sequence"),
    );
  }
  return ok(true);
}
