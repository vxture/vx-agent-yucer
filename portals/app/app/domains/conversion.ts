// The lead -> opportunity seam.
//
// This lives in its own module, named for what it is, rather than inside D5 or
// D6. It is the one place two domains have to touch, and hiding that inside
// either of them would make the ownership rule look violated by whichever one
// held it. D5 owns the lead, D6 owns the opportunity; this function is the
// hand-off and nothing else.
//
// It is also the seam the entire traceability claim rests on. The campaign is
// COPIED from the lead onto the opportunity, and from that moment neither side
// can change it - lead.campaign_id and opportunity.campaign_id both have no
// UPDATE grant. That is what makes "how much of this quarter came from that
// campaign" a join instead of a tally.
//
// Ordering matters and is not arbitrary:
//   1. plan the conversion (gates + rules, no writes)
//   2. create the opportunity (D6)
//   3. close the loop on the lead (D5)
//
// If step 3 fails after step 2, the outcome is an orphaned opportunity and a
// lead still marked qualified - visible, recoverable, and honest. The reverse
// order would mark a lead converted with no opportunity behind it, which reads
// as complete and is not.

import type { Entitlement } from "../entitlement/types";
import type { PermissionHolder } from "../authz/decide";
import { fail, ok, violation, type RuleResult } from "./shared/result";
import { money, type Money } from "./shared/money";
import { completeConversion, convertLead } from "./signal/service";
import type { SignalStore } from "./signal/store";
import type { Attribution } from "./pipeline/lib/attribution";
import type { OpportunityRecord, PipelineStore } from "./pipeline/store";

export interface ConversionContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  signalStore: SignalStore;
  pipelineStore: PipelineStore;
}

export interface ConversionOutcome {
  opportunity: OpportunityRecord;
  attribution: Attribution;
  leadId: string;
}

export interface ConvertInput {
  leadId: string;
  /** Required when the lead was never matched to an account. */
  accountId?: string;
  name?: string;
  amount?: Money;
  currency?: string;
  territoryId?: string | null;
  planId?: string | null;
  expectedCloseAt?: Date | null;
}

/**
 * Convert a qualified lead into an opportunity, in the order above.
 *
 * Both gates run inside convertLead(), which is gated as a PIPELINE write -
 * the receiving side owns the seam. A marketing manager who may triage signals
 * cannot create a deal.
 */
export async function convertLeadToOpportunity(
  ctx: ConversionContext,
  input: ConvertInput,
): Promise<RuleResult<ConversionOutcome>> {
  const signalCtx = {
    workspaceId: ctx.workspaceId,
    sub: ctx.sub,
    holder: ctx.holder,
    entitlement: ctx.entitlement,
    store: ctx.signalStore,
  };

  // 1. Gates and rules. Nothing is written yet.
  const plan = await convertLead(signalCtx, input.leadId, {
    accountId: input.accountId,
    planId: input.planId,
  });
  if (!plan.ok) return plan as RuleResult<ConversionOutcome>;

  const lead = await ctx.signalStore.getLead(ctx.workspaceId, input.leadId);
  if (!lead) return fail(violation("not_found", `lead ${input.leadId} was not found`, "leadId"));

  const currency = input.currency ?? input.amount?.currency ?? "CNY";

  // 2. D6 creates the opportunity, carrying the frozen attribution.
  const opportunity = await ctx.pipelineStore.createOpportunity(ctx.workspaceId, {
    name: input.name?.trim() || lead.companyName,
    accountId: plan.value.opportunity.accountId,
    campaignId: plan.value.opportunity.campaignId,
    planId: plan.value.opportunity.planId,
    territoryId: input.territoryId ?? null,
    // The lead's owner follows the deal. Reassigning is a later, deliberate act.
    ownerSub: lead.ownerSub ?? ctx.sub,
    amount: input.amount ?? null,
    currency,
    expectedCloseAt: input.expectedCloseAt ?? null,
  });

  // 3. Close the loop. An opportunity now exists for the lead to point at.
  const closed = await completeConversion(signalCtx, input.leadId, opportunity.id);
  if (!closed.ok) {
    // The opportunity is real and stays. Reporting the partial state is the
    // honest outcome: silently rolling back a row someone can already see would
    // be worse than saying the link is missing.
    return fail(
      violation(
        "conversion_incomplete",
        `opportunity ${opportunity.opportunityNo} was created but lead ${input.leadId} was not marked converted`,
        "leadId",
      ),
    );
  }

  return ok({ opportunity, attribution: plan.value.attribution, leadId: input.leadId });
}

/** Convenience for a caller that has only a number and a currency string. */
export function amountOf(value: number | null | undefined, currency = "CNY"): Money | undefined {
  return value == null || Number.isNaN(value) ? undefined : money(value, currency);
}
