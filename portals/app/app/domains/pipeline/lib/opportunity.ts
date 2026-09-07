// Bringing a deal into existence directly.
//
// Until now a deal could only be BORN FROM A LEAD. `convertLeadToOpportunity`
// is the sole caller of `createOpportunity`, so a rep who heard about a deal in
// a corridor had nowhere to put it - the action `pipeline.opportunity.create`
// had sat in the catalogue since batch 1 with nothing behind it (TD-016).
//
// The model had already decided this was allowed, in two places that could not
// both be reached:
//
//   * `AttributionSource` names `self_sourced`, and
//   * `resolveAttribution({})` has a branch whose basis is literally "no lead".
//
// Nothing could produce either, because the only caller always had a lead. The
// rule layer anticipated the case and the product never offered it.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { isNonNegative, type Money } from "../../shared/money";
import { resolveAttribution, type Attribution } from "./attribution";

export interface NewOpportunityDraft {
  name: string;
  accountId: string;
  territoryId: string | null;
  ownerSub: string | null;
  /**
   * What the customer wants, in their terms (incr/0034).
   *
   * NOT THE DEAL'S NAME. A name is a label somebody types to find the row
   * again - "华东零售 POS 二期" - and it says nothing about the need. This is
   * the sentence that makes the deal judgeable by whoever did not sit in the
   * meeting.
   */
  requirement: string | null;
  amount: Money | null;
  expectedCloseAt: Date | null;
  /**
   * The delivered project this deal renews, when it is a renewal.
   *
   * Optional because most deals are not renewals, and absent is the honest
   * answer for them rather than a null somebody has to remember to pass.
   */
  sourceProjectId?: string | null;
}

export interface PlannedOpportunity extends NewOpportunityDraft {
  /** Frozen at creation and never recomputed - see resolveAttribution. */
  readonly attribution: Attribution;
}

/**
 * Validate a directly-created deal and settle its attribution.
 *
 * ATTRIBUTION IS RESOLVED HERE, not left null by the caller. `campaign_id` has
 * no UPDATE grant, so whatever is written at creation is what the traceability
 * join will report forever; deciding it in the rule layer means the answer for
 * a self-sourced deal comes from the same function that answers it for a
 * converted one, rather than from an omission.
 *
 * A direct deal has no lead and no signal, so it is self-sourced by
 * construction. That is not a default - it is the last branch of a rule that
 * has always been there.
 *
 * UNLESS IT RENEWS SOMETHING. `sourceProjectId` names the delivered project a
 * renewal comes from, and a renewal is attributed to that project rather than
 * to a rep going out and finding it. Same call, same function, one more fact
 * passed in - which is the point of resolving attribution here rather than at
 * each caller.
 */
export function planNewOpportunity(input: NewOpportunityDraft): RuleResult<PlannedOpportunity> {
  const name = input.name.trim();
  if (!name) {
    return fail(violation("name_required", "a deal needs a name", "name"));
  }
  if (!input.accountId) {
    // Which customer this is for is not optional. An account-less deal cannot
    // be reached from the account it belongs to, and every judgement rule in
    // D4 reads deals through the account.
    return fail(violation("account_required", "a deal needs a customer", "accountId"));
  }
  // AN OWNER IS A RULE NOW, not a habit (owner, 2026-09-06; incr/0034).
  // `owner_sub` was nullable and this function never looked at it -
  // createOpportunity filled it with the caller's own subject, so every path
  // through that one function got an owner and anything else could write a
  // deal nobody owned. Three paths create opportunities in this product and
  // one of them reaches the store directly.
  //
  // The caller still decides WHO. Defaulting to the creator is a reasonable
  // convention and the surfaces apply it; a rule that silently supplied a
  // name would be the same coincidence one layer up.
  if (!input.ownerSub?.trim()) {
    return fail(violation("owner_required", "a deal needs somebody to own it", "ownerSub"));
  }

  // AND IT SAYS WHAT THE CUSTOMER WANTS. This did not exist in the schema at
  // all: name, amount, probability and expected close were there, and what
  // they actually need was nowhere. A deal that cannot say what it is for
  // cannot be judged by anybody who did not sit in the meeting.
  const requirement = input.requirement?.trim() ?? "";
  if (!requirement) {
    return fail(
      violation("requirement_required", "a deal has to say what the customer wants", "requirement"),
    );
  }

  if (input.amount && !isNonNegative(input.amount)) {
    return fail(violation("amount_negative", "a deal amount cannot be negative", "amount"));
  }

  return ok({
    ...input,
    name,
    requirement,
    sourceProjectId: input.sourceProjectId ?? null,
    attribution: resolveAttribution({ renewalOfProjectId: input.sourceProjectId }),
  });
}
