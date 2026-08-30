import { fail, ok, violation, type RuleResult } from "../../shared/result";

// When a delivered engagement comes back round.
//
// The owner's ruling, 2026-08-30: a renewal opportunity is DERIVED FROM THE
// PROJECT, and only for SUBSCRIPTION projects. Both halves carry weight.
//
// FROM THE PROJECT, not from the account or the original deal. The project is
// what actually happened - what was delivered, when the term ends, and whether
// delivery went well enough that anyone should be optimistic. The original
// opportunity records what we hoped to sell; renewing from it would propose
// the deal we wanted rather than the one we have.
//
// ONLY SUBSCRIPTIONS, and this is why 0018 added a column rather than deriving
// the answer. A one-off implementation that ended is finished; proposing its
// renewal invents an obligation the customer never took on, and a queue full
// of invented renewals is a queue people stop reading.
//
// NOT AN AUTOMATIC WRITE. This says a renewal is DUE; creating the opportunity
// is a person's act. ADR-003's line - the machine proposes, a human decides -
// applies with extra force here because the proposal is a commercial approach
// to a customer.

export type EngagementType = "one_off" | "subscription";

export interface RenewableProject {
  id: string;
  name: string;
  accountId: string;
  engagementType: EngagementType;
  status: string;
  endsAt: Date | null;
  contractAmount: number | null;
  currency: string;
  /** Health as the facts leave it, not as the team reported it. */
  derivedHealth: string;
}

export type RenewalVerdict =
  | { readonly kind: "due"; readonly daysToEnd: number; readonly risk: "low" | "watch" }
  | {
      readonly kind: "not_due";
      readonly reason: "not_subscription" | "no_end_date" | "too_far_out" | "not_delivering" | "already_renewed";
    };

/**
 * How early a renewal appears. Ninety days is the default because a
 * subscription decision is made in the quarter before it lands, not in the
 * week - a renewal that surfaces at thirty days is a renewal already being
 * negotiated by somebody else.
 */
export const RENEWAL_WINDOW_DAYS = 90;

const DAY = 86_400_000;

export function assessRenewal(
  project: RenewableProject,
  now: Date,
  opts: { alreadyRenewed?: boolean; windowDays?: number } = {},
): RenewalVerdict {
  if (project.engagementType !== "subscription") {
    return { kind: "not_due", reason: "not_subscription" };
  }
  if (opts.alreadyRenewed) {
    // A renewal deal already exists for this project. Proposing a second one
    // would put two live approaches to one customer about one contract.
    return { kind: "not_due", reason: "already_renewed" };
  }
  // A project still in planning has not delivered anything to renew, and a
  // cancelled one has no term to extend. `on_hold` counts: the term keeps
  // running while the work is paused, which is exactly when a lapse is easy
  // to miss.
  if (!["active", "on_hold", "delivered"].includes(project.status)) {
    return { kind: "not_due", reason: "not_delivering" };
  }
  if (!project.endsAt) return { kind: "not_due", reason: "no_end_date" };

  const daysToEnd = Math.floor((project.endsAt.getTime() - now.getTime()) / DAY);
  if (daysToEnd > (opts.windowDays ?? RENEWAL_WINDOW_DAYS)) {
    return { kind: "not_due", reason: "too_far_out" };
  }

  // ALREADY LAPSED STILL COUNTS AS DUE. A term that ended last week is the
  // most urgent renewal there is, and filtering it out for being in the past
  // would hide exactly the ones that were missed.
  return {
    kind: "due",
    daysToEnd,
    // Delivery quality is the one thing about a renewal knowable in advance.
    // A project the facts downgraded is one to approach carefully, not one to
    // assume renews.
    risk: project.derivedHealth === "green" ? "low" : "watch",
  };
}

/** The renewal opportunity a due project would open, ready for a human. */
export interface RenewalDraft {
  accountId: string;
  name: string;
  amount: number | null;
  currency: string;
  sourceProjectId: string;
}

export function planRenewal(project: RenewableProject, verdict: RenewalVerdict): RuleResult<RenewalDraft> {
  if (verdict.kind !== "due") {
    return fail(violation("renewal_not_due", `${project.name} is not due for renewal`, "projectId"));
  }
  // THE SAME AMOUNT, not a guess at an uplift. What last term was worth is a
  // fact; what next term is worth is a negotiation, and seeding it with an
  // invented increase would put a number nobody chose in front of a customer.
  return ok({
    accountId: project.accountId,
    name: project.name,
    amount: project.contractAmount,
    currency: project.currency,
    sourceProjectId: project.id,
  });
}
