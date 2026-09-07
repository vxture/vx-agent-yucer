"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getPipelineStore, getSignalStore } from "../../domains/shared/registry";
import {
  advanceLead,
  assignLead,
  deleteLead,
  matchLeadAccount,
} from "../../domains/signal/service";
import { convertLeadToOpportunity } from "../../domains/conversion";

// Write paths for the lead list.
//
// The client sends a lead id and a verb. The account, the attribution, the
// opportunity number and the owner are all derived server-side - a client that
// could supply attribution could decide after the fact where a deal came from,
// which is the one thing the frozen keys exist to prevent.

// THE LEAD'S WHOLE VOCABULARY, and each word is a different business moment
// rather than a different way to write the same column (owner, 2026-09-06:
// 每个都有具体的业务意图).
//
//   work        - somebody has actually started on it
//   qualify     - the judgement: this is real, we should pursue it
//   disqualify  - the opposite judgement: not a fit for what we sell
//   convert     - hand over to D6; attribution freezes here
//
// 认领 / 分派 / 转让 are NOT in this union. All three write `owner_sub` and
// they differ only in who is choosing and for whom, so they go through one
// action that takes a subject - see reassignLead. Modelling them as three
// verbs would be three names for one write.
export type LeadAction = "work" | "qualify" | "disqualify" | "convert";

export interface LeadActionResult {
  ok: boolean;
  error?: string;
  /** Set after a successful conversion, so the UI can point at the new deal. */
  opportunityNo?: string;
  attributionSource?: string;
}

export async function actOnLead(leadId: string, action: LeadAction): Promise<LeadActionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  if (action === "work") {
    const r = await advanceLead(
      { ...base, store: session.stores.signal() },
      leadId,
      "working",
    );
    if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
    revalidatePath("/lead");
    return { ok: true };
  }

  if (action === "convert") {
    const result = await convertLeadToOpportunity(
      { ...base, signalStore: session.stores.signal(), pipelineStore: session.stores.pipeline() },
      { leadId },
    );
    if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

    revalidatePath("/lead");
    revalidatePath("/pipeline");
    return {
      ok: true,
      opportunityNo: result.value.opportunity.opportunityNo,
      attributionSource: result.value.attribution.source,
    };
  }

  const result = await advanceLead(
    { ...base, store: session.stores.signal() },
    leadId,
    action === "qualify" ? "qualified" : "disqualified",
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  revalidatePath("/lead");
  return { ok: true };
}


/**
 * 认领 - the caller takes it.
 *
 * IT TAKES NO SUBJECT, and that is the point: a client that could name the
 * claimer could claim on somebody else's behalf. The session decides who.
 *
 * 分派 and 转让 write the same column and go through applyAssignment
 * (lead/assign-actions.ts), which is where 智能分配 already sends its
 * accepted proposals. A second action for the same write would be a second
 * place for the same gate to drift.
 */
export async function claimLead(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const r = await assignLead(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.signal(),
    },
    leadId,
    session.user.sub,
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/lead");
  return { ok: true };
}

/** 匹配客户 - the unblocker for both assignment and conversion. */
export async function matchLead(
  leadId: string,
  accountId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const r = await matchLeadAccount(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.signal(),
    },
    leadId,
    accountId,
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/lead");
  return { ok: true };
}

/**
 * 删除 - for a record that should never have existed.
 *
 * ONE AT A TIME even from the table's bulk control: the caller loops. A single
 * "delete these twelve" round trip would report one outcome for twelve
 * different rules - and a converted lead among them is refused for a reason
 * the reader needs to see against that row.
 */
export async function removeLead(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const r = await deleteLead(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.signal(),
    },
    leadId,
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/lead");
  return { ok: true };
}
