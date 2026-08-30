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

/** Dismiss or mark duplicate. Both are terminal side exits from the funnel. */
export async function triageSignal(
  ctx: SignalContext,
  signalId: string,
  to: Extract<SignalStatus, "dismissed" | "duplicate">,
): Promise<RuleResult<{ status: SignalStatus }>> {
  const gate = can(ctx.holder, ctx.entitlement, "signal.triage", "data");
  if (!gate.allowed) return denied(gate);

  const signal = await ctx.store.getSignal(ctx.workspaceId, signalId);
  if (!signal) return fail(violation("not_found", `signal ${signalId} was not found`, "signalId"));

  const patch = planStatusChange(signal, to);
  if (!patch.ok) return patch as RuleResult<{ status: SignalStatus }>;

  await ctx.store.resolveSignal(ctx.workspaceId, signalId, patch.value);
  return ok({ status: to });
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

  if (lead.status === "converted") {
    // A converted lead already produced an opportunity. Moving it again would
    // let one piece of demand be counted twice.
    return fail(violation("lead_converted", "a converted lead is final", "status"));
  }
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
    open.map((l) => ({
      leadId: l.id,
      leadNo: l.leadNo,
      companyName: l.companyName,
      currentOwner: l.ownerSub,
      outcome: routeLead(
        { id: l.id, region: l.accountId ? (regionOf.get(l.accountId) ?? null) : null },
        territories,
        load,
      ),
    })),
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
