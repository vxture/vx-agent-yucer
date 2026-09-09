// D5 application service: the opportunity detective.
//
// This is the domain that makes the product more than a CRM: it does not wait
// for a salesperson to type something in, it finds demand and ranks it. The
// service is where three spec rules that are easy to get wrong actually bite:
//
//   1. An unmatched account MUST NOT zero the score. A stranger's signal is a
//      new logo, which is the most valuable thing this domain can surface.
//   2. Evidence is never rewritten - only the resolution moves.
//   3. The lead -> opportunity conversion is the seam of the whole attribution
//      chain, and the campaign is COPIED across and then frozen on both sides.

import type { Entitlement } from "../../entitlement/types";
import { can, type PermissionHolder } from "../../authz/decide";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import { planConversion, resolveAttribution, type Attribution } from "../pipeline/lib/attribution";
import {
  planPromotion,
  planRescore,
  planStatusChange,
  scoreSignal,
  type ScoreBreakdown,
  type SignalStatus,
} from "./lib/scoring";
import { planLeadAdvance, planLeadDeletion } from "./lib/lead";
import { planFunnelExit, type ExitReason } from "../shared/funnel-exit";
import {
  routeLead,
  type RoutingOutcome,
  type RoutingTerritory,
} from "./lib/routing";
import type {
  LeadFilter,
  LeadRecord,
  NewSignal,
  SignalFilter,
  SignalRecord,
  SignalStore,
} from "./store";

export interface SignalContext {
  workspaceId: string;
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: SignalStore;
}

export async function listSignals(
  ctx: SignalContext,
  filter: SignalFilter = {},
): Promise<RuleResult<SignalRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listSignals(ctx.workspaceId, filter));
}

export async function listLeads(
  ctx: SignalContext,
  filter: LeadFilter = {},
): Promise<RuleResult<LeadRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listLeads(ctx.workspaceId, filter));
}

export interface IngestResult {
  recorded: SignalRecord[];
  /** Signals whose dedup key already existed. Reported, not silently dropped. */
  duplicates: number;
}

/**
 * Take signals from an external feed.
 *
 * Gated on signal.external_feed, a business-tier capability: a workspace can
 * triage signals by hand on starter, but automatic ingestion is what the higher
 * tier sells. A duplicate is counted and reported rather than treated as an
 * error - a feed replaying its own records is normal traffic.
 */
export async function ingestSignals(
  ctx: SignalContext,
  signals: readonly NewSignal[],
): Promise<RuleResult<IngestResult>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.feed.ingest", "data");
  if (!gate.allowed) return denied(gate);

  const recorded: SignalRecord[] = [];
  let duplicates = 0;
  for (const s of signals) {
    const row = await ctx.store.recordSignal(ctx.workspaceId, s);
    if (row) recorded.push(row);
    else duplicates += 1;
  }
  return ok({ recorded, duplicates });
}

export interface ScoredSignal {
  signal: SignalRecord;
  breakdown: ScoreBreakdown;
}

/**
 * Score (or re-score) a signal.
 *
 * Gated on signal.rescore, which needs the autoscore capability - hand triage
 * stays available on starter. The breakdown is returned so a low score can be
 * argued with: "the model said 22" is not something a salesperson can act on,
 * "hiring signal, 90 days old, no account match" is.
 */
export async function rescoreSignal(
  ctx: SignalContext,
  signalId: string,
  opts: { accountId?: string | null; matchConfidence?: number | null; now?: Date } = {},
): Promise<RuleResult<ScoredSignal>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.rescore", "data");
  if (!gate.allowed) return denied(gate);

  const signal = await ctx.store.getSignal(ctx.workspaceId, signalId);
  if (!signal) return fail(violation("not_found", `signal ${signalId} was not found`, "signalId"));

  const accountId = opts.accountId !== undefined ? opts.accountId : signal.accountId;
  const scored = scoreSignal({
    signalType: signal.signalType,
    detectedAt: signal.detectedAt,
    accountId,
    matchConfidence: opts.matchConfidence,
    now: opts.now,
  });
  if (!scored.ok) return scored as RuleResult<ScoredSignal>;

  const patch = planRescore(signal, scored.value, { accountId });
  if (!patch.ok) return patch as RuleResult<ScoredSignal>;

  const applied = await ctx.store.resolveSignal(ctx.workspaceId, signalId, patch.value);
  if (!applied) return fail(violation("not_found", `signal ${signalId} was not found`, "signalId"));

  const updated = await ctx.store.getSignal(ctx.workspaceId, signalId);
  return ok({ signal: updated!, breakdown: scored.value });
}

/**
 * Dismiss or mark duplicate. Both are terminal side exits from the funnel.
 *
 * AND BOTH NOW SAY WHY (design_yucer_110 batch D, on incr/0033's table).
 * Without it the same signal arrives again next week and nobody can tell
 * whether it was already looked at and rejected, or never looked at - which
 * is the difference between a filter working and a filter being ignored.
 *
 * The reason is OPTIONAL here and required by the surface for `dismissed`:
 * a duplicate explains itself (it names the signal it duplicates), and being
 * made to type a sentence for one would teach people to type anything.
 */
export async function triageSignal(
  ctx: SignalContext,
  signalId: string,
  to: Extract<SignalStatus, "dismissed" | "duplicate">,
  exit: { reasonCode?: ExitReason; note?: string | null } = {},
): Promise<RuleResult<{ status: SignalStatus }>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.triage", "data");
  if (!gate.allowed) return denied(gate);

  const signal = await ctx.store.getSignal(ctx.workspaceId, signalId);
  if (!signal) return fail(violation("not_found", `signal ${signalId} was not found`, "signalId"));

  const patch = planStatusChange(signal, to);
  if (!patch.ok) return patch as RuleResult<{ status: SignalStatus }>;

  // VALIDATED BEFORE THE STATUS MOVES, so a signal cannot end up dismissed
  // with nothing saying why - the same order closeLead uses.
  const record = planFunnelExit({
    stage: "signal",
    subjectId: signalId,
    outcome: to,
    // A duplicate IS its own reason; a dismissal defaults to the vocabulary's
    // catch-all only when the caller gave nothing, and the surface asks.
    reasonCode: exit.reasonCode ?? (to === "duplicate" ? "duplicate" : "not_a_fit"),
    note: exit.note ?? null,
    decidedBySub: ctx.sub,
  });
  if (!record.ok) return record as RuleResult<{ status: SignalStatus }>;

  await ctx.store.recordFunnelExit(ctx.workspaceId, record.value);
  await ctx.store.resolveSignal(ctx.workspaceId, signalId, patch.value);
  return ok({ status: to });
}

/**
 * Match a signal to a customer - 智探's proposal, a person's decision.
 *
 * THE UPSTREAM OF TWO DEAD ENDS. An unmatched signal becomes an unmatched
 * lead, which has no region (so 智能分配 cannot place it) and no account (so
 * it cannot convert). Both of those refusals start here.
 *
 * `account_id` is RESOLUTION, not evidence: the signal's source, subject and
 * detection time are frozen, and which customer it turned out to be about is
 * a conclusion somebody reaches later.
 */
export async function matchSignalAccount(
  ctx: SignalContext,
  signalId: string,
  accountId: string,
): Promise<RuleResult<{ accountId: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.triage", "data");
  if (!gate.allowed) return denied(gate);

  const signal = await ctx.store.getSignal(ctx.workspaceId, signalId);
  if (!signal) return fail(violation("not_found", `signal ${signalId} was not found`, "signalId"));
  if (signal.status !== "new" && signal.status !== "scored") {
    // A promoted signal already handed its account to a lead; re-pointing it
    // now would leave the two disagreeing with nothing to say which is right.
    return fail(violation("signal_resolved", "this signal has already been judged", "status"));
  }

  // resolveSignal, not a new port verb: `account_id` is one of the three
  // RESOLUTION columns it already takes, and the port's whole shape is that
  // evidence cannot be written and resolution can.
  const applied = await ctx.store.resolveSignal(ctx.workspaceId, signalId, { accountId });
  if (!applied) return fail(violation("not_found", `signal ${signalId} was not found`, "signalId"));
  return ok({ accountId });
}

export interface PromotionResult {
  lead: LeadRecord;
  signal: SignalRecord;
}

/**
 * Promote a scored signal into a lead.
 *
 * The lead's campaign lineage is taken from the signal here and frozen. A
 * campaign-sourced signal carries its campaign in source_ref; anything else has
 * no lineage and must not be given an invented one.
 */
export async function promoteSignal(
  ctx: SignalContext,
  signalId: string,
  opts: { companyName?: string; ownerSub?: string } = {},
): Promise<RuleResult<PromotionResult>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const signal = await ctx.store.getSignal(ctx.workspaceId, signalId);
  if (!signal) return fail(violation("not_found", `signal ${signalId} was not found`, "signalId"));

  const plan = planPromotion({ signal: { ...signal, id: signalId }, companyName: opts.companyName });
  if (!plan.ok) return plan as RuleResult<PromotionResult>;

  const lead = await ctx.store.createLead(ctx.workspaceId, {
    ...plan.value.lead,
    ownerSub: opts.ownerSub ?? ctx.sub,
  });
  await ctx.store.resolveSignal(ctx.workspaceId, signalId, plan.value.patch);

  const updated = await ctx.store.getSignal(ctx.workspaceId, signalId);
  return ok({ lead, signal: updated! });
}

/** Move a lead along its own funnel, before conversion. */
export async function advanceLead(
  ctx: SignalContext,
  leadId: string,
  to: Exclude<LeadRecord["status"], "converted">,
): Promise<RuleResult<{ status: LeadRecord["status"] }>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const lead = await ctx.store.getLead(ctx.workspaceId, leadId);
  if (!lead) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));

  // The lifecycle rules moved to lib/lead.ts when the owner joined 线索分派 to
  // 商机智探 (2026-09-06): an unowned lead cannot be qualified. They live in a
  // pure rule rather than as two ifs here so the pair can be tested together -
  // and so the next condition has an obvious place to go.
  const plan = planLeadAdvance(lead, to);
  if (!plan.ok) return plan as RuleResult<{ status: LeadRecord["status"] }>;

  await ctx.store.updateLead(ctx.workspaceId, leadId, { status: to });
  return ok({ status: to });
}

export interface ConversionResult {
  opportunity: { accountId: string; campaignId: string | null; planId: string | null };
  attribution: Attribution;
  leadId: string;
}

/**
 * Convert a qualified lead into an opportunity.
 *
 * THE SEAM OF THE ATTRIBUTION CHAIN. The campaign is copied from the lead onto
 * the opportunity, and after the copy neither side may change it. This function
 * returns the opportunity's shape rather than creating it, because the
 * opportunity belongs to D6 - D5 hands over and does not reach across.
 *
 * The caller is responsible for creating the opportunity and then calling
 * completeConversion() with its id, which closes the loop on the lead.
 */
export async function convertLead(
  ctx: SignalContext,
  leadId: string,
  opts: { accountId?: string | null; planId?: string | null } = {},
): Promise<RuleResult<ConversionResult>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.convert", "data");
  if (!gate.allowed) return denied(gate);

  const lead = await ctx.store.getLead(ctx.workspaceId, leadId);
  if (!lead) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));

  const signal = lead.signalId ? await ctx.store.getSignal(ctx.workspaceId, lead.signalId) : null;

  const plan = planConversion({
    lead: { ...lead, accountId: opts.accountId ?? lead.accountId },
    signal: signal ? { id: signal.id, source: signal.source, sourceRef: signal.sourceRef } : null,
    accountId: opts.accountId,
    planId: opts.planId,
  });
  if (!plan.ok) return plan as RuleResult<ConversionResult>;

  return ok({ opportunity: plan.value.opportunity, attribution: plan.value.attribution, leadId });
}

/**
 * Close the attribution loop once the opportunity row exists.
 *
 * Separate from convertLead because the opportunity id does not exist until D6
 * has written the row, and the lead must point at a real one.
 */
export async function completeConversion(
  ctx: SignalContext,
  leadId: string,
  opportunityId: string,
): Promise<RuleResult<{ leadId: string; opportunityId: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.convert", "data");
  if (!gate.allowed) return denied(gate);

  const applied = await ctx.store.updateLead(ctx.workspaceId, leadId, {
    status: "converted",
    convertedOpportunityId: opportunityId,
  });
  if (!applied) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));
  return ok({ leadId, opportunityId });
}

/** What a signal would attribute to, without writing anything. For the UI. */
export async function previewAttribution(
  ctx: SignalContext,
  leadId: string,
): Promise<RuleResult<Attribution>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.view", "data");
  if (!gate.allowed) return denied(gate);

  const lead = await ctx.store.getLead(ctx.workspaceId, leadId);
  if (!lead) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));
  const signal = lead.signalId ? await ctx.store.getSignal(ctx.workspaceId, lead.signalId) : null;

  return ok(
    resolveAttribution({
      lead,
      signal: signal ? { id: signal.id, source: signal.source, sourceRef: signal.sourceRef } : null,
    }),
  );
}

// --- lead routing ----------------------------------------------------------

export interface RoutingPlan {
  leadId: string;
  leadNo: string;
  companyName: string;
  currentOwner: string | null;
  /**
   * The region the routing turned on, resolved through the lead's account.
   *
   * RETURNED RATHER THAN RECOMPUTED. It is the rule's own input - territory
   * cover is decided by it and nothing else - and the surface could not show
   * it at all before, so a page answering "why did this go to me" was missing
   * the first half of the answer. Null covers both "no account yet" and "an
   * account with no region": the router cannot tell them apart either, which
   * is why `no_region` is one outcome and not two.
   */
  region: string | null;
  /** The customer the lead was matched to, or null. Carried because it is
   * where the region is fixed, and the region is what the router runs on. */
  accountId: string | null;
  outcome: RoutingOutcome;
}

/**
 * What routing WOULD do, without doing it.
 *
 * A preview rather than a router that just runs: assignment moves work between
 * people, and the rule reaching a wrong answer because a territory has no
 * regions set is exactly the case somebody must see before it lands. ADR-003's
 * shape - propose, then a human decides - applied to a rule.
 *
 * Load counts the leads this member can SEE, which is a real limit worth
 * naming: a rep previewing counts their own queue, a leader counts everyone's,
 * and the leader's answer is the one that balances.
 */
export async function previewRouting(
  ctx: SignalContext,
  territories: readonly RoutingTerritory[],
  regionOf: ReadonlyMap<string, string | null>,
): Promise<RuleResult<RoutingPlan[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.view", "data");
  if (!gate.allowed) return denied(gate);

  const leads = await ctx.store.listLeads(ctx.workspaceId, { limit: 500 });

  // Open leads only, and load counted BEFORE any of this plan is applied - a
  // load shifting mid-preview would make the answer depend on row order.
  const open = leads.filter((l) => l.status !== "converted" && l.status !== "disqualified");
  const load = new Map<string, number>();
  for (const l of open) {
    if (l.ownerSub) load.set(l.ownerSub, (load.get(l.ownerSub) ?? 0) + 1);
  }

  return ok(
    open.map((l) => {
      // Resolved ONCE and used twice - the rule routes on it and the surface
      // shows it. Two lookups could not disagree today, but the row would then
      // be describing a region the decision was not made with.
      const region = l.accountId ? (regionOf.get(l.accountId) ?? null) : null;
      return {
        leadId: l.id,
        leadNo: l.leadNo,
        companyName: l.companyName,
        currentOwner: l.ownerSub,
        region,
        accountId: l.accountId,
        outcome: routeLead({ id: l.id, region }, territories, load),
      };
    }),
  );
}

/**
 * Apply ONE routing decision.
 *
 * Not the whole plan. A bulk "route everything" moves dozens of leads on one
 * click with no record of which the person actually looked at - and the owner
 * of a lead is who gets asked about it, so this is dozens of individual
 * decisions rather than one batch.
 */
export async function assignLead(
  ctx: SignalContext,
  leadId: string,
  ownerSub: string,
): Promise<RuleResult<{ ownerSub: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const lead = await ctx.store.getLead(ctx.workspaceId, leadId);
  if (!lead) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));
  if (lead.status === "converted") {
    // Its opportunity already carries an owner; reassigning now would leave
    // the two disagreeing about whose deal this is.
    return fail(violation("lead_converted", "a converted lead is final", "status"));
  }
  if (!ownerSub.trim()) {
    return fail(violation("owner_required", "an assignment needs somebody to assign to", "ownerSub"));
  }

  await ctx.store.updateLead(ctx.workspaceId, leadId, { ownerSub });
  return ok({ ownerSub });
}

/**
 * Record a lead nobody's signal produced.
 *
 * 智探 IS ONE SOURCE, NOT THE ONLY ONE (owner, 2026-09-06). A lead from an
 * exhibition, a phone call or a referral has no signal behind it, and before
 * this verb the only way a lead could exist was `promoteSignal` - so a real
 * enquiry could not be written down unless the machine had found it first.
 *
 * IT ARRIVES UNOWNED UNLESS SOMEBODY IS NAMED. That is not an oversight: a
 * lead taken at a stand belongs to whoever ends up working it, and 智能分配
 * exists to answer that question. `null` is the honest starting state, and the
 * qualify gate is what stops it staying that way.
 */
export async function createLead(
  ctx: SignalContext,
  input: {
    companyName: string;
    contactName?: string | null;
    accountId?: string | null;
    ownerSub?: string | null;
  },
): Promise<RuleResult<LeadRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const companyName = input.companyName.trim();
  if (!companyName) {
    return fail(violation("company_required", "a lead needs a company", "companyName"));
  }

  return ok(
    await ctx.store.createLead(ctx.workspaceId, {
      companyName,
      contactName: input.contactName?.trim() || null,
      accountId: input.accountId ?? null,
      // NO SIGNAL AND NO CAMPAIGN, and both are frozen attribution keys
      // (ADR-016). A hand-entered lead is self-sourced by definition; writing
      // a campaign here would credit a campaign that did not produce it, and
      // the credit could never be corrected afterwards.
      signalId: null,
      campaignId: null,
      // UNSCORED, not zero. Scoring is the signal rule's arithmetic over a
      // signal's type and age, and this lead has neither - a 0 would read as
      // "we scored it and it is worthless".
      score: null,
      ownerSub: input.ownerSub ?? null,
    }),
  );
}

/**
 * Match a lead to a customer record.
 *
 * THE UNBLOCKER FOR TWO OTHER THINGS. An unmatched lead has no region, so
 * 智能分配 cannot place it; and it has no account, so it cannot convert - an
 * opportunity must belong to a customer. Both refusals point here.
 *
 * The account is writable rather than frozen: matching is a CORRECTION of an
 * unknown, not a restatement of a decision. The frozen keys are `signal_id`
 * and `campaign_id`, which say where the lead CAME FROM - and this does not
 * touch them.
 */
export async function matchLeadAccount(
  ctx: SignalContext,
  leadId: string,
  accountId: string,
): Promise<RuleResult<{ accountId: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const lead = await ctx.store.getLead(ctx.workspaceId, leadId);
  if (!lead) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));
  if (lead.status === "converted") {
    // The conversion already copied this lead's account onto a deal and froze
    // the attribution beside it. Re-pointing it now would leave the two
    // disagreeing with no way to tell which is right.
    return fail(violation("lead_converted", "a converted lead is final", "status"));
  }

  const applied = await ctx.store.updateLead(ctx.workspaceId, leadId, { accountId });
  if (!applied) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));
  return ok({ accountId });
}

/**
 * Delete a lead outright.
 *
 * Gated on `signal.lead.upsert` like every other lead write. The RULE decides
 * whether this particular lead may go (planLeadDeletion); the gate decides
 * whether this person may delete leads at all, and the two are different
 * questions.
 */
export async function deleteLead(
  ctx: SignalContext,
  leadId: string,
): Promise<RuleResult<{ id: string }>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const lead = await ctx.store.getLead(ctx.workspaceId, leadId);
  if (!lead) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));

  const plan = planLeadDeletion(lead);
  if (!plan.ok) return plan;

  const gone = await ctx.store.deleteLead(ctx.workspaceId, leadId);
  if (!gone) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));
  return ok({ id: leadId });
}

/**
 * End a lead, and say why.
 *
 * 判定不合格 AND 终结 BOTH ARRIVE HERE (owner, 2026-09-06). They are two
 * business moments - the demand was never ours to win, versus it was real and
 * it died - and `lead.status` has one terminal state for both. What separates
 * them is the REASON, so the reason is what this verb insists on.
 *
 * THE STATUS AND THE RECORD LAND TOGETHER, in that order and both or neither
 * as far as the caller can tell: the exit row is validated BEFORE the status
 * moves, so a lead cannot end up disqualified with nothing saying why. The
 * reverse order would be worse - a reason attached to a lead still shown as
 * open reads as a bug in the page rather than in the write.
 *
 * IT DOES NOT ASK WHETHER THE REASON SUITS THE OCCASION. Which reasons belong
 * to 判定不合格 and which to 终结 is a menu the surface draws
 * (LEAD_DISQUALIFY_REASONS / LEAD_TERMINATE_REASONS); both write the same
 * outcome, and a rule that policed the pairing would be encoding a UI choice
 * in the domain.
 */
export async function closeLead(
  ctx: SignalContext,
  leadId: string,
  exit: { reasonCode: ExitReason; note?: string | null },
): Promise<RuleResult<{ status: "disqualified" }>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.upsert", "data");
  if (!gate.allowed) return denied(gate);

  const lead = await ctx.store.getLead(ctx.workspaceId, leadId);
  if (!lead) return fail(violation("not_found", `lead ${leadId} was not found`, "leadId"));

  const move = planLeadAdvance(lead, "disqualified");
  if (!move.ok) return move as RuleResult<{ status: "disqualified" }>;

  const record = planFunnelExit({
    stage: "lead",
    subjectId: leadId,
    outcome: "disqualified",
    reasonCode: exit.reasonCode,
    note: exit.note ?? null,
    // ATTRIBUTED FROM THE SESSION, never from the caller's payload - the same
    // rule as every other attribution in this product.
    decidedBySub: ctx.sub,
  });
  if (!record.ok) return record as RuleResult<{ status: "disqualified" }>;

  await ctx.store.recordFunnelExit(ctx.workspaceId, record.value);
  await ctx.store.updateLead(ctx.workspaceId, leadId, { status: "disqualified" });
  return ok({ status: "disqualified" });
}

/** Why this lead ended, for the row that shows it. Read on the same gate the
 * list is: whoever may see a lead may see why it stopped. */
export async function leadExitReasons(
  ctx: SignalContext,
  leadId: string,
): Promise<RuleResult<Awaited<ReturnType<SignalStore["listFunnelExits"]>>>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listFunnelExits(ctx.workspaceId, leadId));
}

/**
 * Every exit in the workspace - the cross-stage read the funnel overview is
 * built from (incr/0033, design_yucer_110 batch E).
 *
 * GATED ON `signal.lead.view`, which is the weakest read that touches this
 * table at all. It is deliberately NOT gated per stage: a reader who cannot
 * see delivery still sees that projects were cancelled and why, because the
 * exit record is a REASON rather than the object - it names no customer, no
 * amount and no owner, only what ended and what somebody said about it.
 */
export async function workspaceExits(
  ctx: SignalContext,
): Promise<RuleResult<Awaited<ReturnType<SignalStore["listAllFunnelExits"]>>>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.lead.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listAllFunnelExits(ctx.workspaceId));
}
