// Atlas data-plane wire types (Atlas interface contract, Part A section 3).
//
// Atlas is the L1 model platform and yucer's ONLY exit to an LLM. There is no
// provider SDK in this repo and no provider key: a model call that does not go
// through Atlas is unmetered, unquota'd and invisible to the platform, which is
// the whole reason the model plane exists.
//
// These types mirror the wire contract rather than wrapping it in product
// vocabulary, so a field added upstream can be threaded through without a
// translation layer having to be redesigned first.

export type ChatRole = "system" | "user" | "assistant" | "tool";

/**
 * A reasoning model's reasoning, as Atlas carries it (v0.7.5): an OPAQUE
 * envelope, not a piece of text.
 *
 * `text` is a readable projection for display only - it may be missing (some
 * providers never return one) and may be truncated. Every other key is the
 * provider's continuation material (Anthropic's `signature`, for one) and
 * MUST NOT be parsed or rebuilt.
 *
 * The obligation: when an assistant message that carried one goes back into a
 * later round of the same exchange, the WHOLE object goes back unchanged,
 * including keys this code does not recognise. Rebuilding it as
 * `{ text: m.reasoning.text }` drops the signature - invisible on DeepSeek, an
 * upstream 400 on Anthropic, reported on OUR side with no reason given.
 */
export type ReasoningEnvelope = { readonly text?: string } & Readonly<Record<string, unknown>>;

export interface ToolCall {
  id: string;
  name: string;
  /** Provider-shaped argument payload; Atlas passes it through untouched. */
  arguments: Record<string, unknown> | string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** assistant: tool calls raised in this turn. */
  toolCalls?: ToolCall[];
  /** tool: the id of the toolCall being answered. */
  toolCallId?: string;
  /** tool: the tool name, which some providers require. */
  name?: string;
  /** assistant: the reasoning envelope, returned as received. See ReasoningEnvelope. */
  reasoning?: ReasoningEnvelope;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

export type ToolChoice = "auto" | "none" | "required" | { name: string };

export type ApplicationType = "agent" | "product" | "job";

/**
 * Atlas stores taskId in a varchar(128) verbatim, with no transformation.
 *
 * yucer bounds to Runos's tighter limit wherever one value serves both planes,
 * so this constant exists for the paths that talk only to Atlas.
 */
export const ATLAS_TASK_ID_MAX = 128;

export interface ChatRequest {
  messages: ChatMessage[];
  /**
   * MANDATORY since Atlas v0.15.0. Without it every call is
   * `400 TASK_ID_REQUIRED`, retryable:false - it fails on the first attempt.
   *
   * Any stable string, <= 128 chars, stored verbatim. Its purpose is joining:
   * one agent task that crosses products and models must send the SAME value,
   * because that is the only key that adds a task's consumption back together.
   *
   * yucer sends the same string it sends Runos, deliberately. Mailing the join
   * key to one plane and withholding it from the other leaves a task's spend
   * split across two ledgers that cannot be summed - which is the exact thing
   * the field exists to prevent.
   */
  taskId: string;
  /**
   * Routing. Exactly one is needed; more is allowed and the most specific wins
   * (modelCode > endpointCode > taskProfile).
   *
   * yucer always sends endpointCode. modelCode pins the product to one model,
   * which means an operator re-pointing a stable capability at a better model
   * cannot reach us - and it forfeits the endpoint's fallback chain, since the
   * fallback belongs to the endpoint, not to the model. taskProfile is retiring
   * with the old per-tenant authorization axis and must not be used by new
   * integrations.
   */
  endpointCode?: string;
  modelCode?: string;
  /** Redundant when the token carries tenant_id, which always wins. Sent anyway
   * because a token minted without it would otherwise 400 at the far end. */
  tenantId?: string;
  stream?: boolean;
  /**
   * Whether the model reasons (Atlas v0.7.8, ADR-009 there). Absent means the
   * upstream default, which for the current reasoning models is ON - slow and
   * expensive. yucer always sends it; the value comes from the call profile
   * (profiles.ts). A route whose primary model cannot honour the mode answers
   * 422 THINKING_MODE_UNSUPPORTED without calling upstream.
   */
  thinking?: "off" | "on";
  /**
   * The whole call's budget, 1000-600000 ms, primary and fallbacks together.
   * On expiry Atlas cancels upstream and answers 504 DEADLINE_EXCEEDED.
   */
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  /** Agent instance id; becomes the default metering grouping axis. */
  applicationId?: string;
  applicationType?: ApplicationType;
  /** Overridden by the token's `sub` whenever the token has one. */
  userId?: string;
  /** Worth always sending: an operator can find this exact call by it. */
  requestId?: string;
  featureId?: string;
  businessId?: string;
}

export interface TokenUsage {
  /** ALL the input, on every provider (Atlas v0.7.13): uncached, cache reads and
   *  cache writes together. Before that a Claude route reported it WITHOUT the
   *  cache, so the same call read smaller there than anywhere else. */
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** The parts of promptTokens served from cache / written to cache (and the
   *  part of that written with a 1-hour TTL), and the part of completionTokens
   *  spent reasoning. Each is a SUBSET of its total, never added to it. A field
   *  that is absent was not reported by the upstream - it is NOT 0. */
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  cacheWrite1hInputTokens?: number;
  reasoningTokens?: number;
}

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter" | string;

export interface ChatResponse {
  id: string;
  /**
   * The model that actually served the call. When routing by endpointCode this
   * can differ from any model you named - that is a successful fallback, not an
   * anomaly, and it is the only place the difference is visible.
   */
  modelCode: string;
  message: ChatMessage;
  usage: TokenUsage;
  /** Total latency. Atlas exposes no TTFT, so this number is misleading for
   * streaming calls and should not be reported as time-to-first-token. */
  latencyMs: number;
  finishReason?: FinishReason;
  /** The mode actually used: "off" / "on", or null when none was sent. */
  thinking?: "off" | "on" | null;
}

// --- Streaming frames -------------------------------------------------------

export interface StreamTextFrame {
  type: "text";
  delta: string;
}
export interface StreamToolCallFrame {
  type: "tool_call";
  toolCall: ToolCall;
}
/** A reasoning fragment, for DISPLAY only - never assembled into an envelope
 *  (the done frame carries the complete one). A caller that wants only the
 *  answer ignores these. */
export interface StreamReasoningFrame {
  type: "reasoning";
  delta: string;
}
export interface StreamDoneFrame {
  type: "done";
  usage?: TokenUsage;
  finishReason?: FinishReason;
  /** The model that actually served, after any fallback. */
  modelCode?: string;
  thinking?: "off" | "on" | null;
  reasoning?: ReasoningEnvelope;
}
export interface StreamErrorFrame {
  type: "error";
  code: string;
  message: string;
  /**
   * Atlas's own verdict, carried on the frame since v0.15.0 - an SSE error
   * frame uses the same envelope as an HTTP error body. It is authoritative:
   * the gateway knows things a local code table does not, which is why the
   * Runos client has always preferred the far side's flag over its own class.
   */
  retryable?: boolean;
}

export type StreamFrame =
  | StreamTextFrame
  | StreamReasoningFrame
  | StreamToolCallFrame
  | StreamDoneFrame
  | StreamErrorFrame;
