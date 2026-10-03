// Writing a project: what a create, an edit and a cancel may say.
//
// A project could not be created in the product at all - the roster read rows
// that only seeds and tests ever wrote - and once there, could not be changed or
// called off. This is the rule half of all three.
//
// Its own file so reachable-codes.test.ts (which attributes violation codes to
// actions by FILE) keeps these codes out of the milestone and revenue forms.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export const ENGAGEMENT_TYPES = ["one_off", "subscription"] as const;
export type ProjectEngagement = (typeof ENGAGEMENT_TYPES)[number];

/** Delivered, closed and cancelled projects are a record: they are not edited. */
const SETTLED = ["delivered", "closed", "cancelled"] as const;
/** The only statuses a project can be called off from. */
const CANCELLABLE = ["planning", "active", "on_hold"] as const;

export interface ProjectDraft {
  name: string;
  managerSub: string | null;
  /** A plain number; null = the value is not known yet. */
  contractAmount: number | null;
  currency: string;
  /** When the engagement ends (the term of a subscription, the handover of a one-off). */
  endsAt: Date | null;
  engagementType: ProjectEngagement;
}

export interface NewProjectDraft extends ProjectDraft {
  /** Unique per workspace and not writable afterwards - the anchor. */
  projectNo: string;
  accountId: string;
  /** The deal this delivers, when there is one; it must belong to the same customer. */
  opportunityId: string | null;
}

/** What the link rule needs to know, read by the caller in this workspace only. */
export interface ProjectLinkFacts {
  readonly accountFound: boolean;
  /** undefined = no deal named; null = the deal was not found; else its customer. */
  readonly opportunityAccountId?: string | null;
}

function fields(input: ProjectDraft): RuleResult<ProjectDraft> {
  const name = input.name.trim();
  if (!name) return fail(violation("name_required", "a project needs a name", "name"));
  if (input.contractAmount !== null && (!Number.isFinite(input.contractAmount) || input.contractAmount < 0)) {
    return fail(violation("amount_negative", "a contract amount cannot be negative", "contractAmount"));
  }
  const currency = input.currency.trim().toUpperCase();
  if (!currency) return fail(violation("currency_required", "a project needs a currency", "currency"));
  if (!(ENGAGEMENT_TYPES as readonly string[]).includes(input.engagementType)) {
    return fail(violation("unknown_engagement", `${String(input.engagementType)} is not an engagement type`, "engagementType"));
  }
  return ok({
    name,
    managerSub: input.managerSub?.trim() || null,
    contractAmount: input.contractAmount,
    currency,
    endsAt: input.endsAt,
    engagementType: input.engagementType,
  });
}

export function planNewProject(input: NewProjectDraft, facts: ProjectLinkFacts): RuleResult<NewProjectDraft> {
  const projectNo = input.projectNo.trim();
  if (!projectNo) return fail(violation("project_no_required", "a project needs a number", "projectNo"));
  const f = fields(input);
  if (!f.ok) return f as RuleResult<NewProjectDraft>;
  if (!facts.accountFound) return fail(violation("account_not_found", "that customer was not found", "accountId"));
  if (input.opportunityId) {
    if (facts.opportunityAccountId === null || facts.opportunityAccountId === undefined) {
      return fail(violation("opportunity_not_found", "that deal was not found", "opportunityId"));
    }
    if (facts.opportunityAccountId !== input.accountId) {
      return fail(violation("opportunity_other_account", "that deal belongs to another customer", "opportunityId"));
    }
  }
  return ok({ ...f.value, projectNo, accountId: input.accountId, opportunityId: input.opportunityId || null });
}

/** An EDIT. The number, customer and deal do not move; the status has its own verbs. */
export function planProjectEdit(current: { status: string }, input: ProjectDraft): RuleResult<ProjectDraft> {
  if ((SETTLED as readonly string[]).includes(current.status)) {
    return fail(violation("project_settled", `a ${current.status} project is a record`, "status"));
  }
  return fields(input);
}

/**
 * Calling a project off. Only from planning, active or on hold - a delivered or
 * closed one finished - and never while money has been invoiced or received on
 * it: those instalments are facts the customer was told, and a project that
 * stops owing nothing is a different claim from one that was never paid for.
 */
export function planProjectCancel(
  current: { status: string },
  instalments: readonly { status: string }[],
): RuleResult<{ status: "cancelled" }> {
  if (!(CANCELLABLE as readonly string[]).includes(current.status)) {
    return fail(violation("illegal_transition", `a ${current.status} project cannot be cancelled`, "status"));
  }
  if (instalments.some((i) => i.status === "invoiced" || i.status === "settled" || i.status === "overdue")) {
    return fail(violation("project_has_receipts", "money has been invoiced or received on this project", "status"));
  }
  return ok({ status: "cancelled" });
}
