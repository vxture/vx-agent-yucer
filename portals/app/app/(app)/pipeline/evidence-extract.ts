import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runAdvisor } from "../../domains/copilot/advisor";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { listProposals } from "../../domains/copilot/service";
import {
  COMMITMENT_ACTION_TYPE,
  EVIDENCE_ACTION_TYPE,
  EXTRACTION_ACTION_TYPES,
  ROLE_ACTION_TYPE,
} from "../../domains/copilot/lib/action";
import {
  EVIDENCE_CAPABILITY,
  commitmentSeenKey,
  evidenceQuestion,
  evidenceSeenKey,
  roleSeenKey,
  verifyCommitmentProposal,
  verifyEvidenceProposal,
  verifyRoleProposal,
  type RosterPerson,
} from "../../domains/copilot/lib/evidence-extract";
import { buyingRolesFor, getAccountDetail } from "../../domains/account/service";
import { listCommitments } from "../../domains/account/field-service";
import { evidenceOf, getOpportunityDetail } from "../../domains/pipeline/service";
import { EVIDENCE_SLOTS, type EvidenceSlot } from "../../domains/pipeline/lib/evidence";
import { getCopilotStore, getFieldStore } from "../../domains/shared/registry";
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
  note: { readonly id: string; readonly text: string; readonly occurredAt?: Date },
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

  // 4c: the customer's people (roles as recorded for this deal, where this
  // member may read them - "unknown" otherwise) and the promises already open.
  const accountCtx = { ...base, store: session.stores.account() };
  const [account, roles, commitments] = await Promise.all([
    getAccountDetail(accountCtx, deal.value.accountId),
    buyingRolesFor(accountCtx, opportunityId),
    listCommitments({ ...base, store: getFieldStore() }, { opportunityId }),
  ]);
  const roster: RosterPerson[] = (account.ok ? account.value.contacts : []).map((c) => {
    const held = roles.ok ? roles.value.find((r) => r.personId === c.id) : undefined;
    return { id: c.id, name: c.name, title: c.title, buyingRole: held?.buyingRole ?? "unknown", stance: held?.stance ?? null };
  });
  const openCommitments = (commitments.ok ? commitments.value : []).filter((c) => c.status === "open").map((c) => c.statement);

  const current: Partial<Record<EvidenceSlot, string>> = {};
  for (const s of EVIDENCE_SLOTS) if (slots.value[s].filled) current[s] = slots.value[s].current!.statement;
  // What a person has already been shown for this deal - pending or rejected:
  // "忽略后同一原句不再提出" (YC-070).
  const seen = new Set(
    (proposals.ok ? proposals.value : [])
      .filter(
        (a) =>
          EXTRACTION_ACTION_TYPES.includes(a.actionType) &&
          a.subjectId === opportunityId &&
          (a.status === "proposed" || a.status === "rejected"),
      )
      .map((a) => {
        const quote = String(a.payload.quote ?? "");
        return a.actionType === ROLE_ACTION_TYPE
          ? roleSeenKey(String(a.payload.personId ?? ""), quote)
          : a.actionType === COMMITMENT_ACTION_TYPE
            ? commitmentSeenKey(quote)
            : evidenceSeenKey(String(a.payload.slot ?? ""), quote);
      }),
  );
  const question = evidenceQuestion({
    dealName: deal.value.name,
    opportunityId,
    note: { ...note, occurredOn: (note.occurredAt ?? new Date()).toISOString().slice(0, 10) },
    current,
    roster,
    openCommitments,
  });

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
            p.actionType === EVIDENCE_ACTION_TYPE
              ? verifyEvidenceProposal(p.payload, note, current, seen)
              : p.actionType === ROLE_ACTION_TYPE
                ? verifyRoleProposal(p.payload, note, roster, seen)
                : p.actionType === COMMITMENT_ACTION_TYPE
                  ? verifyCommitmentProposal(p.payload, note, openCommitments, seen)
                  : false,
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
