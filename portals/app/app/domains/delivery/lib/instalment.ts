// Writing a collection instalment: adding one to a project's plan, and taking a
// mistaken one off it.
//
// The collection page could only MOVE instalments that already existed - planned
// to invoiced to settled - so a plan could not be started from the product, and
// a wrong row could only be written off, never removed. This is the rule half.
//
// Its own file so reachable-codes.test.ts keeps these codes out of the other
// delivery forms' dictionaries.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export interface NewInstalmentDraft {
  projectId: string;
  /** The gate that releases the money - every instalment names one (incr/0032). */
  milestoneId: string;
  /** A plain number; the currency is its own field. */
  plannedAmount: number;
  currency: string;
  dueAt: Date | null;
}

/** What the rule needs to know, read by the caller in this workspace only. */
export interface InstalmentFacts {
  readonly projectStatus: string;
  /** Whether the gate is on THIS project's own plan. A gate of another project is
   *  simply not found here - the caller only looks among this project's gates. */
  readonly gateFound: boolean;
  /** One past the highest sequence on the project. */
  readonly nextSequence: number;
}

/** A closed or cancelled project takes no new money; a delivered one still collects. */
const CLOSED = ["closed", "cancelled"] as const;

export function planNewInstalment(
  input: NewInstalmentDraft,
  facts: InstalmentFacts,
): RuleResult<NewInstalmentDraft & { sequence: number }> {
  if ((CLOSED as readonly string[]).includes(facts.projectStatus)) {
    return fail(violation("project_closed", `a ${facts.projectStatus} project takes no new instalments`, "projectId"));
  }
  if (!Number.isFinite(input.plannedAmount) || input.plannedAmount <= 0) {
    return fail(violation("instalment_amount_invalid", "an instalment is an amount above zero", "plannedAmount"));
  }
  const currency = input.currency.trim().toUpperCase();
  if (!currency) return fail(violation("instalment_currency_required", "an instalment needs a currency", "currency"));
  if (!facts.gateFound) {
    return fail(violation("instalment_gate_not_found", "that milestone is not on this project's plan", "milestoneId"));
  }
  return ok({ ...input, currency, sequence: facts.nextSequence });
}

/**
 * Only an instalment that is still just a plan may be removed. Once it has been
 * invoiced, collected, gone overdue or written off it is something the customer
 * was told or paid, and it stays - written off is the way to call one off.
 */
export function planInstalmentRemoval(current: { status: string }): RuleResult<true> {
  if (current.status !== "planned") {
    return fail(violation("instalment_not_planned", "only a planned instalment can be removed", "status"));
  }
  return ok(true);
}
