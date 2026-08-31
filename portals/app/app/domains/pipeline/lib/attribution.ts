// Attribution (docs/20-specs/30-business-rules.md sections 3 and 4).
//
// Attribution answers "where did this deal come from", and the product's whole
// traceability claim rests on it being computed ONCE, at creation, from facts
// rather than from someone's later opinion. The column locks enforce that:
// lead.signal_id, lead.campaign_id and opportunity.campaign_id have no UPDATE
// grant at all.
//
// That immutability is deliberate and is worth stating plainly, because it will
// be argued with. Allowing attribution to be edited after the fact is allowing
// credit for revenue to be reassigned after the fact - after everyone can see
// which allocation pays better. Marketing and sales then have no arbitrable
// record of who sourced what. A genuinely wrong attribution is corrected as a
// data correction through db-init, where it leaves a trace, not as an
// application write, where it does not.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export type AttributionSource = "campaign" | "signal_campaign" | "renewal" | "self_sourced";

export interface Attribution {
  source: AttributionSource;
  campaignId: string | null;
  /** Which input decided it, for the "why does this say that" question. */
  basis: string;
}

export interface LeadFacts {
  id: string;
  campaignId: string | null;
  signalId: string | null;
}

export interface SignalFacts {
  id: string;
  /** web / news / campaign / crm / manual / partner. */
  source: string;
  /** External id or URL. When source is "campaign", this identifies the campaign. */
  sourceRef: string | null;
}

/**
 * Resolve a new opportunity's attribution: first non-empty of
 *
 *   1. the lead's own campaign (inherited when the lead was created)
 *   2. the campaign the lead's originating signal came from
 *   3. the project it renews
 *   4. self-sourced
 *
 * Called exactly once, when the opportunity is created. Never recomputed - a
 * later call could return a different answer once a campaign is archived, and
 * the record of where demand came from must not depend on when you ask.
 */
export function resolveAttribution(input: {
  lead?: LeadFacts | null;
  signal?: SignalFacts | null;
  /** The delivered project this deal renews, when it is a renewal. */
  renewalOfProjectId?: string | null;
}): Attribution {
  const lead = input.lead ?? null;
  const signal = input.signal ?? null;

  if (lead?.campaignId) {
    return { source: "campaign", campaignId: lead.campaignId, basis: `lead ${lead.id} campaign` };
  }

  // A signal whose source IS a campaign carries the campaign in source_ref.
  // Signals have no campaign_id column: the evidence records where it came from,
  // and for campaign-sourced evidence that reference IS the campaign.
  if (signal && signal.source === "campaign" && signal.sourceRef) {
    return {
      source: "signal_campaign",
      campaignId: signal.sourceRef,
      basis: `signal ${signal.id} source_ref`,
    };
  }

  // A RENEWAL IS NOT SELF-SOURCED, and that distinction is the whole reason
  // this branch exists rather than letting renewals fall through the bottom.
  // Self-sourced says a rep went and found this; a renewal says a delivery
  // team earned it. Collapsing the two credits new business for revenue the
  // existing book produced - the same reassignment of credit the immutability
  // above exists to prevent, only done at creation where nobody would see it.
  //
  // campaignId stays null. Inheriting the ORIGINAL deal's campaign would let
  // one campaign keep earning credit for every term a customer ever renews,
  // which is how a campaign report becomes a story about its own past.
  if (input.renewalOfProjectId) {
    return {
      source: "renewal",
      campaignId: null,
      basis: `renewal of project ${input.renewalOfProjectId}`,
    };
  }

  return {
    source: "self_sourced",
    campaignId: null,
    basis: lead ? `lead ${lead.id} has no campaign lineage` : "no lead",
  };
}

export interface ConversionPlan {
  /** Written onto the new opportunity, then frozen. */
  opportunity: { accountId: string; campaignId: string | null; planId: string | null };
  /** Written back onto the lead to close the loop. */
  lead: { status: "converted"; convertedOpportunityId: null };
  attribution: Attribution;
}

/**
 * Plan the lead -> opportunity conversion.
 *
 * This is the seam of the whole traceability chain: the lead's campaign is
 * COPIED onto the opportunity, and after the copy neither side may change it.
 * `converted_opportunity_id` is filled in by the caller once the opportunity row
 * exists, which is why it is null here - the plan is computed before the insert.
 */
export function planConversion(input: {
  lead: LeadFacts & { status: string; accountId: string | null };
  signal?: SignalFacts | null;
  /** Required: an opportunity cannot exist without an account (NOT NULL + FK). */
  accountId?: string | null;
  planId?: string | null;
}): RuleResult<ConversionPlan> {
  const { lead } = input;

  // Only a qualified lead converts. Converting from `new` skips the judgement
  // the qualify step exists to make; converting an already-converted lead would
  // create a second opportunity for one piece of demand and double-count it.
  if (lead.status !== "qualified") {
    return fail(
      violation(
        "lead_not_qualified",
        `lead ${lead.id} is ${lead.status}; only a qualified lead converts`,
        "status",
      ),
    );
  }

  const accountId = input.accountId ?? lead.accountId;
  if (!accountId) {
    return fail(
      violation(
        "account_required",
        "an opportunity must belong to an account; match the lead to one first",
        "accountId",
      ),
    );
  }

  const attribution = resolveAttribution({ lead, signal: input.signal });
  return ok({
    opportunity: {
      accountId,
      campaignId: attribution.campaignId,
      planId: input.planId ?? null,
    },
    lead: { status: "converted", convertedOpportunityId: null },
    attribution,
  });
}

// THE FROZEN-KEY GUARD USED TO END THIS FILE, and it is gone (2026-08-31)
// along with `assertNoKeys` and the two key lists it read. Its whole argument
// was in its own docstring: "the column locks would reject it anyway, but as
// `permission denied` at the driver, far from the code that caused it." That
// is true, and it is what `column-locks.assertWritable` does - generically,
// against the mirror of the DDL grants, before every adapter write, for every
// frozen column rather than these four. This was the second answer.
//
// The sentences it carried were the part worth keeping, and they moved to
// FROZEN_COLUMN_REASON, where assertWritable now says them and three tests
// prove each one names a real column, a frozen one, and reaches the refusal.
