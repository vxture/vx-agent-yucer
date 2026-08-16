"use server";

import { revalidatePath } from "next/cache";
import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { getCopilotStore } from "../../domains/shared/registry";
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

export async function askCopilot(question: string, sessionId: string | null): Promise<AskResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

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
