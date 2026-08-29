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
import type {
  EvidenceGrounding,
  PlaybookGrounding,
  PromptContext,
} from "../../agent/orchestrator/prompt";
import { AtlasError } from "../../agent/atlas/errors";
import { fail, ok, violation, type RuleResult } from "../shared/result";
import { denied } from "../pipeline/service";
import { recordProposals, type CopilotContext } from "./service";
import { TASK_ID_MAX_LENGTH } from "../../agent/runos/types";
import type { AgentAction, SubjectType } from "./lib/action";
import type { PlaybookScope, SessionRecord } from "./store";

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
  /**
   * What has actually been recorded about the subject.
   *
   * Passed in rather than fetched here, and that is the gate story: it is
   * assembled by the account domain behind account.view, so a customer's
   * recorded words reach a model only through the same check a person reading
   * the page passes. A copilot that fetched it itself would be a second path to
   * the same data with its own opinion about who may see it.
   */
  evidence?: EvidenceGrounding;
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

  const playbooks = await selectPlaybooks(ctx, input.subject?.type);

  const prompt: PromptContext = {
    productName: "Yucer",
    permissions: [...ctx.holder.permissions],
    features: featureKeysOf(ctx.entitlement),
    playbooks,
    evidence: input.evidence,
    subject: input.subject
      ? { type: input.subject.type, id: input.subject.id, summary: input.subject.summary }
      : undefined,
    autopilotActive: input.autopilotActive,
  };

  // ONE task id, computed once, sent to BOTH planes.
  //
  // Atlas has required it since v0.15.0 and Runos has always taken it, and both
  // want the same value for the same reason: it is the only key that adds one
  // agent task's consumption back together across products and models. Deriving
  // it twice would eventually let the two derivations drift and silently split
  // a task's spend across two ledgers that cannot be summed.
  //
  // Bounded to Runos's limit because that is the tighter of the two - Atlas
  // allows 128, Runos rejects an over-long one outright.
  const taskId = `${session.id}:${history.length}`.slice(0, TASK_ID_MAX_LENGTH);

  const atlas: AtlasContext = {
    workspaceId: ctx.workspaceId,
    tenantId: input.tenantId,
    subjectToken: input.subjectToken,
    applicationId: session.id,
    requestId: `${session.id}:${history.length}`,
    taskId,
  };
  const runos: RunosContext = {
    workspaceId: ctx.workspaceId,
    tenantId: input.tenantId,
    subjectToken: input.subjectToken,
    taskId,
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
/**
 * Which plays ground this turn.
 *
 * Two constraints, both of which cost real money if ignored:
 *
 *   1. BOUNDED. Every playbook goes into the prompt of every turn it grounds,
 *      and prompt tokens are metered by Atlas. An unbounded catalog would make
 *      each question progressively more expensive as the workspace writes more
 *      plays - a cost that grows with adoption is the wrong shape.
 *   2. ACTIVE ONLY. A draft is someone thinking out loud and a retired play is
 *      advice the workspace has decided against. Grounding on either would have
 *      the agent quoting guidance nobody stands behind.
 *
 * Selection follows the session's subject: a conversation anchored to an
 * opportunity gets the pipeline plays. With no subject the copilot plays are
 * used, which is the domain that cuts across the other seven.
 */
export const MAX_PLAYBOOKS = 3;

const SUBJECT_TO_SCOPE: Record<string, PlaybookScope> = {
  account: "account",
  lead: "signal",
  opportunity: "pipeline",
  project: "delivery",
  campaign: "campaign",
  plan: "strategy",
};

async function selectPlaybooks(
  ctx: CopilotContext,
  subjectType: string | undefined,
): Promise<PlaybookGrounding[]> {
  const scope = subjectType ? SUBJECT_TO_SCOPE[subjectType] : undefined;
  try {
    const rows = await ctx.store.listPlaybooks(ctx.workspaceId, {
      scopeDomain: scope ?? "copilot",
      activeOnly: true,
      limit: MAX_PLAYBOOKS,
    });
    return rows.map((p) => ({
      playbookCode: p.playbookCode,
      name: p.name,
      scopeDomain: p.scopeDomain,
      content: p.content,
    }));
  } catch {
    // Grounding is an enhancement, not a precondition. A copilot that refuses
    // to answer because its play catalog is unreachable is worse than one that
    // answers without it.
    return [];
  }
}

function featureKeysOf(entitlement: Entitlement): string[] {
  if (entitlement.tier == null) return [];
  return [...CAPABILITY_MATRIX[entitlement.tier]];
}
