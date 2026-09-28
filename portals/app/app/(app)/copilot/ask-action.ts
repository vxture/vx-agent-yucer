"use server";

import { revalidatePath } from "next/cache";
import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { getAccountStore, getCopilotStore, getFieldStore } from "../../domains/shared/registry";
import { getAccountDetail } from "../../domains/account/service";
import { evidenceForPrompt } from "../../domains/account/field-service";
import type { EvidenceGrounding } from "../../agent/orchestrator/prompt";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { getOpportunityDetail } from "../../domains/pipeline/service";
import { rehearsalFrame } from "../../domains/copilot/lib/rehearsal";
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
  /**
   * Deal batch 11b/11c. `opportunityId` anchors the conversation to one deal
   * (对话锚定本单): its account, and only that deal's follow-ups and promises
   * as evidence - re-read here behind the deal's own gate. `rehearsal` makes
   * the turn a 预演: framed as role-play, and no proposal is admitted.
   */
  anchor?: { opportunityId?: string; rehearsal?: boolean },
): Promise<AskResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  // Assembled through the account domain's own gate. A denial is not an error
  // here: the conversation continues without the grounding, because a member
  // who cannot read the account can still ask the copilot general questions.
  let evidence: EvidenceGrounding | undefined;
  let subject: { type: "account" | "opportunity"; id: string; summary?: string } | undefined;
  let framing: string | undefined;
  if (anchor?.opportunityId) {
    const base = {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
    };
    const deal = await getOpportunityDetail({ ...base, store: session.stores.pipeline() }, anchor.opportunityId);
    if (deal.ok) {
      subject = { type: "opportunity", id: deal.value.id, summary: deal.value.name };
      const account = await getAccountDetail({ ...base, store: session.stores.account() }, deal.value.accountId);
      const built = await evidenceForPrompt(
        { ...base, store: getFieldStore() },
        deal.value.accountId,
        account.ok ? account.value.account.name : deal.value.name,
        { opportunityId: deal.value.id },
      );
      if (built.ok) evidence = built.value;
      if (anchor.rehearsal) framing = rehearsalFrame(deal.value.name);
    }
  } else if (accountId) {
    const accountCtx = {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.account(),
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
      framing,
      // 预演: nothing said in a rehearsal becomes a proposal.
      ...(framing ? { admitProposal: () => false } : {}),
      // THE SETTING EXISTS NOW - incr/0020 gave autonomy a home, and this
      // comment used to say it did not. Still false, and now for a reason
      // rather than for want of a column: `autopilotActive` shapes what the
      // PROMPT tells the model about its own authority, and the four-yes check
      // that actually decides whether a proposal runs unattended lives in
      // execute(), against the stored posture, at accept time.
      //
      // Telling the model "you may execute" would not make it so - it would
      // only make the model describe its own powers wrongly to the person
      // reading the answer. The honest thing for a conversational turn is that
      // the machine proposes; whether a proposal then runs itself is decided
      // later, elsewhere, by a rule the model does not get a vote in.
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
