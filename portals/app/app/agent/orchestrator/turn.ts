import type { AtlasClient, AtlasContext } from "../atlas/client";
import type { ChatMessage, ToolCall } from "../atlas/types";
import { profileSettings, type CallProfile } from "../atlas/profiles";
import { AtlasError } from "../atlas/errors";
import { RERANK_MAX_CANDIDATES, selectEvidence, toRerankCandidate } from "../atlas/rerank";
import type { RunosClient, RunosContext } from "../runos/client";
import { RunosError } from "../runos/errors";
import { buildTurnMessages, estimateMessages, estimateTokens, fitTurnToWindow, type PromptContext } from "./prompt";
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
  /**
   * What the member actually asked, for choosing which follow-up notes to show
   * (rerank). Defaults to `question` - but a rehearsal's question carries a
   * long role-play frame in front, which would crowd the real words out of a
   * short query.
   */
  evidenceQuery?: string;
  /**
   * How every model call of this turn is made (agent/atlas/profiles.ts).
   * Defaults to "dialogue". One profile for the whole turn, tool rounds
   * included: which work reasons is the owner's ruling per capability
   * (2026-09-30), and a turn that escalated on its own would overrule it.
   */
  profile?: CallProfile;
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
  const profile: CallProfile = input.profile ?? "dialogue";
  const surface = await discoverTools(input, deps);

  // Which follow-up notes to show, when the customer has more than fit: by what
  // was asked, not just by recency. Floors at the old behaviour.
  input = { ...input, prompt: await withRankedEvidence(input, deps) };

  // Fitted to the route's context window when the catalog knows it; sent as
  // built when it does not (the behaviour before the catalog existed).
  const window = await contextBudget(profile, surface, input, deps);
  const fitted = window === null
    ? { ctx: input.prompt, history: [...(input.history ?? [])] }
    : fitTurnToWindow(input.prompt, input.history ?? [], input.question, window);
  let messages: ChatMessage[] = buildTurnMessages(fitted.ctx, fitted.history, input.question);
  let refitted = false;

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
    let res;
    try {
      res = await deps.atlasClient.chat(
        profile,
        { messages, tools: surface.definitions, toolChoice: "auto" },
        input.atlas,
      );
    } catch (e) {
      // The window was unknown, or the estimate low. Before any tool round,
      // cut the turn to half its size once and ask again; the member gets an
      // answer on less evidence (declared in the prompt) instead of an error.
      if (!refitted && rounds === 0 && e instanceof AtlasError && e.code === "CONTEXT_LENGTH_EXCEEDED") {
        refitted = true;
        const half = Math.floor(estimateMessages(messages) / 2);
        const again = fitTurnToWindow(fitted.ctx, fitted.history, input.question, half);
        messages = buildTurnMessages(again.ctx, again.history, input.question);
        continue;
      }
      throw e;
    }
    totalTokens += res.usage.totalTokens;

    const reply = res.message;
    if (reply.content) answer = reply.content;

    const calls = reply.toolCalls ?? [];
    if (calls.length === 0) break;

    // The reply goes back AS RECEIVED - its reasoning envelope included. A
    // reasoning model with tools requires the whole envelope on the next
    // round or the upstream answers 400 (types.ts, ReasoningEnvelope). Never
    // rebuild this message from its fields.
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
      const final = await deps.atlasClient.chat(profile, { messages }, input.atlas);
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

/** The newest notes are shown whatever they resemble: "where do we stand" lives
 *  in the latest of them. */
const EVIDENCE_NEWEST_ANCHOR = 4;

/**
 * When the evidence is a candidate pool (more notes than it shows), pick which
 * to show by relevance to the question, keeping the newest few. Any failure -
 * rerank off, slow, refused, unreadable - leaves the newest `keep`, which is
 * what the prompt showed before this existed. It never fails the turn.
 */
async function withRankedEvidence(input: TurnInput, deps: TurnDeps): Promise<PromptContext> {
  const evidence = input.prompt.evidence;
  if (!evidence || evidence.keep === undefined || evidence.notes.length <= evidence.keep) return input.prompt;
  const pool = evidence.notes.slice(0, RERANK_MAX_CANDIDATES);
  const scores = await deps.atlasClient
    .rerank?.(
      input.evidenceQuery ?? input.question,
      pool.map((n) => toRerankCandidate(n.id, n.rawNote)),
      input.atlas,
    )
    .catch(() => null);
  const { chosen } = selectEvidence(pool, scores ?? null, evidence.keep, EVIDENCE_NEWEST_ANCHOR);
  const { keep: _keep, ...rest } = evidence;
  return {
    ...input.prompt,
    evidence: { ...rest, notes: chosen, omittedNotes: evidence.omittedNotes + (evidence.notes.length - chosen.length) },
  };
}

/** Headroom kept off the window: the token estimate is an estimate. */
const WINDOW_SLACK = 0.1;

/** Prompt tokens a turn may use on this route, or null when the window is unknown. */
async function contextBudget(
  profile: CallProfile,
  surface: ToolSurface,
  input: TurnInput,
  deps: TurnDeps,
): Promise<number | null> {
  const route = await deps.atlasClient.routeFor?.(profile, input.atlas).catch(() => null);
  if (!route?.contextWindow) return null;
  const output = Math.min(profileSettings(profile).maxTokens, route.maxOutputTokens ?? Infinity);
  const tools = estimateTokens(JSON.stringify(surface.definitions));
  return Math.floor(route.contextWindow * (1 - WINDOW_SLACK)) - output - tools;
}
