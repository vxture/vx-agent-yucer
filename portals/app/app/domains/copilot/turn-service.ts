// One copilot turn, end to end: gate -> session -> model+tools -> proposals.
//
// This is the composition the orchestrator was missing. runTurn() knows how to
// talk to Atlas and Runos but nothing about workspaces, permissions or storage;
// this function supplies all three and is the only thing a route needs to call.
//
// Ordering matters and is not arbitrary:
//
//   1. Gate FIRST. A member without copilot.use must not cost a model call.
//      Atlas meters every request, so an ungated turn is billable.
//   2. Persist the question BEFORE calling the model. If the model call fails,
//      the member's question is still in the transcript; the reverse loses it.
//   3. Record proposals through recordProposals(), which gates again on
//      copilot.suggest. A workspace that bought `copilot.ask` gets answers and
//      no proposals - the model may still emit them, and they are dropped here
//      rather than written.

import type { Entitlement } from "../../entitlement/types";
import { CAPABILITY_MATRIX } from "../../entitlement/capability";
import { can, type PermissionHolder } from "../../authz/decide";
import type { AtlasClient, AtlasContext } from "../../agent/atlas/client";
import type { RunosClient, RunosContext } from "../../agent/runos/client";
import { runTurn, type TurnResult } from "../../agent/orchestrator/turn";
import type { PromptContext } from "../../agent/orchestrator/prompt";
import { AtlasError } from "../../agent/atlas/errors";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import { recordProposals, type CopilotContext } from "./service";
import { TASK_ID_MAX_LENGTH } from "../../agent/runos/types";
import type { AgentAction, SubjectType } from "./lib/action";
import type { SessionRecord } from "./store";

export interface TurnInput {
  question: string;
  /** Continue an existing session, or omit to open a new one. */
  sessionId?: string;
  subject?: { type: SubjectType; id: string; summary?: string };
  /** The member's access token, so downstream audits name a person. */
  subjectToken?: string;
  /** Platform tenant. Atlas hard-fails without one. */
  tenantId: string;
  /** True when the workspace has autopilot switched on. */
  autopilotActive?: boolean;
}

export interface TurnOutput {
  session: SessionRecord;
  answer: string;
  /** Written as `proposed`; nothing is executed here. */
  proposals: AgentAction[];
  /** Proposals the model produced that were NOT written, and why. */
  droppedProposals: number;
  invocations: TurnResult["invocations"];
  truncated: boolean;
}

export interface TurnDeps {
  atlasClient: AtlasClient;
  runosClient: RunosClient;
}

export async function runCopilotTurn(
  ctx: CopilotContext,
  input: TurnInput,
  deps: TurnDeps,
): Promise<RuleResult<TurnOutput>> {
  // 1. Gate before spending anything. Atlas meters every request.
  const gate = can(ctx.holder, ctx.entitlement, "copilot.ask", "data");
  if (!gate.allowed) return denied(gate);

  const question = input.question.trim();
  if (!question) return fail(violation("empty_question", "ask something", "question"));
  if (!input.tenantId) {
    return fail(violation("tenant_required", "the platform tenant is required to reach the model plane", "tenantId"));
  }

  // 2. Session and question first, so a model failure cannot lose the question.
  const session = input.sessionId
    ? await ctx.store.getSession(ctx.workspaceId, input.sessionId)
    : await ctx.store.createSession(ctx.workspaceId, {
        actorSub: ctx.sub,
        subjectType: input.subject?.type ?? null,
        subjectId: input.subject?.id ?? null,
        title: question.slice(0, 120),
      });
  if (!session) return fail(violation("not_found", `session ${input.sessionId} was not found`, "sessionId"));

  await ctx.store.appendMessage(ctx.workspaceId, {
    sessionId: session.id,
    role: "user",
    content: question,
  });

  const history = await ctx.store.listMessages(ctx.workspaceId, session.id);

  const prompt: PromptContext = {
    productName: "Yucer",
    permissions: [...ctx.holder.permissions],
    features: featureKeysOf(ctx.entitlement),
    subject: input.subject
      ? { type: input.subject.type, id: input.subject.id, summary: input.subject.summary }
      : undefined,
    autopilotActive: input.autopilotActive,
  };

  const atlas: AtlasContext = {
    workspaceId: ctx.workspaceId,
    tenantId: input.tenantId,
    subjectToken: input.subjectToken,
    applicationId: session.id,
    requestId: `${session.id}:${history.length}`,
  };
  const runos: RunosContext = {
    workspaceId: ctx.workspaceId,
    tenantId: input.tenantId,
    subjectToken: input.subjectToken,
    // Ties every capability call of this turn together. Bounded because Runos
    // rejects an over-long one outright.
    taskId: `${session.id}:${history.length}`.slice(0, TASK_ID_MAX_LENGTH),
    sessionId: session.id,
  };

  let turn: TurnResult;
  try {
    turn = await runTurn(
      {
        question,
        history: history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
        prompt,
        atlas,
        runos,
      },
      deps,
    );
  } catch (e) {
    // The model plane's own error code reaches the caller. "GRANT_DENIED" and
    // "the copilot is broken" need different responses from whoever reads this.
    if (e instanceof AtlasError) {
      return fail(violation(`atlas_${e.code}`, e.message, "model"));
    }
    return fail(violation("turn_failed", String(e), "model"));
  }

  await ctx.store.appendMessage(ctx.workspaceId, {
    sessionId: session.id,
    role: "assistant",
    content: turn.answer,
  });

  // 3. Proposals are gated again. A workspace on copilot.ask alone gets the
  // answer and none of the proposals, even if the model produced them.
  let written: AgentAction[] = [];
  let dropped = turn.proposals.length;
  if (turn.proposals.length > 0) {
    const recorded = await recordProposals(
      ctx,
      turn.proposals.map((p) => ({
        sessionId: session.id,
        actionType: p.actionType,
        subjectType: p.subjectType as SubjectType,
        subjectId: p.subjectId,
        payload: p.payload,
        rationale: p.rationale,
        confidence: p.confidence,
      })),
    );
    if (recorded.ok) {
      written = recorded.value;
      dropped = turn.proposals.length - written.length;
    }
  }

  return ok({
    session,
    answer: turn.answer,
    proposals: written,
    droppedProposals: dropped,
    invocations: turn.invocations,
    truncated: turn.truncated,
  });
}

/**
 * Feature keys the tier unlocks, for the prompt's "what this workspace bought"
 * line. Read off the matrix rather than re-derived - the product never invents a
 * commercial conclusion.
 */
function featureKeysOf(entitlement: Entitlement): string[] {
  if (entitlement.tier == null) return [];
  return [...CAPABILITY_MATRIX[entitlement.tier]];
}
