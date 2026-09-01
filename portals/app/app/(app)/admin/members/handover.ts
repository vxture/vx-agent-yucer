"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getAuthzStore } from "../../../authz/store";
import { listWorkspaceMembers } from "../../../authz/admin";
import {
  getAccountStore,
  getPipelineStore,
  getSignalStore,
} from "../../../domains/shared/registry";
import { listAccounts, reassignAccount } from "../../../domains/account/service";
import { listPipeline, updateCommercialTerms } from "../../../domains/pipeline/service";
import { assignLead, listLeads } from "../../../domains/signal/service";

// Handing over a departing member's book.
//
// The owner's ruling of 2026-09-01: a member can leave, and their work either
// keeps its history or is transferred. Deactivation covered the first half;
// this is the second.
//
// WHAT MOVES AND WHAT DOES NOT WAS ALREADY DECIDED - by 98_column_locks.sql,
// years before anyone asked. `owner_sub` carries an UPDATE grant on account,
// opportunity, lead, campaign, strategy_plan and territory; it carries NONE on
// `sales_target` (where it is part of the scope tuple) and none at all on
// `forecast_snapshot` (append-only). That split is not an accident of the
// grants - it is the semantics:
//
//   A HANDOVER MOVES THE LIVE BOOK. It never moves history, and it never moves
//   targets. A target set for one person is a target FOR that person, and
//   reassigning it rewrites a number that has already been reported; a
//   snapshot taken over their book is what they said on the day they said it.
//
// The same reasoning excludes two things the grants would allow:
//
//   * CLOSED DEALS. A won deal's owner is who won it, which is credit for a
//     quarter that is over. `listPipeline` without includeClosed gives exactly
//     the open ones.
//   * CONVERTED LEADS. `assignLead` refuses them itself, with the better
//     reason: the opportunity already carries an owner, so moving the lead
//     would leave the two disagreeing about whose deal it is.
//
// CAMPAIGN, PLAN AND TERRITORY are not moved either, and that is scope rather
// than principle: their owners are managers, there are a handful of each, and
// they are edited on their own pages. A bulk sweep would be doing quietly what
// somebody should do deliberately.
//
// THROUGH THE DOMAIN SERVICES, one row at a time. Each write runs its own gate
// and its own rules - the same reason the copilot's executor calls advanceStage
// rather than writing the column. It is chattier than a bulk UPDATE and that is
// the point: a handover that skipped the rules would be the one writer in the
// product that did.

export interface HandoverResult {
  ok: boolean;
  moved?: { accounts: number; opportunities: number; leads: number };
  /** Rows the domain refused, with its reason. Never silently dropped. */
  skipped?: Array<{ kind: string; id: string; reason: string }>;
  error?: string;
}

export async function handOverBook(from: string, to: string): Promise<HandoverResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  if (!from.trim() || !to.trim()) return { ok: false, error: "owner_required" };
  if (from === to) return { ok: false, error: "same_owner" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  // THE RECIPIENT MUST BE AN ACTIVE MEMBER, checked here because no domain can
  // check it: `local_authz` sits under all of them. Handing a book to somebody
  // who has also left, or to a sub this workspace has never seen, is worse than
  // leaving it where it is - the work becomes invisible to everyone instead of
  // just to its departed owner.
  const members = await listWorkspaceMembers({ ...base, store: getAuthzStore() });
  if (!members.ok) return { ok: false, error: members.violations[0]?.code ?? "denied" };
  const recipient = members.value.find((m) => m.sub === to);
  if (!recipient) return { ok: false, error: "recipient_not_a_member" };
  if (recipient.status !== "active") return { ok: false, error: "recipient_inactive" };

  const skipped: Array<{ kind: string; id: string; reason: string }> = [];
  const moved = { accounts: 0, opportunities: 0, leads: 0 };

  const accountCtx = { ...base, store: session.stores.account() };
  const accounts = await listAccounts(accountCtx, { ownerSub: from });
  if (!accounts.ok) return { ok: false, error: accounts.violations[0]?.code ?? "denied" };
  for (const a of accounts.value) {
    const r = await reassignAccount(accountCtx, a.id, to);
    if (r.ok) moved.accounts += 1;
    else skipped.push({ kind: "account", id: a.id, reason: r.violations[0]?.code ?? "denied" });
  }

  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  // OPEN ONLY - see the header. includeClosed is deliberately not passed.
  const deals = await listPipeline(pipelineCtx, { ownerSub: from });
  if (!deals.ok) return { ok: false, error: deals.violations[0]?.code ?? "denied" };
  for (const d of deals.value) {
    const r = await updateCommercialTerms(pipelineCtx, d.id, { ownerSub: to });
    if (r.ok) moved.opportunities += 1;
    else skipped.push({ kind: "opportunity", id: d.id, reason: r.violations[0]?.code ?? "denied" });
  }

  const signalCtx = { ...base, store: session.stores.signal() };
  const leads = await listLeads(signalCtx, { ownerSub: from });
  if (!leads.ok) return { ok: false, error: leads.violations[0]?.code ?? "denied" };
  for (const l of leads.value) {
    const r = await assignLead(signalCtx, l.id, to);
    if (r.ok) moved.leads += 1;
    else skipped.push({ kind: "lead", id: l.id, reason: r.violations[0]?.code ?? "denied" });
  }

  // Ownership drives what every list shows, so the whole shell is stale.
  revalidatePath("/", "layout");
  return { ok: true, moved, skipped };
}
