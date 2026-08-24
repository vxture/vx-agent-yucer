// D6 application service: the layer that composes gate -> rule -> persistence.
//
// design_yucer_100 section 5 defines four layers that tighten progressively, and
// this is where the tightening actually happens for the pipeline domain:
//
//   authorize()          may this member do it, in this workspace, at this tier
//   planStageChange()    is the change legal under the stage machine
//   applyStageChange()   write the patch and the journal, atomically
//   column locks         the database backstop, which must never be the first
//                        thing to say no
//
// No layer is skippable and the order is fixed. In particular the gate runs
// BEFORE the rule: a member who may not touch the pipeline should be told that,
// not told their stage transition was invalid.

import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import type { Decision } from "../../authz/gate";
import { fail, ok, violation, type RuleResult, type Violation } from "../shared/result";
import { isNonNegative } from "../shared/money";
import {
  planCategoryChange,
  planSnapshot,
  type ForecastScope,
  type SnapshotRow,
} from "./lib/forecast";
import {
  planProbabilityOverride,
  planStageChange,
  type Stage,
  type StageChangeInput,
} from "./lib/stage";
import type {
  CommercialTermsPatch,
  NewWinLossReview,
  OpportunityRecord,
  PipelineStore,
  StageEventRecord,
  WinLossReviewRecord,
} from "./store";

export interface PipelineContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: PipelineStore;
}

/** A gate refusal, shaped so a route can turn it into the right status code. */
export function denied<T>(decision: Decision): RuleResult<T> {
  return fail(
    violation(
      decision.reason ?? "denied",
      decision.reason === "permission_denied"
        ? `missing permission ${decision.requiredPerm}`
        : `requires ${decision.requiredTier ?? "a subscription"}`,
      "authorization",
    ),
  );
}

export async function listPipeline(
  ctx: PipelineContext,
  filter: Parameters<PipelineStore["listOpportunities"]>[1] = {},
): Promise<RuleResult<OpportunityRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listOpportunities(ctx.workspaceId, filter));
}

/**
 * Advance (or regress) an opportunity's stage.
 *
 * The actor is taken from the context, never from the request body: a caller
 * that could name the actor could attribute its own stage change to someone
 * else, and the journal is the record of who moved the deal.
 */
export async function advanceStage(
  ctx: PipelineContext,
  opportunityId: string,
  input: Omit<StageChangeInput, "actorSub">,
): Promise<RuleResult<{ stage: Stage; journalled: true; reviewRequired: boolean }>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.opportunity.advance", "data");
  if (!gate.allowed) return denied(gate);

  const current = await ctx.store.getOpportunity(ctx.workspaceId, opportunityId);
  if (!current) {
    // Same answer for "does not exist" and "belongs to another workspace":
    // distinguishing them turns a 404 into an existence oracle.
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }

  // The review state is loaded, not assumed. Without it hasWinLossReview is
  // undefined, requiresWinLossReview is always true, and re-closing an already
  // reviewed deal would demand a second review - which the unique index on
  // opportunity_id would then reject.
  const existingReview = await ctx.store.getWinLossReview(ctx.workspaceId, opportunityId);

  const plan = planStageChange(
    {
      stage: current.stage,
      status: current.status,
      probability: current.probability,
      closedAt: current.closedAt,
      hasWinLossReview: existingReview != null,
    },
    { ...input, actorSub: ctx.sub },
  );
  if (!plan.ok) return plan as RuleResult<{ stage: Stage; journalled: true; reviewRequired: boolean }>;

  const applied = await ctx.store.applyStageChange(ctx.workspaceId, opportunityId, plan.value);
  if (!applied) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }
  // Surfaced rather than enforced inline. The spec requires a review on close,
  // but blocking the close until someone writes one would push people to leave
  // deals open instead - and an open deal that is really lost is worse for every
  // number than a closed one missing its review. The debt is made visible by
  // listPendingReviews() instead.
  return ok({
    stage: plan.value.patch.stage,
    journalled: true,
    reviewRequired: plan.value.requiresWinLossReview,
  });
}

/**
 * Reprice a deal: what it is worth, when it lands, how likely, which bucket.
 *
 * Every field runs through the rule that owns it rather than being written as
 * typed. Two of those rules were previously unreachable from any surface:
 *
 *   - planProbabilityOverride() rejects a terminal deal and anything outside
 *     0-100. Without a caller, the whole "a human override wins and the machine
 *     keeps its hands off" design was untestable in practice - the machine can
 *     only decline to overwrite an override that someone was able to make.
 *   - planCategoryChange() keeps `closed` and a terminal stage agreeing in both
 *     directions, so this cannot be the path that forecasts an open deal as
 *     closed.
 *
 * An empty patch is refused rather than silently succeeding: a no-op write that
 * reports success reads to the caller as "saved" and to the database as nothing.
 */
export async function updateCommercialTerms(
  ctx: PipelineContext,
  opportunityId: string,
  input: CommercialTermsPatch,
): Promise<RuleResult<OpportunityRecord>> {
  // TWO gates, because this patch spans two capabilities that the product sells
  // and staffs separately.
  //
  // Pricing a deal is `pipeline.opportunity.update` (pipeline.manage, free tier,
  // held by the rep who owns the deal). Moving its FORECAST BUCKET is
  // `pipeline.forecast.categorize` (pipeline.forecast, pro tier) - the catalog
  // gives sales_rep pipeline.write WITHOUT pipeline.forecast on purpose
  // ("owns the deal, not the forecast commitment"), and
  // 50-role-permission-catalog.md assigns adjusting the category to
  // pipeline.forecast in as many words.
  //
  // Folding both under the editing gate handed a free-tier rep the commit
  // number the product sells as a pro capability. Checking each field against
  // the gate that owns it means a caller may price a deal they cannot
  // categorise, and vice versa, which is exactly the split the catalog draws.
  const editGate = can(ctx.holder, ctx.entitlement, "pipeline.opportunity.update", "data");
  const categorizeGate = can(ctx.holder, ctx.entitlement, "pipeline.forecast.categorize", "data");

  const wantsEdit =
    input.amount !== undefined ||
    input.probability !== undefined ||
    input.expectedCloseAt !== undefined ||
    input.ownerSub !== undefined;
  const wantsCategory = input.forecastCategory !== undefined;

  if (wantsEdit && !editGate.allowed) return denied(editGate);
  if (wantsCategory && !categorizeGate.allowed) return denied(categorizeGate);
  // An empty request is refused on the weaker gate rather than reported as
  // "nothing changed", so an unauthorized caller learns nothing from the shape.
  if (!wantsEdit && !wantsCategory && !editGate.allowed) return denied(editGate);

  const current = await ctx.store.getOpportunity(ctx.workspaceId, opportunityId);
  if (!current) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }

  const patch: CommercialTermsPatch = {};
  const problems: Violation[] = [];

  if (input.amount !== undefined) {
    if (input.amount != null && !isNonNegative(input.amount)) {
      problems.push(violation("amount_negative", "a deal cannot be worth less than nothing", "amount"));
    } else {
      patch.amount = input.amount;
    }
  }

  if (input.probability !== undefined) {
    const planned = planProbabilityOverride(current, input.probability);
    if (!planned.ok) problems.push(...planned.violations);
    else patch.probability = planned.value.probability;
  }

  if (input.forecastCategory !== undefined) {
    const planned = planCategoryChange(current, input.forecastCategory);
    if (!planned.ok) problems.push(...planned.violations);
    else patch.forecastCategory = planned.value.forecastCategory;
  }

  if (input.expectedCloseAt !== undefined) patch.expectedCloseAt = input.expectedCloseAt;
  if (input.ownerSub !== undefined) patch.ownerSub = input.ownerSub;

  if (problems.length > 0) return { ok: false, violations: problems };
  if (Object.keys(patch).length === 0) {
    return fail(violation("empty_patch", "nothing was changed", "patch"));
  }

  const applied = await ctx.store.updateCommercialTerms(ctx.workspaceId, opportunityId, patch);
  if (!applied) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }

  const updated = await ctx.store.getOpportunity(ctx.workspaceId, opportunityId);
  if (!updated) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }
  return ok(updated);
}

/**
 * One opportunity, behind the same gate as the list.
 *
 * The detail page used to call store.getOpportunity() directly - the identical
 * mistake getAccountDetail() exists to correct, shipped in the same round. A
 * page holding a store handle is how a URL becomes a way around a gate: today
 * every role carries pipeline.read and pipeline.manage is a free-tier feature,
 * so nothing leaks, but that is a property of the current catalog rather than
 * of the code, and it is exactly the reasoning the account fix refused to rest
 * on.
 */
export async function getOpportunityDetail(
  ctx: PipelineContext,
  opportunityId: string,
): Promise<RuleResult<OpportunityRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.view", "data");
  if (!gate.allowed) return denied(gate);

  const row = await ctx.store.getOpportunity(ctx.workspaceId, opportunityId);
  if (!row) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }
  return ok(row);
}

/**
 * The stage journal for one opportunity, oldest first.
 *
 * Gated on `pipeline.view` rather than on the advance permission: the history is
 * a READ of the same deal the list already shows, and requiring the write
 * permission to see how a deal got where it is would hide the audit trail from
 * exactly the people - leadership, finance - who read it and never move deals.
 *
 * Returns not_found for a missing opportunity AND for one in another workspace,
 * for the same reason getOpportunity does: distinguishing them turns the 404
 * into an existence oracle.
 */
export async function stageHistory(
  ctx: PipelineContext,
  opportunityId: string,
): Promise<RuleResult<StageEventRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.view", "data");
  if (!gate.allowed) return denied(gate);

  const current = await ctx.store.getOpportunity(ctx.workspaceId, opportunityId);
  if (!current) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }
  return ok(await ctx.store.listStageEvents(ctx.workspaceId, opportunityId));
}

/**
 * Closed deals with no review yet.
 *
 * The spec says a terminal stage MUST produce a review. A rule that says "must"
 * with no way to see what is outstanding is unenforceable, so this is the list
 * that makes it enforceable by a human rather than by a blocked form.
 */
export async function listPendingReviews(
  ctx: PipelineContext,
  limit = 50,
): Promise<RuleResult<OpportunityRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.winloss.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listUnreviewedClosed(ctx.workspaceId, limit));
}

/**
 * Record (or revise) the win/loss review.
 *
 * The outcome is derived from the opportunity's status, never taken from the
 * caller: a review claiming "won" on a lost deal would corrupt the one dataset
 * the learning loop reads, and the caller has no business asserting it.
 */
export async function recordWinLossReview(
  ctx: PipelineContext,
  opportunityId: string,
  input: Omit<NewWinLossReview, "outcome" | "reviewerSub">,
): Promise<RuleResult<WinLossReviewRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.winloss.record", "data");
  if (!gate.allowed) return denied(gate);

  const opportunity = await ctx.store.getOpportunity(ctx.workspaceId, opportunityId);
  if (!opportunity) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }
  if (opportunity.status !== "won" && opportunity.status !== "lost") {
    return fail(
      violation("not_closed", "only a closed opportunity has a win/loss outcome to review", "status"),
    );
  }

  return ok(
    await ctx.store.saveWinLossReview(ctx.workspaceId, opportunityId, {
      ...input,
      outcome: opportunity.status,
      // The reviewer is the session subject. A caller that could name the
      // reviewer could attribute a post-mortem to someone who never wrote it.
      reviewerSub: ctx.sub,
    }),
  );
}

/**
 * Submit a forecast snapshot.
 *
 * Gated on `pipeline.forecast.snapshot`, which needs the dedicated
 * pipeline.forecast permission rather than pipeline.write: advancing a deal and
 * committing a number upward are different acts by different people.
 */
/**
 * Every snapshot taken for a period, oldest first.
 *
 * THIS IS THE ONLY REASON forecast_snapshot IS APPEND-ONLY. The DDL revokes
 * UPDATE on it so accuracy can be measured - period-end actual against what was
 * forecast at period start - and that measurement is impossible unless the
 * whole series survives. Until now nothing read it back, so the immutability
 * was a cost the product paid and never collected on.
 *
 * Gated on pipeline.forecast.view, the read half of the forecast permission:
 * seeing what the team committed to and having committed it are the same
 * privilege, and a rep who may not forecast may not audit the forecast either.
 */
export async function forecastHistory(
  ctx: PipelineContext,
  period: string,
  scopeType: "workspace" | "territory" | "owner" = "workspace",
): Promise<RuleResult<SnapshotRow[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.forecast.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listForecastSnapshots(ctx.workspaceId, { period, scopeType }));
}

export async function submitForecast(
  ctx: PipelineContext,
  input: { period: string; scope: ForecastScope; currency?: string; snapshotAt?: Date },
): Promise<RuleResult<SnapshotRow>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.forecast.snapshot", "data");
  if (!gate.allowed) return denied(gate);

  // Closed deals are included: closed_amount is part of the snapshot and is what
  // attainment is measured from.
  const opportunities = await ctx.store.listOpportunities(ctx.workspaceId, { includeClosed: true });
  const row = planSnapshot({ ...input, opportunities });
  if (!row.ok) return row;

  await ctx.store.appendForecastSnapshot(ctx.workspaceId, row.value);
  return ok(row.value);
}
