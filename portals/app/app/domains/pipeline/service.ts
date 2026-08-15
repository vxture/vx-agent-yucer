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
import type { OpportunityRecord, PipelineStore } from "./store";

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
): Promise<RuleResult<{ stage: Stage; journalled: true }>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.opportunity.advance", "data");
  if (!gate.allowed) return denied(gate);

  const current = await ctx.store.getOpportunity(ctx.workspaceId, opportunityId);
  if (!current) {
    // Same answer for "does not exist" and "belongs to another workspace":
    // distinguishing them turns a 404 into an existence oracle.
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }

  const plan = planStageChange(
    {
      stage: current.stage,
      status: current.status,
      probability: current.probability,
      closedAt: current.closedAt,
    },
    { ...input, actorSub: ctx.sub },
  );
  if (!plan.ok) return plan as RuleResult<{ stage: Stage; journalled: true }>;

  const applied = await ctx.store.applyStageChange(ctx.workspaceId, opportunityId, plan.value);
  if (!applied) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }
  return ok({ stage: plan.value.patch.stage, journalled: true });
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
