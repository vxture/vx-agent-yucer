// D1 strategy and D3 campaign application service.
//
// campaignReturn() is the function this whole product exists to make possible.
// The README's thesis is that a broken chain leaves "how much of this quarter's
// pipeline actually came from the segment we decided to attack" unanswerable.
// This answers it with a join, because attribution was captured at creation and
// frozen - not by asking anyone to tally it.

import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import { sumMoney, type Money } from "../shared/money";
import {
  canCompleteCampaign,
  executionProgress,
  planCampaignTransition,
  planStrategyTransition,
  validateCampaignWindow,
  type CampaignStatus,
  type PlanStatus,
  planExecution,
  planNewPlan,
  type ExecutionDraft,
  type NewPlanDraft,
} from "./lib/lifecycle";
import type { CampaignRecord, ExecutionRecord, PlanRecord, StrategyStore } from "./store";

export interface StrategyContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: StrategyStore;
}

export async function listPlans(
  ctx: StrategyContext,
  filter: { period?: string; status?: PlanStatus } = {},
): Promise<RuleResult<PlanRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.plan.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listPlans(ctx.workspaceId, filter));
}

/**
 * Bring a plan into existence.
 *
 * `strategy.plan.create` has been in the action catalogue since batch 1 with
 * nothing behind it (TD-016). The port had list, get and update, and
 * `/strategy` renders the list and moves plans through their lifecycle - so a
 * plan could be approved, activated, closed and archived, and could not be
 * created. Every plan in every workspace would have had to arrive by db-init.
 *
 * It is upstream of more than itself: `sales_target.plan_id` and
 * `campaign.plan_id` both point here, so with no plan there is nothing for a
 * target or a campaign to hang off.
 *
 * A NEW PLAN IS A DRAFT and the status is not an argument - `transitionPlan`
 * below owns every move after this one, including the approval that stamps
 * `approved_at`.
 */
export async function createPlan(
  ctx: StrategyContext,
  input: NewPlanDraft,
): Promise<RuleResult<PlanRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "strategy.plan.create", "data");
  if (!gate.allowed) return denied(gate);

  const plan = planNewPlan(input);
  if (!plan.ok) return plan as RuleResult<PlanRecord>;

  const created = await ctx.store.createPlan(ctx.workspaceId, plan.value);
  if (!created) {
    // The unique index would refuse it anyway; saying so here names the reason
    // and the field instead of surfacing a constraint name.
    return fail(
      violation("plan_no_taken", `plan ${plan.value.planNo} already exists`, "planNo"),
    );
  }
  return ok(created);
}

export async function transitionPlan(
  ctx: StrategyContext,
  id: string,
  to: PlanStatus,
  opts: { at?: Date } = {},
): Promise<RuleResult<{ status: PlanStatus }>> {
  const action = to === "approved" ? "strategy.plan.approve" : "strategy.plan.update";
  const gate = can(ctx.holder, ctx.entitlement, action, "data");
  if (!gate.allowed) return denied(gate);

  const plan = await ctx.store.getPlan(ctx.workspaceId, id);
  if (!plan) return fail(violation("not_found", `plan ${id} was not found`, "id"));

  const next = planStrategyTransition(plan, to, opts);
  if (!next.ok) return next as RuleResult<{ status: PlanStatus }>;

  const applied = await ctx.store.updatePlan(ctx.workspaceId, id, next.value);
  if (!applied) return fail(violation("not_found", `plan ${id} was not found`, "id"));
  return ok({ status: next.value.status });
}

export async function listCampaigns(
  ctx: StrategyContext,
  filter: { planId?: string; status?: CampaignStatus } = {},
): Promise<RuleResult<CampaignRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listCampaigns(ctx.workspaceId, filter));
}

/**
 * Move a campaign along its lifecycle.
 *
 * Completing is special-cased: a campaign with outstanding executions cannot be
 * completed, because that marks demand generation as done that never happened.
 * Explicitly skipped work does not block it - skipping is a decision, pending is
 * an omission.
 */
export async function transitionCampaign(
  ctx: StrategyContext,
  id: string,
  to: CampaignStatus,
): Promise<RuleResult<{ status: CampaignStatus }>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const campaign = await ctx.store.getCampaign(ctx.workspaceId, id);
  if (!campaign) return fail(violation("not_found", `campaign ${id} was not found`, "id"));

  const window = validateCampaignWindow(campaign.startsAt, campaign.endsAt);
  if (!window.ok) return window as RuleResult<{ status: CampaignStatus }>;

  const next = planCampaignTransition(campaign, to);
  if (!next.ok) return next as RuleResult<{ status: CampaignStatus }>;

  if (to === "completed") {
    const executions = await ctx.store.listExecutions(ctx.workspaceId, id);
    const complete = canCompleteCampaign(executions);
    if (!complete.ok) return complete as RuleResult<{ status: CampaignStatus }>;
  }

  const applied = await ctx.store.updateCampaign(ctx.workspaceId, id, next.value);
  if (!applied) return fail(violation("not_found", `campaign ${id} was not found`, "id"));
  return ok({ status: next.value.status });
}

export interface CampaignReturn {
  campaign: CampaignRecord;
  progress: ReturnType<typeof executionProgress>;
  /**
   * The rows the progress is computed from.
   *
   * This read has always loaded them and thrown them away after summarising.
   * Nothing could edit an execution (TD-016), so a list of them had nowhere to
   * go - and `canCompleteCampaign` refuses to complete a campaign while any is
   * outstanding, which made a campaign with one pending item permanently
   * uncompletable.
   */
  executions: ExecutionRecord[];
  /** Opportunities whose frozen campaign_id points at this campaign. */
  attributedCount: number;
  wonCount: number;
  /** Total of everything attributed, open and closed. */
  attributedAmount: Money;
  /** Total of the won subset. */
  wonAmount: Money;
  /** wonAmount over budget, or null when no budget was set. */
  returnOnBudget: number | null;
}

/**
 * What a campaign actually produced.
 *
 * This is the join the product's thesis rests on. It is only possible because
 * opportunity.campaign_id was captured once, at conversion, and frozen by the
 * column locks - if attribution were editable, this number would measure
 * whoever last edited it rather than where the demand came from.
 */
/**
 * Create or edit one execution on a campaign.
 *
 * `campaign.execution.upsert` shipped in batch 1 with nothing behind it, and
 * this one was not merely unfinished - it was LOCKING something.
 * `canCompleteCampaign` refuses to complete a campaign while any execution is
 * outstanding, and nothing could move an execution to done or skipped. Measured
 * on the demo before this was written: camp_demo_1 (done/done/pending) was
 * refused with `executions_outstanding`; camp_demo_3 (done) completed. The lock
 * was real and the key did not exist.
 *
 * The campaign is read first: the upsert key carries no workspace of its own,
 * and the freeze rule needs the campaign's status.
 */
export async function upsertExecution(
  ctx: StrategyContext,
  campaignId: string,
  input: ExecutionDraft,
): Promise<RuleResult<ExecutionRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.execution.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const campaign = await ctx.store.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) {
    return fail(violation("not_found", `campaign ${campaignId} was not found`, "campaignId"));
  }

  const plan = planExecution(input, campaign);
  if (!plan.ok) return plan as RuleResult<ExecutionRecord>;

  const written = await ctx.store.upsertExecution(ctx.workspaceId, campaignId, plan.value);
  if (!written) {
    return fail(violation("not_found", `execution ${input.id} is not on this campaign`, "id"));
  }
  return ok(written);
}

export async function campaignReturn(
  ctx: StrategyContext,
  campaignId: string,
): Promise<RuleResult<CampaignReturn>> {
  const gate = can(ctx.holder, ctx.entitlement, "campaign.execution.view", "data");
  if (!gate.allowed) return denied(gate);

  const campaign = await ctx.store.getCampaign(ctx.workspaceId, campaignId);
  if (!campaign) return fail(violation("not_found", `campaign ${campaignId} was not found`, "id"));

  const [executions, attributed] = await Promise.all([
    ctx.store.listExecutions(ctx.workspaceId, campaignId),
    ctx.store.attributedOpportunities(ctx.workspaceId, campaignId),
  ]);

  const all = attributed.map((o) => o.amount).filter((m): m is Money => m != null);
  const won = attributed
    .filter((o) => o.status === "won")
    .map((o) => o.amount)
    .filter((m): m is Money => m != null);

  const allTotal = sumMoney(all, campaign.currency);
  if (!allTotal.ok) return allTotal as RuleResult<CampaignReturn>;
  const wonTotal = sumMoney(won, campaign.currency);
  if (!wonTotal.ok) return wonTotal as RuleResult<CampaignReturn>;

  // Return is measured against WON revenue, not against pipeline. A campaign
  // that generated a lot of unclosed pipeline has not returned anything yet, and
  // reporting it as if it had is how marketing spend gets justified twice.
  const budget = campaign.budgetAmount;
  const returnOnBudget =
    budget && budget.amount > 0 ? wonTotal.value.amount / budget.amount : null;

  return ok({
    campaign,
    progress: executionProgress(executions),
    executions,
    attributedCount: attributed.length,
    wonCount: attributed.filter((o) => o.status === "won").length,
    attributedAmount: allTotal.value,
    wonAmount: wonTotal.value,
    returnOnBudget,
  });
}
