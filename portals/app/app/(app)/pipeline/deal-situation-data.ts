import { peekAdvisor } from "../../domains/copilot/advisor";
import {
  SITUATION_CAPABILITY,
  SITUATION_NOTE_WINDOW,
  situationQuestion,
  type Situation,
  type SituationInput,
} from "../../domains/copilot/lib/deal-situation";
import { getOpportunityDetail, listStageDefinitions, stageHistory } from "../../domains/pipeline/service";
import { decisionChainsByOpportunity, getAccountDetail } from "../../domains/account/service";
import { chainRecency, listCommitments, listInteractions } from "../../domains/account/field-service";
import { stallHolder, stallSentence } from "../../domains/pipeline/lib/brief";
import { enteredStageAt } from "../../domains/pipeline/lib/forecast-rule";
import { toStageCatalog } from "../../domains/pipeline/store";
import { DEFAULT_STAGE_DEFINITIONS } from "../../domains/pipeline/lib/stage";
import { getCopilotStore, getFieldStore } from "../../domains/shared/registry";
import { getMessages } from "../lib/i18n/server";
import { stageLabelFor } from "../lib/view-model";
import type { AppSession } from "../lib/session";
import { assessDeals } from "./deal-assessments";

// 局势简报's input for one open deal (deal batch 8b) - ONE assembly, read by
// the deck (to show what is already written for the data as it stands) and by
// the action (to write it when nothing is).
//
// The assessment is assessDeals' - the same facts builder the deal page and
// 预测检视台 score with - so the brief explains the five dimensions the page
// shows, not a sixth reading. Who a stalled deal is stuck on is stallHolder's,
// the rule the page's 态势判决 uses. The model gets both as final.

const DAY = 86_400_000;

export interface SituationFrame {
  readonly opportunityId: string;
  readonly input: SituationInput;
  readonly question: string;
  /** The rule's line for who it is stuck on - shown above the 参谋's why. */
  readonly stallHolder: string | null;
}

export async function situationFrameFor(session: AppSession, opportunityId: string, now: Date = new Date()): Promise<SituationFrame | null> {
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  const fieldCtx = { ...base, store: getFieldStore() };
  const accountCtx = { ...base, store: session.stores.account() };
  const deal = await getOpportunityDetail(pipelineCtx, opportunityId);
  // A closed deal has its 复盘底稿; the brief is about a deal still in play.
  if (!deal.ok || deal.value.status !== "open") return null;
  const o = deal.value;

  const [history, stages, notes, commitments, account, chains] = await Promise.all([
    stageHistory(pipelineCtx, o.id),
    listStageDefinitions(pipelineCtx),
    listInteractions(fieldCtx, { opportunityId: o.id, limit: SITUATION_NOTE_WINDOW }),
    listCommitments(fieldCtx, { opportunityId: o.id }),
    getAccountDetail(accountCtx, o.accountId),
    decisionChainsByOpportunity(accountCtx, o.accountId, [{ id: o.id, name: o.name }]).catch(() => null),
  ]);
  // Days at this stage exactly as the page counts them.
  const lastMoved = history.ok ? (history.value.map((e) => e.occurredAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null) : null;
  const entered = enteredStageAt(lastMoved, o.createdAt);
  const daysInStage = entered ? Math.max(0, Math.floor((now.getTime() - entered.getTime()) / DAY)) : null;

  const { DEAL_SCORE_TEXT, WAR_ROOM_TEXT, STAGE_LABEL, DIRECTION_LABEL, POSITION_TEXT, CHAIN_TEXT } = await getMessages();
  const assessed = (await assessDeals(session, [{ opportunity: o, daysAtStage: daysInStage }], POSITION_TEXT.rivalWords, now)).get(o.id);
  if (!assessed) return null;

  const catalog = stages.ok ? toStageCatalog(stages.value) : DEFAULT_STAGE_DEFINITIONS;
  const verdictOf = (i: { key: string; tone: string }) =>
    i.key === "statusQuo" && i.tone === "good" ? DEAL_SCORE_TEXT.verdictNone : (DEAL_SCORE_TEXT.verdict[i.tone] ?? i.tone);
  const gapOf = (i: { tone: string; gap?: { code: string; n?: number } }) =>
    i.tone === "good" || !i.gap ? null : (DEAL_SCORE_TEXT.gap[i.gap.code]?.(i.gap.n ?? 0) ?? i.gap.code);

  // 卡在谁 - only past the line, as on the page.
  let stall: SituationInput["stall"] = null;
  let holderLine: string | null = null;
  if (daysInStage !== null && daysInStage > assessed.stallLine) {
    const contactName = new Map((account.ok ? account.value.contacts : []).map((c) => [c.id, c.name]));
    const people = chains?.ok ? (chains.value[0]?.people ?? []) : [];
    const recency = chains?.ok ? await chainRecency(fieldCtx, o.accountId, people, [], { now }) : null;
    const holder = stallHolder(
      {
        now,
        commitments: (commitments.ok ? commitments.value : []).map((c) => ({
          id: c.id,
          direction: c.direction,
          status: c.status,
          dueAt: c.dueAt,
          statement: c.statement,
          counterpartName: c.counterpartContactId ? (contactName.get(c.counterpartContactId) ?? null) : null,
        })),
        economicBuyers: recency?.ok
          ? people
              .filter((p) => p.decisionRole === "economic" && p.status === "active")
              .map((p) => ({ name: contactName.get(p.id) ?? CHAIN_TEXT.unnamedPerson, lastContactAt: recency.value.lastContactAt.get(p.id) ?? null }))
          : undefined,
      },
      daysInStage,
    );
    holderLine = stallSentence(holder, WAR_ROOM_TEXT);
    stall = { days: daysInStage, line: assessed.stallLine, holder: holderLine };
  }

  const day = (d: Date) => d.toISOString().slice(0, 10);
  const input: SituationInput = {
    dealName: o.name,
    stage: stageLabelFor(o.stage, catalog, STAGE_LABEL),
    currency: o.currency,
    amount: o.amount?.amount ?? null,
    budget: o.customerBudget ?? null,
    expectedCloseAt: o.expectedCloseAt ? day(o.expectedCloseAt) : null,
    score: assessed.assessment.score,
    dimensions: assessed.assessment.dimensions.map((d) => ({
      key: d.dimension,
      label: DEAL_SCORE_TEXT.factor[d.dimension] ?? d.dimension,
      score: d.score,
      indicators: d.indicators.map((i) => ({
        label: DEAL_SCORE_TEXT.indicator[i.key] ?? i.key,
        verdict: verdictOf(i),
        gap: gapOf(i),
      })),
    })),
    stall,
    promises: (commitments.ok ? commitments.value : [])
      .filter((c) => c.status === "open")
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .map((c) => ({ direction: DIRECTION_LABEL[c.direction] ?? c.direction, statement: c.statement, dueAt: day(c.dueAt) })),
    notes: (notes.ok ? notes.value : [])
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, SITUATION_NOTE_WINDOW)
      .map((n) => ({ id: n.id, date: day(n.occurredAt), text: n.rawNote })),
  };
  return { opportunityId: o.id, input, question: situationQuestion(input), stallHolder: holderLine };
}

/** What runAdvisor keys the run on - the deck's peek and the action must agree. */
export function situationRun(frame: SituationFrame) {
  return {
    capability: SITUATION_CAPABILITY,
    kind: "situation",
    subject: { type: "opportunity", id: frame.opportunityId },
    input: { question: frame.question },
  } as const;
}

export interface SituationRun {
  readonly situation: Situation | null;
}

/** What is already written for the data as it stands - no model call. */
export async function peekSituation(session: AppSession, frame: SituationFrame): Promise<SituationRun | null> {
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCopilotStore(),
  };
  const hit = await peekAdvisor<SituationRun>(ctx, situationRun(frame));
  return hit ? hit.content : null;
}

/** The notes a situation cites, for the card to open each citation. */
export function citedNotes(frame: SituationFrame, s: Situation): Record<string, { date: string; text: string }> {
  const ids = new Set([...s.summary.flatMap((x) => x.noteIds), ...s.risks.flatMap((x) => x.noteIds), ...(s.stall?.quote ? [s.stall.quote.noteId] : [])]);
  return Object.fromEntries(frame.input.notes.filter((n) => ids.has(n.id)).map((n) => [n.id, { date: n.date, text: n.text }]));
}
