"use server";

import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runAdvisor } from "../../domains/copilot/advisor";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { canRunAdvisor } from "../../domains/copilot/lib/advisor-gate";
import {
  REVIEW_CAPABILITY,
  admitReviewNarrative,
  reviewQuestion,
  type ReviewNarrative,
} from "../../domains/copilot/lib/review-narrative";
import { getOpportunityDetail, listWinLossReasons } from "../../domains/pipeline/service";
import { stageLabelFor } from "../lib/view-model";
import { getCopilotStore } from "../../domains/shared/registry";
import { ADVISOR_RUN_TURN_METER } from "../../usage/lib/copilot-turns";
import { resolveAppSession, tenantIdOf } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { reviewDraftFor } from "./review-draft-data";

// 复盘叙述 (deal batch 12b, YC-066 S7) - one press on the closed deal's review
// card. Written over exactly the four sections the card shows (the same
// reviewDraftFor), through runAdvisor (pipeline.winloss, one
// yucer.advisor.runs, cached by the draft), admitted by
// lib/review-narrative.ts. The suggested reason comes back as a suggestion -
// the card offers it as a button, it is never written into the form.

export type ReviewNarrativeResult =
  | { ok: true; narrative: readonly string[]; reasonId: string | null; dropped: number; cached: boolean }
  | { ok: false; error: string };

export async function draftReviewNarrative(opportunityId: string): Promise<ReviewNarrativeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const gate = canRunAdvisor(session.authz, session.entitlement, REVIEW_CAPABILITY);
  if (!gate.allowed) return { ok: false, error: gate.reason ?? "denied" };
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  const deal = await getOpportunityDetail(pipelineCtx, opportunityId);
  if (!deal.ok) return { ok: false, error: deal.violations[0]?.code ?? "denied" };
  if (deal.value.status === "open") return { ok: false, error: "not_closed" };
  const { STAGE_LABEL, CHAIN_TEXT } = await getMessages();
  const [draft, reasons] = await Promise.all([
    reviewDraftFor(session, opportunityId, {
      stageName: (code, catalog) => stageLabelFor(code, catalog, STAGE_LABEL),
      unnamedPerson: CHAIN_TEXT.unnamedPerson,
    }),
    listWinLossReasons(pipelineCtx),
  ]);
  if (!draft) return { ok: false, error: "not_closed" };
  const won = deal.value.status === "won";
  const input = {
    dealName: deal.value.name,
    outcome: deal.value.status,
    draft,
    reasons: (reasons.ok ? reasons.value : []).filter((r) => (won ? r.forWon : r.forLost)).map((r) => ({ id: r.id, name: r.name })),
  };
  const question = reviewQuestion(input);
  const copilotCtx = { ...base, store: getCopilotStore() };
  const run = await runAdvisor<{ narrative: ReviewNarrative | null }>(copilotCtx, {
    capability: REVIEW_CAPABILITY,
    kind: "review_draft",
    subject: { type: "opportunity", id: opportunityId },
    input: { question },
    generate: async ({ runId, atlas }) => {
      const turn = await runCopilotTurn(
        copilotCtx,
        {
          question,
          tenantId,
          subject: { type: "opportunity", id: opportunityId, summary: deal.value.name },
          autopilotActive: false,
          capability: REVIEW_CAPABILITY,
          // A draft, not a proposal: nothing this turn suggests is filed.
          admitProposal: () => false,
          advisorRun: { featureId: atlas.featureId, runId },
        },
        { atlasClient: new AtlasClient(), runosClient: new RunosClient(), meter: ADVISOR_RUN_TURN_METER },
      );
      return turn.ok ? { ok: true as const, value: { narrative: admitReviewNarrative(turn.value.answer, input) } } : turn;
    },
  });
  if (!run.ok) return { ok: false, error: run.violations[0]?.code ?? "denied" };
  const n = run.value.content.narrative;
  if (!n) return { ok: false, error: "review_narrative_empty" };
  return { ok: true, narrative: n.narrative, reasonId: n.reasonId, dropped: n.dropped, cached: run.value.cached };
}
