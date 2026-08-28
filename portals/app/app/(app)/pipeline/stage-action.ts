"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getCatalogStore, getPipelineStore } from "../../domains/shared/registry";
import {
  advanceStage,
  approveLineDiscount,
  replaceOpportunityLines,
  updateCommercialTerms,
} from "../../domains/pipeline/service";
import { isStage, type Stage } from "../../domains/pipeline/lib/stage";
import { isForecastCategory } from "../../domains/pipeline/lib/forecast";
import { money } from "../../domains/shared/money";

// Moving a deal.
//
// The actor is NOT in this signature. It is taken from the session inside the
// service, because a caller that could name the actor could attribute its own
// stage change to someone else - and opportunity_stage_event is the record of
// who moved the deal.
//
// The client validates nothing that matters. It hints at which moves need a
// reason so the form is usable, but planStageChange() re-decides every rule
// server-side: a request that skips the UI entirely gets the same answer.

export interface AdvanceStageResult {
  ok: boolean;
  stage?: Stage;
  /** True when the deal has entered a terminal stage with no review on file. */
  reviewRequired?: boolean;
  error?: string;
}

export async function advanceOpportunityStage(
  opportunityId: string,
  input: { to: string; reason?: string; reopen?: boolean },
): Promise<AdvanceStageResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  // Checked before the service so an unknown string is a clean refusal rather
  // than a cast that lands in the journal.
  if (!isStage(input.to)) return { ok: false, error: "unknown_stage" };

  const result = await advanceStage(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPipelineStore(),
    },
    opportunityId,
    {
      to: input.to,
      reason: input.reason?.trim() || undefined,
      reopen: input.reopen === true,
    },
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  // Both surfaces move: the board's stage column and roll-up, and the detail
  // page's journal. Revalidating only the detail page would leave a member
  // navigating back to a board that still shows the old stage.
  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${opportunityId}`);
  return { ok: true, stage: result.value.stage, reviewRequired: result.value.reviewRequired };
}

export interface RepriceResult {
  ok: boolean;
  error?: string;
}

/**
 * Repricing. Separate from advancing because the two are different acts with
 * different permissions - `pipeline.opportunity.update` prices a deal,
 * `pipeline.opportunity.advance` moves it - and bundling them would let one
 * gate stand in for the other.
 *
 * The wire shape is strings, because that is what a form produces. Parsing
 * happens here; the rules run in the service on the parsed values.
 */
export async function repriceOpportunity(
  opportunityId: string,
  input: {
    amount?: string;
    currency?: string;
    probability?: string;
    expectedCloseAt?: string;
    forecastCategory?: string;
  },
): Promise<RepriceResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const patch: Parameters<typeof updateCommercialTerms>[2] = {};

  if (input.amount !== undefined) {
    const trimmed = input.amount.trim();
    if (trimmed === "") {
      // An emptied field means "unpriced", which is a real state a deal can be
      // in. Treating it as "no change" would make the value unclearable.
      patch.amount = null;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return { ok: false, error: "amount_invalid" };
      patch.amount = money(parsed, input.currency?.trim() || "CNY");
    }
  }

  if (input.probability !== undefined && input.probability.trim() !== "") {
    const parsed = Number(input.probability.trim());
    // Left to planProbabilityOverride to judge the range, so the surface and a
    // direct API call get the same answer from the same rule.
    if (!Number.isFinite(parsed)) return { ok: false, error: "probability_range" };
    patch.probability = parsed;
  }

  if (input.expectedCloseAt !== undefined) {
    const trimmed = input.expectedCloseAt.trim();
    if (trimmed === "") {
      patch.expectedCloseAt = null;
    } else {
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return { ok: false, error: "date_invalid" };
      patch.expectedCloseAt = parsed;
    }
  }

  if (input.forecastCategory !== undefined && input.forecastCategory.trim() !== "") {
    if (!isForecastCategory(input.forecastCategory)) {
      return { ok: false, error: "unknown_forecast_category" };
    }
    patch.forecastCategory = input.forecastCategory;
  }

  const result = await updateCommercialTerms(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPipelineStore(),
    },
    opportunityId,
    patch,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${opportunityId}`);
  return { ok: true };
}

export interface LinesResult {
  ok: boolean;
  lines?: number;
  amount?: number;
  needsApproval?: number;
  error?: string;
}

/**
 * Replacing a deal's product lines.
 *
 * REPLACE, not patch. A deal's line set is a statement about what is being
 * sold; merging a partial list into the last one leaves a removed product
 * silently in the quote. The client sends the list it wants.
 */
export async function saveOpportunityLines(
  opportunityId: string,
  lines: readonly { productId: string; quantity: number; unitPrice: number }[],
): Promise<LinesResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await replaceOpportunityLines(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPipelineStore(),
      catalog: getCatalogStore(),
    },
    opportunityId,
    lines,
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath(`/pipeline/${opportunityId}`);
  revalidatePath("/pipeline");
  return { ok: true, ...result.value };
}

/**
 * Signing off one below-floor price.
 *
 * Neither the price nor the floor crosses this boundary. The service reads both
 * off the line that is on the deal, so a caller cannot approve a number nobody
 * quoted - the same reason `needsApproval` is computed rather than sent.
 *
 * Revalidates `/pipeline` as well as the deal, because the board's
 * "pending approval" count is what this signature is meant to bring down.
 */
export async function approveDiscount(
  opportunityId: string,
  productId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await approveLineDiscount(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPipelineStore(),
      catalog: getCatalogStore(),
    },
    { opportunityId, productId, reason },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath(`/pipeline/${opportunityId}`);
  revalidatePath("/pipeline");
  return { ok: true };
}
