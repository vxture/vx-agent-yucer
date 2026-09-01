// A streamed copilot turn.
//
// The reason this is a separate function rather than a flag on runCopilotTurn:
// streaming changes WHEN things happen, not what happens, and the ordering is
// the whole difficulty. A streamed turn must still end with exactly the same
// durable state as a non-streamed one - the question persisted, the answer
// persisted, the proposals written and gated - and it must do so even when the
// client disconnects halfway through reading.
//
// So the shape is: yield tokens as they arrive, accumulate, and persist in a
// finally block that runs whether the stream completed, errored, or was
// abandoned. A turn that streamed beautifully and lost its proposals is worse
// than one that never streamed.
//
// Tool calls are NOT streamed. The orchestrator's tool loop needs whole
// responses to decide whether to call again, so a turn that uses tools falls
// back to the non-streamed path and streams nothing. Pretending otherwise would
// mean emitting tokens from a draft the model then revises.

import type { Entitlement } from "../../entitlement/types";
import { can } from "../../authz/decide";
import type { AtlasClient, AtlasContext } from "../../agent/atlas/client";
import { AtlasError } from "../../agent/atlas/errors";
import { ATLAS_TASK_ID_MAX, type ChatMessage } from "../../agent/atlas/types";
import { buildTurnMessages, type PromptContext } from "../../agent/orchestrator/prompt";
import { CAPABILITY_MATRIX } from "../../entitlement/capability";
import { PROPOSE_ACTION_TOOL } from "../../agent/orchestrator/tools";
import { recordAuditEvent } from "../../audit/lib/record";
import type { CopilotContext } from "./service";
import type { SessionRecord } from "./store";

export interface StreamTurnInput {
  question: string;
  sessionId?: string;
  tenantId: string;
  subjectToken?: string;
  autopilotActive?: boolean;
}

export type StreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "done"; answer: string }
  | { type: "error"; code: string; message: string };

export interface StreamDeps {
  atlasClient: AtlasClient;
}

/**
 * Stream a turn. Yields events for the caller to forward to the browser.
 *
 * The persistence contract is the same as the non-streamed path:
 *   - the question is written BEFORE the model is called, so a failure cannot
 *     lose it;
 *   - whatever the model produced is written in a finally block, so an
 *     abandoned stream still leaves a transcript.
 *
 * No proposals are produced here: this path does not offer the propose_action
 * tool, because a proposal arriving mid-stream would have to be written before
 * the member has seen the sentence explaining it. A member who wants proposals
 * gets them from the non-streamed turn, which is what the UI uses when the
 * workspace has copilot.suggest.
 */
export async function* streamCopilotTurn(
  ctx: CopilotContext,
  input: StreamTurnInput,
  deps: StreamDeps,
): AsyncGenerator<StreamEvent, void, void> {
  const gate = can(ctx.holder, ctx.entitlement, "copilot.ask", "data");
  if (!gate.allowed) {
    // L1 X-3: same denial record the non-streamed path writes - see
    // turn-service.ts. No session exists yet, so the turn attempt is the
    // object.
    await recordAuditEvent({
      workspaceId: ctx.workspaceId,
      actorId: ctx.sub,
      objectType: "copilot_turn",
      objectId: input.sessionId ?? "new",
      action: "copilot.ask",
      outcome: "denied",
    });
    yield { type: "error", code: gate.reason ?? "denied", message: "not permitted" };
    return;
  }

  const question = input.question.trim();
  if (!question) {
    yield { type: "error", code: "empty_question", message: "ask something" };
    return;
  }
  if (!input.tenantId) {
    yield { type: "error", code: "tenant_required", message: "no active tenant" };
    return;
  }

  const session: SessionRecord | null = input.sessionId
    ? await ctx.store.getSession(ctx.workspaceId, input.sessionId)
    : await ctx.store.createSession(ctx.workspaceId, {
        actorSub: ctx.sub,
        title: question.slice(0, 120),
      });
  if (!session) {
    yield { type: "error", code: "not_found", message: "session not found" };
    return;
  }
  yield { type: "session", sessionId: session.id };

  // Before the model. A failure downstream must not lose the question.
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
    autopilotActive: input.autopilotActive,
  };
  const messages: ChatMessage[] = buildTurnMessages(
    prompt,
    history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
    question,
  );

  const atlas: AtlasContext = {
    workspaceId: ctx.workspaceId,
    tenantId: input.tenantId,
    subjectToken: input.subjectToken,
    applicationId: session.id,
    requestId: `${session.id}:${history.length}:stream`,
    // Mandatory since Atlas v0.15.0. Deliberately WITHOUT the ":stream" suffix
    // that requestId carries: requestId identifies one HTTP call, taskId
    // identifies the agent task, and a streamed answer is the same task as the
    // non-streamed one. Suffixing it would split one task's spend in two.
    taskId: `${session.id}:${history.length}`.slice(0, ATLAS_TASK_ID_MAX),
  };

  let answer = "";
  let failure: { code: string; message: string } | null = null;
  let totalTokens = 0;

  try {
    for await (const frame of deps.atlasClient.chatStream("chat", { messages }, atlas)) {
      if (frame.type === "text") {
        answer += frame.delta;
        yield { type: "delta", text: frame.delta };
      } else if (frame.type === "done" && frame.usage) {
        totalTokens = frame.usage.totalTokens;
      }
      // tool_call frames cannot occur - no tools are offered on this path - but
      // if the model emits one anyway it is ignored rather than half-applied.
    }
  } catch (e) {
    // A mid-stream error frame arrives here as a throw, which is why the Atlas
    // client converts it: the HTTP status was already 200 and a status-only
    // reader would have called this a success.
    failure =
      e instanceof AtlasError
        ? { code: `atlas_${e.code}`, message: e.message }
        : { code: "turn_failed", message: String(e) };
  } finally {
    // Runs on completion, on error, and when the consumer abandons the
    // generator. Whatever the model actually produced is durable either way -
    // a partial answer the member read must not vanish from the transcript.
    if (answer.length > 0) {
      await ctx.store.appendMessage(ctx.workspaceId, {
        sessionId: session.id,
        role: "assistant",
        content: answer,
      });
    }
  }

  await recordAuditEvent({
    workspaceId: ctx.workspaceId,
    actorId: ctx.sub,
    objectType: "copilot_turn",
    objectId: session.id,
    action: "copilot.ask",
    outcome: failure ? "error" : "success",
    taskId: atlas.taskId,
    // Atlas omits usage on some stream shapes (see AtlasClient.chatStream's
    // own contract note); a run that never sent a done-with-usage frame
    // reports no cost rather than a fabricated zero.
    costAmount: totalTokens > 0 ? totalTokens : undefined,
    costUnit: totalTokens > 0 ? "tokens" : undefined,
  });

  if (failure) {
    yield { type: "error", code: failure.code, message: failure.message };
    return;
  }
  yield { type: "done", answer };
}

/** Whether a turn should stream at all. */
export function shouldStream(entitlement: Entitlement, holder: { permissions: ReadonlySet<string> }): boolean {
  // A workspace with copilot.suggest wants proposals, and proposals need the
  // tool loop, which needs whole responses. Streaming such a turn would show
  // tokens from a draft the model then revises once tools answer.
  const suggest = can(
    holder as never,
    entitlement,
    "copilot.suggest",
    "data",
  );
  return !suggest.allowed;
}

function featureKeysOf(entitlement: Entitlement): string[] {
  if (entitlement.tier == null) return [];
  return [...CAPABILITY_MATRIX[entitlement.tier]];
}

/** The tool the streamed path deliberately does NOT offer, exported so the
 * decision is greppable rather than implied by an absence. */
export const STREAMING_OMITS_TOOL = PROPOSE_ACTION_TOOL.name;
