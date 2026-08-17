"use server";

import { revalidatePath } from "next/cache";
import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { getAccountStore, getCopilotStore, getFieldStore } from "../../domains/shared/registry";
import { getAccountDetail } from "../../domains/account/service";
import { evidenceForPrompt } from "../../domains/account/field-service";
import type { EvidenceGrounding } from "../../agent/orchestrator/prompt";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { resolveAppSession, tenantIdOf } from "../lib/session";
import type { TurnOutcome } from "../components/copilot-chat";

// Server action behind the conversation input.
//
// Same trust boundary as every other action in this app: the client sends the
// question and an optional session id, and nothing else. The workspace, the
// actor, the tenant, both gates and the proposal-recording gate are all
// re-derived here from the session.
//
// This shares runCopilotTurn() with POST /api/copilot/turn rather than
// duplicating the orchestration. Two entry points into one composition is fine;
// two compositions would eventually disagree about when a proposal gets written.

export type AskResult =
  | { ok: true; sessionId: string; outcome: TurnOutcome }
  | { ok: false; error: string };

export async function askCopilot(
  question: string,
  sessionId: string | null,
  /**
   * The account this conversation is about, when it is about one.
   *
   * Only an id crosses from the client. The name, the notes and the promises
   * are all re-read here behind account.view - a caller that could hand over
   * the evidence itself could hand over another workspace's.
   */
  accountId?: string,
): Promise<AskResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  // Assembled through the account domain's own gate. A denial is not an error
  // here: the conversation continues without the grounding, because a member
  // who cannot read the account can still ask the copilot general questions.
  let evidence: EvidenceGrounding | undefined;
  let subject: { type: "account"; id: string; summary?: string } | undefined;
  if (accountId) {
    const accountCtx = {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getAccountStore(),
    };
    const detail = await getAccountDetail(accountCtx, accountId);
    if (detail.ok) {
      subject = { type: "account", id: accountId, summary: detail.value.account.name };
      const built = await evidenceForPrompt(
        { ...accountCtx, store: getFieldStore() },
        accountId,
        detail.value.account.name,
      );
      if (built.ok) evidence = built.value;
    }
  }

  const result = await runCopilotTurn(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getCopilotStore(),
    },
    {
      question,
      sessionId: sessionId ?? undefined,
      tenantId,
      subject,
      evidence,
      // Autopilot is a workspace setting that does not exist yet. Passing false
      // rather than omitting it keeps the prompt honest: the copilot is told it
      // is NOT authorized to execute, which is the true state.
      autopilotActive: false,
    },
    { atlasClient: new AtlasClient(), runosClient: new RunosClient() },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }

  // The proposal queue on the same page is now stale.
  revalidatePath("/copilot");

  return {
    ok: true,
    sessionId: result.value.session.id,
    outcome: {
      answer: result.value.answer,
      proposalCount: result.value.proposals.length,
      droppedProposals: result.value.droppedProposals,
      capabilitiesUsed: result.value.invocations.filter((i) => i.ok).map((i) => i.capabilityId),
      truncated: result.value.truncated,
    },
  };
}
