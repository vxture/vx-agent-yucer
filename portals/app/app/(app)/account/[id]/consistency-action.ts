"use server";

import { revalidatePath } from "next/cache";
import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import { can } from "../../../authz/decide";
import { evidenceForPrompt } from "../../../domains/account/field-service";
import { runCopilotTurn } from "../../../domains/copilot/turn-service";
import {
  CONFLICT_ACTION_TYPE,
  CONFLICT_CAPABILITY,
  CONSISTENCY_NOTE_WINDOW,
  consistencyQuestion,
  verifyConflict,
} from "../../../domains/copilot/lib/conflict";
import { getCopilotStore, getFieldStore } from "../../../domains/shared/registry";
import { resolveAppSession, tenantIdOf } from "../../lib/session";

// 核对说法 (L2 batch 7b) - one press, one model call, over the latest 20
// follow-ups (owner, 2026-09-22). Suspected conflicts land in the decision
// queue as `flag_conflict` proposals; the quote check in lib/conflict.ts runs
// BEFORE anything is written, so a conflict the record does not show is
// never filed.
//
// Gated on copilot.suggest before the model is called: the check exists to
// produce proposals, and a workspace that cannot receive them must not pay
// for the call.

export type ConsistencyResult =
  | { ok: true; checkedNotes: number; conflicts: number; discarded: number }
  | { ok: false; error: string };

export async function checkConsistency(accountId: string): Promise<ConsistencyResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const gate = can(session.authz, session.entitlement, "copilot.suggest", "data");
  if (!gate.allowed) return { ok: false, error: gate.reason ?? "denied" };
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const account = await session.stores.account().getAccount(session.workspaceId, accountId);
  if (!account) return { ok: false, error: "not_found" };

  const evidence = await evidenceForPrompt({ ...base, store: getFieldStore() }, accountId, account.name, {
    maxNotes: CONSISTENCY_NOTE_WINDOW,
  });
  if (!evidence.ok) return { ok: false, error: evidence.violations[0]?.code ?? "denied" };
  // Fewer than two notes cannot disagree with each other - said, not charged.
  if (evidence.value.notes.length < 2) {
    return { ok: true, checkedNotes: evidence.value.notes.length, conflicts: 0, discarded: 0 };
  }
  const notes = new Map(evidence.value.notes.map((n) => [n.id, n.rawNote]));

  const result = await runCopilotTurn(
    { ...base, store: getCopilotStore() },
    {
      question: consistencyQuestion(account.name),
      tenantId,
      subject: { type: "account", id: accountId, summary: account.name },
      evidence: evidence.value,
      autopilotActive: false,
      capability: CONFLICT_CAPABILITY,
      admitProposal: (p) => p.actionType === CONFLICT_ACTION_TYPE && verifyConflict(p.payload, notes),
    },
    { atlasClient: new AtlasClient(), runosClient: new RunosClient() },
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  revalidatePath(`/account/${accountId}`);
  return {
    ok: true,
    checkedNotes: notes.size,
    conflicts: result.value.proposals.length,
    discarded: result.value.droppedProposals,
  };
}
