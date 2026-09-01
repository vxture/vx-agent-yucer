import type { AtlasClient, AtlasContext } from "../atlas/client";
import type { ChatMessage, ToolCall } from "../atlas/types";
import type { RunosClient, RunosContext } from "../runos/client";
import { RunosError } from "../runos/errors";
import { buildTurnMessages, type PromptContext } from "./prompt";
import {
  PROPOSE_ACTION_TOOL_NAME,
  buildToolSurface,
  readProposalDraft,
  type ProposalDraft,
  type ToolSurface,
} from "./tools";

// One copilot turn: a member's question in, an answer plus zero or more
// PROPOSALS out.
//
// The loop's contract with the rest of the product is narrow on purpose:
//
//   - It returns proposals. It never writes a domain row. The caller persists
//     the proposals as agent_action rows in `proposed` state, and a human
//     decides (domains/copilot/lib/action.ts).
//   - It calls read-risk capabilities directly and refuses everything else,
//     because a capability that changes something is a write, and every agent
//     write is a proposal first (ADR-003 + ADR-004).
//   - It is bounded. A model that keeps calling tools stops at maxToolRounds
//     with whatever it has, rather than looping against a metered plane.

export interface TurnInput {
  question: string;
  history?: readonly ChatMessage[];
  prompt: PromptContext;
  atlas: AtlasContext;
  runos: RunosContext;
  /** Semantic query used to pull candidate capabilities. Defaults to the question. */
  capabilityQuery?: string;
  maxToolRounds?: number;
}

export interface ToolInvocation {
  toolName: string;
  capabilityId: string;
  operation: string;
  ok: boolean;
  callId?: string;
  errorCode?: string;
  /**
   * The version the gateway actually served (TD-004). "stable" is a FLOATING
   * alias: an operator can repoint it and the same conversation would silently
   * change behaviour mid-turn. Recording what was served is what makes
   * "yesterday this worked" answerable; pinning below is what stops it
   * changing between two calls of one turn.
   */
  versionResolved?: string;
}

export interface TurnResult {
  /** What to show the member, and to append as an assistant message. */
  answer: string;
  /** To be persisted as agent_action rows in `proposed`. Never applied here. */
  proposals: ProposalDraft[];
  /** Read-only capability calls actually made, for the audit trail. */
  invocations: ToolInvocation[];
  /** Capabilities withheld from direct call because they change something. */
  proposalOnlyCapabilities: string[];
  toolRounds: number;
  /** True when the loop stopped on the round limit rather than on an answer. */
  truncated: boolean;
  /**
   * Summed across every Atlas chat call this turn made (the initial call, each
   * tool round, and the truncation-branch final call). This is the turn's
   * whole cost, not one call's - L1 X-3 wants one audit record per turn, and
   * `costAmount` on that record needs the total, not the last call's figure.
   */
  totalTokens: number;
}

export interface TurnDeps {
  atlasClient: AtlasClient;
  runosClient: RunosClient;
}

const DEFAULT_MAX_TOOL_ROUNDS = 4;

export async function runTurn(input: TurnInput, deps: TurnDeps): Promise<TurnResult> {
  const maxRounds = input.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const surface = await discoverTools(input, deps);

  const messages: ChatMessage[] = buildTurnMessages(
    input.prompt,
    input.history ?? [],
    input.question,
  );

  const proposals: ProposalDraft[] = [];
  const invocations: ToolInvocation[] = [];
  // What the gateway served per capability, learned from the first call and
  // handed back on every later one (TD-004). "stable" is a floating alias an
  // operator can repoint at any moment; without this pin, two calls to one
  // capability inside ONE turn could run different versions and nothing would
  // say so. First call floats by design - the pin freezes a turn, it does not
  // freeze the product.
  const pinnedVersions = new Map<string, string>();
  let answer = "";
  let rounds = 0;
  let truncated = false;
  let totalTokens = 0;

  for (;;) {
    const res = await deps.atlasClient.chat(
      // The proposing task, not the chat task: a proposal is read by a human who
      // then signs for it, so it carries the reasoning load.
      proposals.length > 0 || rounds > 0 ? "propose" : "chat",
      { messages, tools: surface.definitions, toolChoice: "auto" },
      input.atlas,
    );
    totalTokens += res.usage.totalTokens;

    const reply = res.message;
    if (reply.content) answer = reply.content;

    const calls = reply.toolCalls ?? [];
    if (calls.length === 0) break;

    messages.push(reply);

    if (rounds >= maxRounds) {
      // Stop calling tools but let the model produce a final answer from what it
      // already has, so the member gets something rather than a dangling turn.
      truncated = true;
      messages.push({
        role: "user",
        content:
          "Tool budget for this turn is spent. Answer with what you already have, and say what you could not check.",
      });
      const final = await deps.atlasClient.chat("propose", { messages }, input.atlas);
      totalTokens += final.usage.totalTokens;
      if (final.message.content) answer = final.message.content;
      break;
    }

    rounds += 1;
    for (const call of calls) {
      const outcome = await handleToolCall(call, surface, input, deps, proposals, pinnedVersions);
      if (outcome.invocation) invocations.push(outcome.invocation);
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: outcome.content,
      });
    }
  }

  return {
    answer,
    proposals,
    invocations,
    proposalOnlyCapabilities: [...new Set(surface.proposalOnly.map((b) => b.capabilityId))],
    toolRounds: rounds,
    truncated,
    totalTokens,
  };
}

/**
 * Ask Runos what this product is entitled to for the question at hand.
 *
 * An empty catalog is normal, not a fault: the production catalog starts empty,
 * and a capability reachable only as a skill dependency is never searchable. A
 * discovery failure is also non-fatal - the copilot can still answer questions
 * and propose changes with no capabilities at all.
 */
async function discoverTools(input: TurnInput, deps: TurnDeps): Promise<ToolSurface> {
  try {
    const capabilities = await deps.runosClient.discover(
      { query: input.capabilityQuery ?? input.question, limit: 20 },
      input.runos,
    );
    return buildToolSurface(capabilities);
  } catch {
    return buildToolSurface([]);
  }
}

interface ToolOutcome {
  content: string;
  invocation?: ToolInvocation;
}

async function handleToolCall(
  call: ToolCall,
  surface: ToolSurface,
  input: TurnInput,
  deps: TurnDeps,
  proposals: ProposalDraft[],
  pinnedVersions: Map<string, string>,
): Promise<ToolOutcome> {
  const args = parseArgs(call.arguments);

  if (call.name === PROPOSE_ACTION_TOOL_NAME) {
    const draft = readProposalDraft(args);
    if (!draft) {
      // Tell the model what was wrong and let it retry rather than failing the
      // turn: a malformed tool call is a recoverable mistake.
      return {
        content: JSON.stringify({
          ok: false,
          error:
            "invalid proposal: action_type, subject_id and rationale are required, and subject_type must be one of account, lead, opportunity, project, campaign, plan",
        }),
      };
    }
    proposals.push(draft);
    return {
      content: JSON.stringify({
        ok: true,
        recorded: "proposal",
        note: "Recorded for human review. Nothing has been changed yet.",
      }),
    };
  }

  const binding = surface.bindings.get(call.name);
  if (!binding) {
    // Either a hallucinated tool or one deliberately withheld for being a write.
    const withheld = surface.proposalOnly.find((b) => b.toolName === call.name);
    return {
      content: JSON.stringify({
        ok: false,
        error: withheld
          ? `${binding_label(withheld.capabilityId, withheld.operation)} changes data, so it cannot be called directly. Use ${PROPOSE_ACTION_TOOL_NAME} to propose it.`
          : `unknown tool ${call.name}`,
      }),
    };
  }

  try {
    const pinned = pinnedVersions.get(binding.capabilityId);
    const result = await deps.runosClient.invoke(
      {
        capability_id: binding.capabilityId,
        operation: binding.operation,
        arguments: args,
        ...(pinned ? { version: pinned } : {}),
      },
      input.runos,
    );
    const versionResolved =
      typeof result.meta.version_resolved === "string" ? result.meta.version_resolved : undefined;
    if (versionResolved && !pinned) pinnedVersions.set(binding.capabilityId, versionResolved);
    return {
      content: JSON.stringify({ ok: true, result: result.structured ?? textOf(result.content) }),
      invocation: {
        toolName: call.name,
        capabilityId: binding.capabilityId,
        operation: binding.operation,
        ok: true,
        callId: typeof result.meta.call_id === "string" ? result.meta.call_id : undefined,
        versionResolved,
      },
    };
  } catch (e) {
    const err = e instanceof RunosError ? e : null;
    return {
      // The model is told plainly that the call failed, so it reports a gap
      // instead of inventing the answer it wanted.
      content: JSON.stringify({
        ok: false,
        error: err ? `${err.errorClass}/${err.errorCode}: ${err.message}` : String(e),
        retryable: err?.retryable ?? false,
      }),
      invocation: {
        toolName: call.name,
        capabilityId: binding.capabilityId,
        operation: binding.operation,
        ok: false,
        callId: err?.callId,
        errorCode: err?.errorCode,
      },
    };
  }
}

function binding_label(capabilityId: string, operation: string): string {
  return `${capabilityId}.${operation}`;
}

function parseArgs(raw: ToolCall["arguments"]): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}
