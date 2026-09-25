import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runAdvisor } from "../../domains/copilot/advisor";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { listProposals } from "../../domains/copilot/service";
import { EVIDENCE_ACTION_TYPE } from "../../domains/copilot/lib/action";
import {
  EVIDENCE_CAPABILITY,
  evidenceQuestion,
  evidenceSeenKey,
  verifyEvidenceProposal,
} from "../../domains/copilot/lib/evidence-extract";
import { evidenceOf, getOpportunityDetail } from "../../domains/pipeline/service";
import { EVIDENCE_SLOTS, type EvidenceSlot } from "../../domains/pipeline/lib/evidence";
import { getCopilotStore } from "../../domains/shared/registry";
import { ADVISOR_RUN_TURN_METER } from "../../usage/lib/copilot-turns";
import { tenantIdOf, type AppSession } from "../lib/session";

// 证据抽取 (deal batch 4b, YC-066 §04/§05): a follow-up was saved on a deal;
// read it for buying evidence and file what it supports as in-place proposals.
//
// EVENT-TRIGGERED, NOT PAGE-TRIGGERED (YC-066 §07): it runs once per saved
// note, after the response has been sent, so saving a note never waits on a
// model. Through runAdvisor - the one door: gated on the deal's own feature
// (pipeline.manage), charged as one yucer.advisor.runs, and the same note run
// again answers from the cache.
//
// SILENT ON FAILURE, by design: this is background work behind a save that
// already succeeded. A refused gate, an unadmitted run or a model error
// leaves the note saved and files nothing - the slots stay what people wrote.

export async function extractEvidence(
  session: AppSession,
  opportunityId: string,
  note: { readonly id: string; readonly text: string },
): Promise<void> {
  const tenantId = tenantIdOf(session);
  if (!tenantId || !note.text.trim()) return;
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  const copilotCtx = { ...base, store: getCopilotStore() };

  const [deal, slots, proposals] = await Promise.all([
    getOpportunityDetail(pipelineCtx, opportunityId),
    evidenceOf(pipelineCtx, opportunityId),
    listProposals(copilotCtx, {}),
  ]);
  if (!deal.ok || !slots.ok) return;

  const current: Partial<Record<EvidenceSlot, string>> = {};
  for (const s of EVIDENCE_SLOTS) if (slots.value[s].filled) current[s] = slots.value[s].current!.statement;
  // What a person has already been shown for this deal - pending or rejected:
  // "忽略后同一原句不再提出" (YC-070).
  const seen = new Set(
    (proposals.ok ? proposals.value : [])
      .filter(
        (a) =>
          a.actionType === EVIDENCE_ACTION_TYPE &&
          a.subjectId === opportunityId &&
          (a.status === "proposed" || a.status === "rejected"),
      )
      .map((a) => evidenceSeenKey(String(a.payload.slot ?? ""), String(a.payload.quote ?? ""))),
  );
  const question = evidenceQuestion({ dealName: deal.value.name, opportunityId, note, current });

  await runAdvisor(copilotCtx, {
    capability: EVIDENCE_CAPABILITY,
    kind: "evidence_extract",
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
          capability: EVIDENCE_CAPABILITY,
          admitProposal: (p) =>
            p.actionType === EVIDENCE_ACTION_TYPE && verifyEvidenceProposal(p.payload, note, current, seen),
          advisorRun: { featureId: atlas.featureId, runId },
        },
        { atlasClient: new AtlasClient(), runosClient: new RunosClient(), meter: ADVISOR_RUN_TURN_METER },
      );
      return turn.ok
        ? { ok: true as const, value: { proposed: turn.value.proposals.length, dropped: turn.value.droppedProposals } }
        : turn;
    },
  }).catch(() => undefined);
}
