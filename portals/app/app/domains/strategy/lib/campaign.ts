// Writing a campaign: what a create and an edit may say.
//
// Its own file, not part of lifecycle.ts: reachable-codes.test.ts attributes
// violation codes to actions by FILE, so campaign codes living beside the plan
// and execution rules would have to exist in those forms' dictionaries too.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { planAcceptsNewWork, type CampaignStatus, type PlanStatus } from "./lifecycle";

/**
 * What a campaign is written with. The status is NOT here: a new campaign is a
 * draft and `planCampaignTransition` owns every move after that, for the reason
 * plans give (a form must not be a second door into a state).
 */
export interface CampaignDraft {
  name: string;
  planId: string | null;
  segmentId: string | null;
  channel: string | null;
  /** A plain number; the currency is its own field. Null = no budget stated. */
  budgetAmount: number | null;
  currency: string;
  ownerSub: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface NewCampaignDraft extends CampaignDraft {
  /** Unique per workspace and NOT writable afterwards - the anchor attribution quotes. */
  campaignNo: string;
}

function planCampaignFields(input: CampaignDraft): RuleResult<CampaignDraft> {
  const name = input.name.trim();
  if (!name) return fail(violation("name_required", "a campaign needs a name", "name"));
  if (input.budgetAmount !== null && (!Number.isFinite(input.budgetAmount) || input.budgetAmount < 0)) {
    return fail(violation("budget_negative", "a budget cannot be negative", "budgetAmount"));
  }
  if (input.startsAt && input.endsAt && input.endsAt.getTime() < input.startsAt.getTime()) {
    return fail(violation("window_inverted", "a campaign cannot end before it starts", "endsAt"));
  }
  const currency = input.currency.trim().toUpperCase();
  if (!currency) return fail(violation("currency_required", "a campaign needs a currency", "currency"));
  return ok({
    name,
    planId: input.planId || null,
    segmentId: input.segmentId || null,
    channel: input.channel?.trim() || null,
    budgetAmount: input.budgetAmount,
    currency,
    ownerSub: input.ownerSub?.trim() || null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });
}

export function planNewCampaign(input: NewCampaignDraft): RuleResult<NewCampaignDraft> {
  const campaignNo = input.campaignNo.trim();
  if (!campaignNo) return fail(violation("campaign_no_required", "a campaign needs a number", "campaignNo"));
  const fields = planCampaignFields(input);
  if (!fields.ok) return fields as RuleResult<NewCampaignDraft>;
  return ok({ ...fields.value, campaignNo });
}

/**
 * An EDIT. The number is not an argument (no UPDATE grant) and neither is the
 * status (the transition owns it). A campaign that completed or was cancelled is
 * a record - what ran, and what attribution points at - and is not edited.
 */
export function planCampaignEdit(
  current: { status: CampaignStatus },
  input: CampaignDraft,
): RuleResult<CampaignDraft> {
  if (current.status === "completed" || current.status === "cancelled") {
    return fail(violation("campaign_settled", `a ${current.status} campaign is a record`, "status"));
  }
  return planCampaignFields(input);
}


/**
 * Where a campaign may hang. A plan must exist in THIS workspace and still
 * accept new work (only an active plan attracts it); a segment must exist here
 * too. An id from another tenant reads as not found, never as a link. `keep` is
 * the plan an edited campaign ALREADY hangs under, which stays even if that plan
 * has since moved on.
 */
export function checkCampaignLinks(
  input: { planId: string | null; segmentId: string | null },
  facts: { plan: { status: PlanStatus } | null; segmentIds: readonly string[] },
  keep?: { planId: string | null },
): RuleResult<true> {
  if (input.planId && input.planId !== keep?.planId) {
    if (!facts.plan) return fail(violation("plan_not_found", "that plan was not found", "planId"));
    if (!planAcceptsNewWork(facts.plan.status)) {
      return fail(violation("plan_not_accepting", "only an active plan takes new campaigns", "planId"));
    }
  }
  if (input.segmentId && !facts.segmentIds.includes(input.segmentId)) {
    return fail(violation("segment_not_found", "that segment was not found", "segmentId"));
  }
  return ok(true);
}
