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
import { approvalFor, lineTotal, priceLine, type DraftLine } from "../catalog/lib/pricing";
import { planNewOpportunity, type NewOpportunityDraft } from "./lib/opportunity";
import {
  daysAtStage,
  planSuggestedCategory,
  suggestCategory,
  type CategorizableDeal,
  type CategoryVerdict,
} from "./lib/forecast-rule";
import type { CatalogStore, DiscountApprovalRecord } from "../catalog/store";
import type { Decision } from "../../authz/gate";
import { fail, ok, violation, type RuleResult, type Violation } from "../shared/result";
import { isNonNegative, money, type Money } from "../shared/money";
import { periodRange } from "../shared/period";
import {
  accuracy,
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

/** What a line is priced in when the deal has no amount yet to inherit from. */
const DEFAULT_LINE_CURRENCY = "CNY";

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
/**
 * Create a deal directly, with no lead behind it.
 *
 * `pipeline.opportunity.create` has been in the action catalogue since batch 1
 * gating nothing: `createOpportunity` had exactly one caller, the lead
 * conversion seam, so a deal could only be born from a lead (TD-016). The model
 * disagreed with the product in two places - `AttributionSource.self_sourced`
 * and `resolveAttribution`'s "no lead" branch - both unreachable.
 *
 * SEPARATE ACTION FROM `pipeline.opportunity.update`, and separate for a
 * reason the catalogue already recorded by declaring it: creating a deal
 * commits an attribution that can never be edited afterwards, because
 * `campaign_id` carries no UPDATE grant. Editing one is a smaller act than
 * bringing one into being with its lineage frozen.
 *
 * The account is NOT verified here. The foreign key is the backstop and the
 * form offers a picker, so an invented id fails at the database rather than
 * silently creating an unreachable deal - and D6 has no read of D4 to check
 * with, which is the ownership rule rather than an omission.
 */
export async function createOpportunity(
  ctx: PipelineContext,
  input: NewOpportunityDraft & { currency?: string },
): Promise<RuleResult<OpportunityRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.opportunity.create", "data");
  if (!gate.allowed) return denied(gate);

  const plan = planNewOpportunity(input);
  if (!plan.ok) return plan as RuleResult<OpportunityRecord>;

  return ok(
    await ctx.store.createOpportunity(ctx.workspaceId, {
      name: plan.value.name,
      accountId: plan.value.accountId,
      // Both null, and written by the rule rather than by this function: a
      // self-sourced deal has no campaign and no plan, and the attribution the
      // rule settled is what freezes that.
      campaignId: plan.value.attribution.campaignId,
      planId: null,
      territoryId: plan.value.territoryId,
      // Whoever creates it owns it until somebody reassigns it deliberately -
      // the same rule conversion applies to a lead's owner.
      ownerSub: plan.value.ownerSub ?? ctx.sub,
      amount: plan.value.amount,
      currency: plan.value.amount?.currency ?? input.currency ?? DEFAULT_LINE_CURRENCY,
      expectedCloseAt: plan.value.expectedCloseAt,
      // Written once, frozen after. A renewal carries the project it came
      // from; every other deal carries null, which is the honest answer and
      // not a placeholder.
      sourceProjectId: plan.value.sourceProjectId ?? null,
    }),
  );
}

/**
 * Which projects already have a deal open off them.
 *
 * D7 CANNOT ANSWER THIS and must not try. Opportunities are D6's rows, so the
 * renewal derivation gets the answer passed in and the page composes the two -
 * the same shape /routing uses to get an account's region into the router.
 *
 * Gated on `pipeline.view` - the same gate as listing deals - rather than on
 * anything delivery-side: this reveals that a deal exists, so it is D6's
 * disclosure to make. A member who may not see deals gets a refusal, and the
 * renewal page then proposes renewals that may already exist - a worse
 * suggestion, not a leak.
 */
export async function listRenewedProjectIds(
  ctx: PipelineContext,
): Promise<RuleResult<Set<string>>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listRenewalSourceProjectIds(ctx.workspaceId));
}

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
 * Gated on `pipeline.forecast.view` - which is a TIER gate, not a permission
 * one, and this comment used to say the opposite. It claimed "a rep who may not
 * forecast may not audit the forecast either"; the action asks for feature
 * `pipeline.forecast` and permission `pipeline.read`, and every selling role
 * holds pipeline.read. A sales_rep in a pro workspace reads this, and always
 * could. The arrangement is deliberate - FORECASTING is what is sold, and
 * inside a workspace that bought it, seeing what the team committed to is not a
 * privilege - but the sentence describing it was simply wrong.
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

/**
 * How close the opening forecast for a period turned out to be.
 *
 * THE READING THE IMMUTABLE TABLE EXISTS FOR. forecast_snapshot has UPDATE
 * revoked so this exact question stays answerable - period-end actual against
 * what was committed at period start - and the product has been paying that
 * cost since batch 1 while nothing asked it. The pipeline page even PROMISES
 * the number on screen ("预测准确率是期末实际对期初快照"), which is a sentence
 * about a figure that did not exist.
 *
 * THE OPENING SNAPSHOT IS THE EARLIEST ONE, not the first row returned. Sorting
 * here rather than trusting the store's order is deliberate: "oldest first" is
 * a documented property of one adapter, and the number this produces is wrong
 * in a way nobody would see if that ever slipped - a late snapshot taken when
 * the quarter was nearly closed would score near-perfect accuracy forever.
 *
 * THE ACTUAL IS COMPUTED LIVE, not read from the last snapshot. A snapshot is
 * what somebody said on the day they took it; the actual is what the deals now
 * say. Reading it from the final snapshot would make the answer depend on
 * whether anyone remembered to take one at period end - and "nobody clicked the
 * button" would silently become "the forecast was accurate".
 *
 * WORKSPACE SCOPE ONLY, and that is not a limitation being deferred: nothing in
 * this product writes a snapshot at any other scope (`submitForecastSnapshot`
 * hardcodes workspace, for want of the pickers). Owner-scope accuracy would be
 * an individual performance metric computed from a number that person files
 * themselves, which is a question worth ruling on BEFORE the data exists rather
 * than after.
 *
 * THE GATE IS THE TIER, not the permission - see forecastHistory below for the
 * same action id and the mistake that comment used to make about it.
 *
 * NULL RESULTS ARE ANSWERS, and there are two of them. `snapshot: null` means
 * nobody ever took one, so accuracy is not low - it is unmeasurable, and the
 * page must not print 0%. `accuracy: null` means the opening commit was zero,
 * so there is no denominator; a team that committed to nothing cannot be scored
 * against it either way.
 */
export async function forecastAccuracy(
  ctx: PipelineContext,
  period: string,
  opts: { now?: Date } = {},
): Promise<
  RuleResult<{
    period: string;
    /** True once the period is over, and only then is this word honest. */
    settled: boolean;
    opening: SnapshotRow | null;
    actualClosed: Money;
    accuracy: number | null;
  }>
> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.forecast.view", "data");
  if (!gate.allowed) return denied(gate);

  const range = periodRange(period);
  if (!range) {
    return fail(
      violation(
        "period_unparsed",
        `${period} is not a period this product can bound - use 2026Q3, 2026-07, 2026 or Y2026`,
        "period",
      ),
    );
  }
  const now = opts.now ?? new Date();

  const snapshots = await ctx.store.listForecastSnapshots(ctx.workspaceId, {
    period,
    scopeType: "workspace",
  });

  // The ACTUAL, through planSnapshot rather than a second roll-up written here.
  // It applies the same scope-then-period filter and the same "lost contributes
  // nothing" rule the opening snapshot was built with, so the two sides of this
  // ratio are computed by one definition. A local rollUp would be a second
  // definition of the actual, and the two would drift the first time either
  // filter changed.
  const opportunities = await ctx.store.listOpportunities(ctx.workspaceId, { includeClosed: true });
  const live = planSnapshot({
    period,
    scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
    opportunities,
    snapshotAt: now,
  });
  if (!live.ok) {
    return live as RuleResult<{
      period: string;
      settled: boolean;
      opening: SnapshotRow | null;
      actualClosed: Money;
      accuracy: number | null;
    }>;
  }

  const settled = range.end.getTime() <= now.getTime();
  const opening = [...snapshots].sort(
    (a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime(),
  )[0];
  if (!opening) {
    return ok({
      period,
      settled,
      opening: null,
      actualClosed: live.value.closedAmount,
      accuracy: null,
    });
  }

  const score = accuracy(opening, live.value.closedAmount);
  if (!score.ok) {
    return score as RuleResult<{
      period: string;
      settled: boolean;
      opening: SnapshotRow | null;
      actualClosed: Money;
      accuracy: number | null;
    }>;
  }

  return ok({
    period,
    settled,
    opening,
    actualClosed: live.value.closedAmount,
    accuracy: score.value,
  });
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

/**
 * Replace an opportunity's product lines, and make the header agree.
 *
 * ADR-014 section 2 is the whole of this function: WHEN LINES EXIST, THE LINES
 * ARE AUTHORITATIVE and `opportunity.amount` must equal their sum. The
 * constraint is written here rather than in the DDL because it is cross-row - a
 * header against many lines - which a CHECK cannot express and a trigger would
 * hide the business rule inside the database. So the service recomputes the
 * header in the same call that writes the lines, and this is the ONLY path
 * allowed to do it; two numbers that drift apart is the single most common and
 * hardest-to-find kind of bad accounting in a system like this.
 *
 * `needsApproval` is COMPUTED from the price book and never taken from the
 * caller. A flag the client can set is a flag the client can clear, and this
 * one decides whether a discount reaches a human - see priceLine.
 *
 * THE GATE IS D6's, not the catalogue's. A line lives in `yucer_pipeline` and
 * by ADR-001 the owning partition is the deal: pricing a deal is
 * `pipeline.opportunity.update`. The catalogue is read here, not written.
 */
export async function replaceOpportunityLines(
  ctx: PipelineContext & { catalog: CatalogStore },
  opportunityId: string,
  drafts: readonly DraftLine[],
): Promise<RuleResult<{ lines: number; amount: number; needsApproval: number }>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.opportunity.update", "data");
  if (!gate.allowed) return denied(gate);

  const current = await ctx.store.getOpportunity(ctx.workspaceId, opportunityId);
  if (!current) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }
  // A closed deal's amount is the reported result. Re-pricing it would rewrite
  // a number the forecast has already been measured against.
  if (current.closedAt !== null) {
    return fail(
      violation(
        "terminal_stage",
        "a closed deal's lines are the record of what was sold and cannot be repriced",
        "opportunityId",
      ),
    );
  }

  for (const d of drafts) {
    if (!(d.quantity > 0)) {
      return fail(violation("quantity_positive", `${d.productId} needs a quantity above zero`, "quantity"));
    }
    if (d.unitPrice < 0) {
      return fail(violation("amount_negative", "a unit price cannot be negative", "unitPrice"));
    }
  }

  const currency = current.amount?.currency ?? DEFAULT_LINE_CURRENCY;
  const priced = [];
  for (const d of drafts) {
    // Priced ONE AT A TIME against the entry in force for that product and
    // currency. Pricing the batch off a single lookup would let a stale floor
    // decide approval for a product it never applied to.
    const entry = await ctx.catalog.priceFor(ctx.workspaceId, d.productId, currency);
    priced.push(priceLine({ ...d, currency }, entry));
  }

  const written = await ctx.catalog.replaceLines(ctx.workspaceId, opportunityId, priced);
  const total = lineTotal(written);

  // The header follows the lines - including down to zero lines, where it is
  // left alone rather than zeroed: removing every line returns the deal to the
  // legacy shape where the header stands on its own, which `reconciles` treats
  // as legal precisely because it is.
  if (written.length > 0) {
    const applied = await ctx.store.updateCommercialTerms(ctx.workspaceId, opportunityId, {
      amount: money(total, currency),
    });
    if (!applied) {
      return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
    }
  }

  return ok({
    lines: written.length,
    amount: total,
    needsApproval: written.filter((l) => l.needsApproval).length,
  });
}

/**
 * Sign off one quoted price that fell below its product's floor.
 *
 * WHY THIS EXISTS AT ALL. incr/0007 gave every product a floor and 6b-3 made
 * the pricing rule raise `needsApproval` when a quote went under it, but
 * nothing could ever lower the flag. A control that can only say no is not a
 * control - it is an obstacle people learn to route around, and "discount
 * pending" degrades into a permanent property of half the pipeline.
 *
 * THE PRICE IS NOT AN ARGUMENT. It is read from the line that is actually on
 * the deal, for the same reason `needsApproval` is computed rather than
 * accepted: a caller who can name the number they are approving can approve a
 * number nobody quoted. The approver signs what is there.
 *
 * THE FLOOR IS COPIED IN, not referenced. A price book moves; what this person
 * was overriding must not move with it, or a later floor change would silently
 * rewrite the size of a concession somebody already authorised.
 *
 * SEPARATE PERMISSION from pipeline.write on purpose - see incr/0012. The
 * person who quotes below the floor must not be the person who signs it off.
 */
export async function approveLineDiscount(
  ctx: PipelineContext & { catalog: CatalogStore },
  input: { opportunityId: string; productId: string; reason: string },
): Promise<RuleResult<DiscountApprovalRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.discount.approve", "data");
  if (!gate.allowed) return denied(gate);

  const reason = input.reason.trim();
  if (!reason) {
    return fail(
      violation(
        "reason_required",
        "an approval without a stated reason is a click, not a decision",
        "reason",
      ),
    );
  }

  const current = await ctx.store.getOpportunity(ctx.workspaceId, input.opportunityId);
  if (!current) {
    return fail(
      violation("not_found", `opportunity ${input.opportunityId} was not found`, "opportunityId"),
    );
  }
  // Approving a discount on a closed deal would be signing off a price after
  // the result it produced has already been reported.
  if (current.closedAt !== null) {
    return fail(
      violation("terminal_stage", "a closed deal's prices are the record of what was sold", "opportunityId"),
    );
  }

  const lines = await ctx.catalog.listLines(ctx.workspaceId, input.opportunityId);
  const line = lines.find((l) => l.productId === input.productId);
  if (!line) {
    return fail(violation("not_found", `${input.productId} is not on this deal`, "productId"));
  }
  if (!line.needsApproval) {
    return fail(
      violation(
        "not_below_floor",
        "this line is at or above its floor and there is nothing to authorise",
        "productId",
      ),
    );
  }

  const existing = await ctx.catalog.listApprovals(ctx.workspaceId, input.opportunityId);
  if (approvalFor(line, existing)) {
    return fail(
      violation("already_approved", "this price has already been signed off", "productId"),
    );
  }

  // The flag was raised from a price entry, so one must exist. If the product
  // has since been de-listed we cannot say what floor is being overridden, and
  // recording a signature against an unknown floor would make the record a lie.
  const entry = await ctx.catalog.priceFor(ctx.workspaceId, line.productId, line.currency);
  if (!entry) {
    return fail(
      violation("not_priced", `${input.productId} has no price entry to approve against`, "productId"),
    );
  }

  return ok(
    await ctx.catalog.appendApproval(ctx.workspaceId, {
      opportunityId: input.opportunityId,
      productId: line.productId,
      unitPrice: line.unitPrice,
      currency: line.currency,
      floorPrice: entry.floorPrice,
      reason,
      approvedBySub: ctx.sub,
      approvedAt: new Date(),
    }),
  );
}

// ---------------------------------------------------------------------------
// The forecast rule - a second opinion on where each deal is filed.
//
// The owner's ruling of 2026-08-31: SUGGEST, and let a person apply it one deal
// at a time. Two consequences shape what is here.
//
// ONLY A READ IS NEW. Applying a suggestion is a category change, and that path
// already exists with the right gate on it: `updateCommercialTerms` refuses
// `forecastCategory` without `pipeline.forecast.categorize`, because the
// catalog gives a rep `pipeline.write` WITHOUT `pipeline.forecast` on purpose -
// they own the deal, not the forecast commitment. Adding a second write verb
// here would be a second door into a room the product deliberately locked.
//
// SO THE TWO GATES DIFFER, and that is a feature rather than an oversight: a
// rep can SEE that the rule disagrees with them and cannot silently make the
// disagreement go away. Seeing it is the point - the disagreement is what a
// forecast review is for.
// ---------------------------------------------------------------------------

export interface CategoryPreview {
  opportunity: OpportunityRecord;
  verdict: CategoryVerdict;
  /** Days at the current stage, or null when the journal has nothing. */
  daysAtStage: number | null;
}

/**
 * Every open deal, with what the rule would file it as.
 *
 * ONE EXTRA QUERY, not one per deal. `latestStageChangeAt` rolls the journal up
 * for the whole workspace in a single groupBy; asking per deal would be a query
 * per row on a page that exists to be a list.
 *
 * CLOSED DEALS ARE EXCLUDED at the store, not filtered after. Their category is
 * bound to the stage by planCategoryChange in both directions, so there is no
 * judgement to second-guess - `suggestCategory` returns `settled` for them and
 * a page full of settled rows would bury the ones that need reading.
 *
 * ROWS THE RULE AGREES WITH STAY IN. A forecast review needs to see the whole
 * book, and a page that showed only disagreements would be read as "these are
 * the deals with problems" rather than "this is the forecast" - and would hide
 * how much of the book the rule and the rep already agree about, which is the
 * context that makes a disagreement mean anything.
 */
export async function previewCategories(
  ctx: PipelineContext,
  opts: { now?: Date; stallDays?: number } = {},
): Promise<RuleResult<CategoryPreview[]>> {
  // `pipeline.forecast.view`, not `pipeline.view`, and the two gates differ on
  // an axis worth naming: its FEATURE is `pipeline.forecast` (pro tier), while
  // its PERMISSION is only `pipeline.read`. So a workspace that never bought
  // forecasting cannot read this, and a rep inside one that did can - which is
  // the arrangement a forecast review depends on, since applying the suggestion
  // needs `pipeline.forecast.categorize` and the catalog withholds that from
  // the person who owns the deal.
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.forecast.view", "data");
  if (!gate.allowed) return denied(gate);

  const now = opts.now ?? new Date();
  const [rows, lastMoved] = await Promise.all([
    ctx.store.listOpportunities(ctx.workspaceId),
    ctx.store.latestStageChangeAt(ctx.workspaceId),
  ]);

  const out = rows.map((opportunity) => {
    const deal: CategorizableDeal = {
      id: opportunity.id,
      stage: opportunity.stage,
      forecastCategory: opportunity.forecastCategory,
      probability: opportunity.probability,
      expectedCloseAt: opportunity.expectedCloseAt,
      // Absent from the map means no journal rows, which reads as UNKNOWN.
      // Defaulting to the deal's createdAt would turn "we have no history for
      // this" into "it has sat here since it was created" and downgrade every
      // deal older than the journal.
      lastStageChangeAt: lastMoved.get(opportunity.id) ?? null,
    };
    return {
      opportunity,
      verdict: suggestCategory(deal, now, { stallDays: opts.stallDays }),
      daysAtStage: daysAtStage(deal, now),
    };
  });

  // Disagreements first, then the longest-sitting. A reviewer reads down until
  // they stop caring, so the order is the product's claim about what matters.
  return ok(
    out.sort(
      (a, b) =>
        Number(agreesOrSettled(a.verdict)) - Number(agreesOrSettled(b.verdict)) ||
        (b.daysAtStage ?? -1) - (a.daysAtStage ?? -1),
    ),
  );
}

function agreesOrSettled(v: CategoryVerdict): boolean {
  return v.kind === "settled" || v.agrees;
}

/**
 * Apply the rule's suggestion to one deal, re-derived at the moment of the click.
 *
 * NOT TAKEN FROM THE PAGE. The first version of the apply path trusted the
 * category the browser sent - validated as a member of the enum, and otherwise
 * believed. A page can be minutes old, and in that time the rep can have moved
 * the deal, set a close date, or filed it where the rule wanted it anyway; the
 * suggestion the button was drawn from may simply no longer exist.
 *
 * `/renewal` already re-derived on apply for exactly this reason and this path
 * did not - the same batch shipping two different answers to one question. It
 * also left `planSuggestedCategory` with no caller at all while its own
 * docstring described this function using it, which is how it surfaced.
 *
 * The write still goes through `updateCommercialTerms`, so
 * `pipeline.forecast.categorize` and `planCategoryChange` both still apply.
 */
export async function applyCategorySuggestion(
  ctx: PipelineContext,
  opportunityId: string,
  opts: { now?: Date; stallDays?: number } = {},
): Promise<RuleResult<OpportunityRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "pipeline.forecast.view", "data");
  if (!gate.allowed) return denied(gate);

  const current = await ctx.store.getOpportunity(ctx.workspaceId, opportunityId);
  if (!current) {
    return fail(violation("not_found", `opportunity ${opportunityId} was not found`, "opportunityId"));
  }

  const lastMoved = await ctx.store.latestStageChangeAt(ctx.workspaceId);
  const deal: CategorizableDeal = {
    id: current.id,
    stage: current.stage,
    forecastCategory: current.forecastCategory,
    probability: current.probability,
    expectedCloseAt: current.expectedCloseAt,
    lastStageChangeAt: lastMoved.get(current.id) ?? null,
  };

  const verdict = suggestCategory(deal, opts.now ?? new Date(), { stallDays: opts.stallDays });
  const plan = planSuggestedCategory(deal, verdict);
  if (!plan.ok) return plan as RuleResult<OpportunityRecord>;

  return updateCommercialTerms(ctx, opportunityId, {
    forecastCategory: plan.value.forecastCategory,
  });
}
