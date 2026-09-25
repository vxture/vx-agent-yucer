"use server";

import { revalidatePath } from "next/cache";
import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import { evidenceForPrompt } from "../../../domains/account/field-service";
import { runCopilotTurn } from "../../../domains/copilot/turn-service";
import { runAdvisor } from "../../../domains/copilot/advisor";
import { ADVISOR_RUN_TURN_METER } from "../../../usage/lib/copilot-turns";
import {
  CONFLICT_ACTION_TYPE,
  CONFLICT_CAPABILITY,
  CONSISTENCY_NOTE_WINDOW,
  consistencyQuestion,
  verifyConflict,
} from "../../../domains/copilot/lib/conflict";
import { canRunAdvisor } from "../../../domains/copilot/lib/advisor-gate";
import { getCopilotStore, getFieldStore } from "../../../domains/shared/registry";
import { resolveAppSession, tenantIdOf } from "../../lib/session";

// 核对说法 (L2 batch 7b) - one press, one model call, over the latest 20
// follow-ups (owner, 2026-09-22). Suspected conflicts land in the decision
// queue as `flag_conflict` proposals; the quote check in lib/conflict.ts runs
// BEFORE anything is written, so a conflict the record does not show is
// never filed.
//
// Gated before the model is called, on the capability's host feature
// (account.manage, YC-042): the check exists to produce proposals, and a
// workspace that cannot receive them must not pay for the call.

export type ConsistencyResult =
  | {
      ok: true;
      checkedNotes: number;
      conflicts: number;
      discarded: number;
      /** The same notes were already checked: the earlier run's answer, no model call, no charge. */
      unchanged?: boolean;
    }
  | { ok: false; error: string };

/** What a check run keeps under its fingerprint (agent_briefing, incr/0083). */
interface ConsistencyRun {
  readonly conflicts: number;
  readonly discarded: number;
}

export async function checkConsistency(accountId: string): Promise<ConsistencyResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const gate = canRunAdvisor(session.authz, session.entitlement, CONFLICT_CAPABILITY);
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

  const copilotCtx = { ...base, store: getCopilotStore() };
  const question = consistencyQuestion(account.name);
  // AN ADVISOR RUN, through the one door (runAdvisor, YC-042): metered as
  // yucer.advisor.runs under the fingerprint of exactly these notes, never as
  // a member's turn. The same notes checked again are the earlier answer -
  // the conflicts it found are already in the queue.
  const run = await runAdvisor<ConsistencyRun>(copilotCtx, {
    capability: CONFLICT_CAPABILITY,
    kind: "consistency_check",
    subject: { type: "account", id: accountId },
    input: { question, notes: evidence.value.notes.map((n) => ({ id: n.id, text: n.rawNote })) },
    generate: async ({ runId, atlas }) => {
      const turn = await runCopilotTurn(
        copilotCtx,
        {
          question,
          tenantId,
          subject: { type: "account", id: accountId, summary: account.name },
          evidence: evidence.value,
          autopilotActive: false,
          capability: CONFLICT_CAPABILITY,
          admitProposal: (p) => p.actionType === CONFLICT_ACTION_TYPE && verifyConflict(p.payload, notes),
          advisorRun: { featureId: atlas.featureId, runId },
        },
        { atlasClient: new AtlasClient(), runosClient: new RunosClient(), meter: ADVISOR_RUN_TURN_METER },
      );
      return turn.ok
        ? { ok: true as const, value: { conflicts: turn.value.proposals.length, discarded: turn.value.droppedProposals } }
        : turn;
    },
  });
  if (!run.ok) return { ok: false, error: run.violations[0]?.code ?? "denied" };

  revalidatePath(`/account/${accountId}`);
  return {
    ok: true,
    checkedNotes: notes.size,
    conflicts: run.value.content.conflicts,
    discarded: run.value.content.discarded,
    ...(run.value.cached ? { unchanged: true } : {}),
  };
}
