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
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { planSnapshot, type ForecastScope, type SnapshotRow } from "./lib/forecast";
import { planStageChange, type Stage, type StageChangeInput } from "./lib/stage";
import type {
  NewWinLossReview,
  OpportunityRecord,
  PipelineStore,
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
