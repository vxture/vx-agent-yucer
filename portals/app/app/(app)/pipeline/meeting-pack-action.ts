"use server";

import { AtlasClient } from "../../agent/atlas/client";
import { RunosClient } from "../../agent/runos/client";
import { runAdvisor } from "../../domains/copilot/advisor";
import { runCopilotTurn } from "../../domains/copilot/turn-service";
import { canRunAdvisor } from "../../domains/copilot/lib/advisor-gate";
import { admitMeetingAdvice, meetingQuestion, MEETING_CAPABILITY, type DealMeetingAdvice } from "../../domains/copilot/lib/deal-meeting";
import { buildDealMeetingPack, type DealMeetingPack } from "../../domains/pipeline/lib/deal-meeting-pack";
import { competitionOf, getOpportunityDetail, listExitCriteria, listStageDefinitions } from "../../domains/pipeline/service";
import { decisionChainsByOpportunity, getAccountDetail } from "../../domains/account/service";
import { chainRecency, listCommitments, listInteractions } from "../../domains/account/field-service";
import { listOpportunityLines } from "../../domains/catalog/service";
import { getCatalogStore, getCopilotStore, getFieldStore } from "../../domains/shared/registry";
import { ADVISOR_RUN_TURN_METER } from "../../usage/lib/copilot-turns";
import { resolveAppSession, tenantIdOf } from "../lib/session";
import { exitSnapshotFor } from "./exit-snapshot";

// 商机会前包 (deal batch 11a, YC-066 S6) - one press in 本单参谋.
//
// THE RULE HALF ALWAYS: the chosen attendees with their role and stance on
// THIS deal and when each was last in a note, the open promises, and the
// meeting's goal (buildDealMeetingPack). Read through the same gated verbs
// the deal page uses; the attendees are re-resolved here, never taken from
// the client.
//
// THE 参谋'S HALF WHEN IT MAY: agenda, a talk track per attendee, objections
// and questions, through runAdvisor (pipeline.manage, one
// yucer.advisor.runs, the same pack answers from the cache) and admitted by
// lib/deal-meeting.ts. When it cannot run, the rule half still comes back,
// with the reason beside it.

const NOTE_WINDOW = 10;

export type DealMeetingResult =
  | {
      ok: true;
      pack: DealMeetingPack;
      advice: DealMeetingAdvice | null;
      /** Why there is no advice, when there is none. */
      adviceError: string | null;
      cached: boolean;
    }
  | { ok: false; error: string };

export async function buildDealMeetingPackAction(input: { opportunityId: string; attendeeContactIds: string[] }): Promise<DealMeetingResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (input.attendeeContactIds.length === 0) return { ok: false, error: "attendees_required" };
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  const accountCtx = { ...base, store: session.stores.account() };
  const fieldCtx = { ...base, store: getFieldStore() };
  const deal = await getOpportunityDetail(pipelineCtx, input.opportunityId);
  if (!deal.ok) return { ok: false, error: deal.violations[0]?.code ?? "denied" };
  const o = deal.value;
  const now = new Date();

  const [account, chains, commitments, criteria, stages, snapshot] = await Promise.all([
    getAccountDetail(accountCtx, o.accountId),
    decisionChainsByOpportunity(accountCtx, o.accountId, [{ id: o.id, name: o.name }]).catch(() => null),
    listCommitments(fieldCtx, { opportunityId: o.id }),
    listExitCriteria(pipelineCtx),
    listStageDefinitions(pipelineCtx),
    exitSnapshotFor(session, o.id),
  ]);
  if (!account.ok) return { ok: false, error: account.violations[0]?.code ?? "denied" };
  const people = chains?.ok ? (chains.value[0]?.people ?? []) : [];
  const recency = chains?.ok ? await chainRecency(fieldCtx, o.accountId, people, [], { now }) : null;
  const chosen = account.value.contacts.filter((c) => input.attendeeContactIds.includes(c.id));
  if (chosen.length === 0) return { ok: false, error: "attendees_required" };

  // The stage order and names, and the current stage's criteria in their order
  // with the statuses the exit check gave them.
  const open = (stages.ok ? stages.value : []).filter((s) => !s.isTerminal).sort((a, b) => a.sortOrder - b.sortOrder);
  const here = open.findIndex((s) => s.stageCode === o.stage);
  const nameOf = (code: string) => open.find((s) => s.stageCode === code)?.name ?? code;
  const ofStage = (code: string) =>
    (criteria.ok ? criteria.value : []).filter((c) => c.stageCode === code).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.name);
  const statusOf = (name: string): "met" | "unmet" | "unknown" =>
    snapshot?.met.includes(name) ? "met" : snapshot?.unmet.includes(name) ? "unmet" : "unknown";
  const next = here >= 0 ? open[here + 1] : undefined;

  const pack = buildDealMeetingPack({
    attendees: chosen.map((c) => {
      const p = people.find((x) => x.id === c.id);
      return {
        contactId: c.id,
        name: c.name,
        title: c.title ?? null,
        role: p?.decisionRole ?? null,
        stance: p?.stance ?? null,
        lastContactAt: recency?.ok ? (recency.value.lastContactAt.get(c.id) ?? null) : null,
      };
    }),
    commitments: commitments.ok ? commitments.value : [],
    current: o.status === "open" ? { stage: nameOf(o.stage), checks: ofStage(o.stage).map((name) => ({ name, status: statusOf(name) })) } : null,
    next: next ? { stage: next.name, criteria: ofStage(next.stageCode) } : null,
    now,
  });

  // The 参谋's half - only when it may run; its failure never costs the pack.
  const gate = canRunAdvisor(session.authz, session.entitlement, MEETING_CAPABILITY);
  const tenantId = tenantIdOf(session);
  if (!gate.allowed || !tenantId) {
    return { ok: true, pack, advice: null, adviceError: gate.allowed ? "no_active_tenant" : (gate.reason ?? "denied"), cached: false };
  }
  const [notes, competition, lines] = await Promise.all([
    listInteractions(fieldCtx, { opportunityId: o.id, limit: NOTE_WINDOW }),
    competitionOf(pipelineCtx, o.id, now),
    listOpportunityLines({ ...base, store: getCatalogStore() }),
  ]);
  const meeting = {
    dealName: o.name,
    stage: nameOf(o.stage),
    pack,
    notes: (notes.ok ? notes.value : [])
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, NOTE_WINDOW)
      .map((n) => ({ id: n.id, date: n.occurredAt.toISOString().slice(0, 10), text: n.rawNote })),
    rivals: competition.ok
      ? competition.value.field.rivals.map((r) => competition.value.competitors.find((c) => c.id === r.competitorId)?.name ?? r.competitorId)
      : [],
    amounts: [
      o.amount?.amount ?? null,
      o.customerBudget ?? null,
      ...(lines.ok ? lines.value.filter((l) => l.opportunityId === o.id).flatMap((l) => [l.amount, l.unitPrice]) : []),
    ],
  };
  const question = meetingQuestion(meeting);
  const copilotCtx = { ...base, store: getCopilotStore() };
  const run = await runAdvisor<{ advice: DealMeetingAdvice | null }>(copilotCtx, {
    capability: MEETING_CAPABILITY,
    kind: "meeting_pack",
    subject: { type: "opportunity", id: o.id },
    input: { question },
    generate: async ({ runId, atlas }) => {
      const turn = await runCopilotTurn(
        copilotCtx,
        {
          question,
          tenantId,
          subject: { type: "opportunity", id: o.id, summary: o.name },
          autopilotActive: false,
          capability: MEETING_CAPABILITY,
          // A pack, not a proposal: nothing this turn suggests is filed.
          admitProposal: () => false,
          advisorRun: { featureId: atlas.featureId, runId },
        },
        { atlasClient: new AtlasClient(), runosClient: new RunosClient(), meter: ADVISOR_RUN_TURN_METER },
      );
      return turn.ok ? { ok: true as const, value: { advice: admitMeetingAdvice(turn.value.answer, meeting) } } : turn;
    },
  });
  if (!run.ok) return { ok: true, pack, advice: null, adviceError: run.violations[0]?.code ?? "denied", cached: false };
  return {
    ok: true,
    pack,
    advice: run.value.content.advice,
    adviceError: run.value.content.advice ? null : "meeting_advice_empty",
    cached: run.value.cached,
  };
}
