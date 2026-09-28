import { peekAdvisor } from "../../domains/copilot/advisor";
import { listProposals } from "../../domains/copilot/service";
import {
  NEXT_ACTION_CAPABILITY,
  NEXT_ACTION_NOTE_WINDOW,
  nextActionQuestion,
  type NextActionInput,
} from "../../domains/copilot/lib/next-action";
import { listExitCriteria, listStageDefinitions } from "../../domains/pipeline/service";
import { getCopilotStore } from "../../domains/shared/registry";
import { getMessages } from "../lib/i18n/server";
import type { AppSession } from "../lib/session";
import { exitSnapshotFor } from "./exit-snapshot";
import type { SituationFrame } from "./deal-situation-data";

// 下一步最佳动作's input for one open deal (deal batch 8c) - built on the
// 局势简报's frame (the same stall point, promises and notes the deck already
// read) plus the exit check the stage drawer records. Read by the deck, to
// know whether this data has had its run, and by the action that runs it.

export interface NextActionFrame {
  readonly opportunityId: string;
  readonly input: NextActionInput;
  readonly question: string;
}

export async function nextActionFrameFor(session: AppSession, situation: SituationFrame, now: Date = new Date()): Promise<NextActionFrame | null> {
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const pipelineCtx = { ...base, store: session.stores.pipeline() };
  const [snapshot, stages, criteria, { NEXT_ACTION_TEXT }] = await Promise.all([
    exitSnapshotFor(session, situation.opportunityId),
    listStageDefinitions(pipelineCtx),
    listExitCriteria(pipelineCtx),
    getMessages(),
  ]);
  // The goals, by the words the page shows: this stage's unmet criteria, or
  // when none is unmet the next stage's; then the stall point.
  const open = (stages.ok ? stages.value : []).filter((s) => !s.isTerminal).sort((a, b) => a.sortOrder - b.sortOrder);
  const here = open.findIndex((s) => s.stageCode === situation.stageCode);
  const next = here >= 0 ? open[here + 1] : undefined;
  const nextNames = next && criteria.ok ? criteria.value.filter((c) => c.stageCode === next.stageCode).map((c) => c.name) : [];
  const unmet = snapshot?.unmet ?? [];
  const goals = [
    ...(unmet.length > 0 ? unmet : nextNames),
    ...(situation.input.stall ? [NEXT_ACTION_TEXT.stallGoal(situation.input.stall.holder)] : []),
  ];
  if (goals.length === 0) return null;

  const input: NextActionInput = {
    dealName: situation.input.dealName,
    opportunityId: situation.opportunityId,
    stage: situation.input.stage,
    goals: [...new Set(goals)],
    openCommitments: situation.input.promises,
    notes: situation.input.notes.slice(0, NEXT_ACTION_NOTE_WINDOW).map((n) => ({ date: n.date, text: n.text })),
    today: now.toISOString().slice(0, 10),
  };
  return { opportunityId: situation.opportunityId, input, question: nextActionQuestion(input) };
}

/** What runAdvisor keys the run on - the deck's check and the action must agree. */
export function nextActionRun(frame: NextActionFrame) {
  return {
    capability: NEXT_ACTION_CAPABILITY,
    kind: "next_action",
    subject: { type: "opportunity", id: frame.opportunityId },
    input: { question: frame.question },
  } as const;
}

/**
 * Should the page ask for a next action now? ONE A DAY PER DEAL - the design's
 * daily cadence, paid only for deals someone opens (owner 2026-09-28): not
 * while one waits for a decision, not when one was already filed today
 * (accepting it adds a promise, which is new data - without this the page
 * would ask again the moment it reloaded), and not when this input has had
 * its run.
 */
export async function nextActionDue(session: AppSession, frame: NextActionFrame, now: Date = new Date()): Promise<boolean> {
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getCopilotStore(),
  };
  const filed = await listProposals(ctx, { subjectType: "opportunity", subjectId: frame.opportunityId });
  if (!filed.ok) return false;
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const mine = filed.value.filter((p) => p.capability === NEXT_ACTION_CAPABILITY);
  if (mine.some((p) => p.status === "proposed" || p.createdAt.getTime() >= dayStart)) return false;
  return (await peekAdvisor(ctx, nextActionRun(frame))) === null;
}
