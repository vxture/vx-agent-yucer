import { mintS2SToken, type FetchLike } from "../../platform/s2s";
import { RunosError, parseToolError, transportError } from "./errors";
import {
  TASK_ID_MAX_LENGTH,
  type CallMeta,
  type DiscoverArgs,
  type DiscoveredCapability,
  type InvokeArgs,
  type InvokeResult,
  type ReportOutcomeArgs,
  type ResolvedCapability,
  type VersionRef,
} from "./types";

/** Env reader shape. Matches lib/status.ts rather than NodeJS.ProcessEnv:
 * once next-env.d.ts is generated ProcessEnv requires NODE_ENV, so a caller
 * passing a small literal for a test would stop type-checking. These readers
 * only ever look up named keys. */
type EnvLike = Record<string, string | undefined>;

// Runos capability-plane client: MCP streamable HTTP over a single route.
//
// The whole agent-facing surface is FOUR fixed tools on one endpoint. There is
// no per-capability tool registration and no private SDK - any standard MCP
// client is a complete client, and this file is only the small amount of glue
// that carries yucer's call context and turns Runos's two error layers into
// exceptions.
//
//   discover -> what exists that I am entitled to?   (no schemas)
//   resolve  -> the full contract for one of them     (schemas here)
//   invoke   -> do it (or, for a skill, fetch it)
//   report   -> how did the task end?                 (fire and forget)

export interface RunosConfig {
  baseUrl: string;
  /** Path of the MCP route. Configurable because the base URL is deployment-set. */
  mcpPath: string;
  timeoutMs: number;
  enabled: boolean;
  agentVersion?: string;
}

export interface RunosContext {
  workspaceId: string;
  tenantId: string;
  /** Present when a member is behind the call -> OBO ticket. */
  subjectToken?: string;
  /** Ties every call of one task together. Mandatory upstream. */
  taskId: string;
  sessionId?: string;
  /**
   * Object-level authorization credential.
   *
   * RUNOS DOES ADJUDICATE ON IT. This comment used to say the opposite, and
   * that was true of an earlier contract: the platform has since specified a
   * platform-issued RS256 JWT whose iss / aud / exp / sub are all verified, and
   * verification is stage 5 of the invoke pipeline - ABOVE the audit boundary,
   * so a rejection produces `caller_error / invalid_delegation` with no call_id
   * and no audit row at all.
   *
   * yucer still only forwards a value it was handed and never constructs one.
   * What remains undecided is narrower than it was: which yucer session
   * identity becomes `sub`, and who mints it. See ADR-004.
   */
  delegationToken?: string;
}

export function getRunosConfig(env: EnvLike = process.env): RunosConfig {
  const baseUrl = (env.RUNOS_BASE_URL ?? "").replace(/\/$/, "");
  return {
    baseUrl,
    mcpPath: env.RUNOS_MCP_PATH ?? "/v1/mcp",
    timeoutMs: Number(env.RUNOS_TIMEOUT_MS ?? 60_000),
    enabled: Boolean(baseUrl),
    agentVersion: env.RUNOS_AGENT_VERSION,
  };
}

export interface RunosDeps {
  fetchImpl?: FetchLike;
  mintToken?: typeof mintS2SToken;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: {
    content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
    /**
     * Where the gateway's metadata actually lives - as a FLAT `_meta_vxture`
     * key inside this object, beside the capability's own payload.
     *
     * yucer previously read `result._meta.vxture`, a nested shape taken from a
     * superseded revision of the interface reference. That key is never
     * present, so the metadata was always empty and four things failed at once
     * and silently: every skill fetch threw (result_kind defaulted to
     * "executed"), content_digest was never verified, version_resolved fell
     * back to whatever was requested, and call_id was never captured - so
     * yucer's invocation log could not be joined to Runos's audit trail at all.
     */
    structuredContent?: unknown;
    isError?: boolean;
    _meta?: Record<string, unknown>;
  };
  error?: { code: number; message: string; data?: unknown };
}

/** The gateway's key inside structuredContent. */
const META_KEY = "_meta_vxture";

/**
 * Split the gateway's metadata from the capability's payload.
 *
 * They are SIBLINGS for a normal capability - `structuredContent` is the
 * payload with `_meta_vxture` mixed in beside it - so the split has to happen
 * here rather than at the call site. Without it the orchestrator hands
 * `structuredContent` straight to the model, and `call_id` / `version_resolved`
 * arrive in the tool result as if they were part of the capability's answer.
 * Plumbing in the model's context is not harmless: it is unexplained tokens
 * that look like data.
 */
function splitMeta(structuredContent: unknown): {
  payload: unknown;
  meta: Record<string, unknown>;
} {
  if (typeof structuredContent !== "object" || structuredContent === null || Array.isArray(structuredContent)) {
    return { payload: structuredContent, meta: {} };
  }
  const { [META_KEY]: raw, ...payload } = structuredContent as Record<string, unknown>;
  const meta = typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  // A skill distribution carries ONLY the metadata, so the remainder is {} -
  // returned as undefined so a caller does not render an empty object as an
  // answer.
  const keys = Object.keys(payload);
  return { payload: keys.length === 0 ? undefined : payload, meta };
}

export class RunosClient {
  private readonly fetchImpl: FetchLike;
  private readonly mint: typeof mintS2SToken;
  private rpcId = 0;

  constructor(
    private readonly cfg: RunosConfig = getRunosConfig(),
    deps: RunosDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.mint = deps.mintToken ?? mintS2SToken;
  }

  /**
   * Semantic search over the catalog, already filtered by what this product is
   * entitled to - an unauthorized capability simply does not appear.
   *
   * Only DIRECT grants are searchable. A capability reached as a skill's
   * required dependency is resolvable and invocable but will never show up
   * here, so an empty result is not proof that a dependency is unavailable.
   */
  async discover(args: DiscoverArgs, ctx: RunosContext): Promise<DiscoveredCapability[]> {
    const result = await this.callTool("runos_discover", args, ctx);
    const payload = this.structured<{ capabilities?: DiscoveredCapability[] }>(result);
    return payload?.capabilities ?? [];
  }

  /**
   * Full contract for one capability, including input/output schemas.
   *
   * TD-004 notes, both of which are the CONSUMER's problem, not the gateway's:
   *
   * "latest" can move BACKWARDS. Runos has not ruled on the semantics of
   * registering 2.0.0 and then adding 1.0.1, so "latest" is not merely
   * floating, it is unordered. Nothing in this repo passes it; anything that
   * starts to should pin the returned `version` immediately.
   *
   * A deprecated capability still resolves. The lifecycle lives in `state`,
   * and a consumer that never reads it will keep building on something already
   * scheduled to go away - the warning below is the only place the signal
   * surfaces in this repo today.
   */
  async resolve(
    capabilityId: string,
    ctx: RunosContext,
    version: VersionRef = "stable",
  ): Promise<ResolvedCapability> {
    const result = await this.callTool("runos_resolve", { capability_id: capabilityId, version }, ctx);
    const payload = this.structured<ResolvedCapability>(result);
    if (!payload) {
      throw new RunosError({
        errorClass: "gateway_error",
        errorCode: "contract_violation",
        message: `runos_resolve returned no contract for ${capabilityId}`,
        retryable: false,
      });
    }
    if (typeof payload.state === "string" && /deprecat/i.test(payload.state)) {
      console.warn(
        `[runos] ${capabilityId} resolved to ${payload.version} with state "${payload.state}" - ` +
          `this capability is on its way out; plan the migration before it stops resolving`,
      );
    }
    return payload;
  }

  /**
   * Invoke an operation. Arguments are validated against the registered
   * inputSchema before anything leaves Runos, and the response against the
   * outputSchema before it comes back.
   *
   * `skillContext` is attribution only. It records that this call was made while
   * following a fetched skill; it never widens what the call is allowed to do.
   */
  async invoke(
    args: InvokeArgs,
    ctx: RunosContext,
    skillContext?: CallMeta["skill_context"],
  ): Promise<InvokeResult> {
    const result = await this.callTool("runos_invoke", args, ctx, skillContext);
    const { payload, meta } = splitMeta(result.structuredContent);
    return {
      content: result.content ?? [],
      // The capability's payload with the gateway's metadata removed.
      structured: payload,
      meta,
    };
  }

  /**
   * Task-level feedback. A pure assertion layer: Runos does not verify it, a
   * later report for the same task_id supersedes the earlier one on read, and
   * both rows are kept. Fire and forget, so a failure here is swallowed - losing
   * a feedback row must never fail the work the agent already did.
   */
  async reportOutcome(args: ReportOutcomeArgs, ctx: RunosContext): Promise<boolean> {
    try {
      await this.callTool("runos_report_outcome", args, ctx);
      return true;
    } catch {
      return false;
    }
  }

  private structured<T>(result: NonNullable<JsonRpcResponse["result"]>): T | null {
    if (result.structuredContent !== undefined) return result.structuredContent as T;
    // Some MCP servers carry the payload as a JSON text block instead of
    // structuredContent. Accepting both keeps this working across server
    // versions rather than failing on a cosmetic difference.
    const text = result.content?.find((c) => c.type === "text")?.text;
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  // Generic over the argument type rather than taking Record<string, unknown>:
  // the tool argument types are interfaces, and an interface has no index
  // signature, so it is not assignable to Record<string, unknown>. Widening the
  // callers to Record would throw away the very typing that keeps a tool call
  // shaped correctly.
  private async callTool<A extends object>(
    name: string,
    args: A,
    ctx: RunosContext,
    skillContext?: CallMeta["skill_context"],
  ): Promise<NonNullable<JsonRpcResponse["result"]>> {
    if (!this.cfg.enabled) {
      throw new RunosError({
        errorClass: "gateway_error",
        errorCode: "contract_violation",
        message: "RUNOS_BASE_URL is not set; the capability plane is unreachable",
        retryable: false,
      });
    }
    // Checked locally as well as upstream: a missing or over-long task_id costs
    // a round trip to learn, and the fix is always on this side.
    if (!ctx.taskId || ctx.taskId.length > TASK_ID_MAX_LENGTH) {
      throw new RunosError({
        errorClass: "caller_error",
        errorCode: "missing_metadata",
        message: `task_id must be 1..${TASK_ID_MAX_LENGTH} characters (got ${ctx.taskId?.length ?? 0})`,
        retryable: false,
      });
    }

    const meta: CallMeta = {
      task_id: ctx.taskId,
      ...(this.cfg.agentVersion ? { agent_version: this.cfg.agentVersion } : {}),
      ...(ctx.sessionId ? { session_id: ctx.sessionId } : {}),
      ...(ctx.delegationToken ? { delegation_token: ctx.delegationToken } : {}),
      ...(skillContext ? { skill_context: skillContext } : {}),
    };

    const token = await this.mint({
      audience: "runos",
      mode: ctx.subjectToken ? "obo" : "service",
      workspaceId: ctx.workspaceId,
      tenantId: ctx.tenantId,
      subjectToken: ctx.subjectToken,
    });

    this.rpcId += 1;
    const payload = {
      jsonrpc: "2.0" as const,
      id: this.rpcId,
      method: "tools/call",
      params: { name, arguments: args, _meta: { vxture: meta } },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    (timer as { unref?: () => void }).unref?.();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.baseUrl}${this.cfg.mcpPath}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      throw new RunosError({
        errorClass: "gateway_timeout",
        errorCode: "provider_unavailable",
        message: `runos unreachable: ${String(e)}`,
        retryable: true,
      });
    }
    // Deliberately NOT cleared here. The response resolves on HEADERS, and the
    // JSON-RPC body is read below - clearing now would leave that read
    // unbounded, so a gateway that answers and then stalls would hang the tool
    // call forever. Firing after the body is consumed is a no-op.

    // Layer 1: protocol / authentication. The call was never accepted.
    if (!res.ok) throw transportError(res.status, await safeJson(res));

    const body = (await safeJson(res)) as JsonRpcResponse | null;
    if (!body) {
      throw new RunosError({
        errorClass: "gateway_error",
        errorCode: "contract_violation",
        message: "runos returned an empty body",
        retryable: true,
      });
    }
    if (body.error) {
      throw new RunosError({
        errorClass: "gateway_error",
        errorCode: "contract_violation",
        message: `jsonrpc error ${body.error.code}: ${body.error.message}`,
        retryable: false,
        raw: body.error,
      });
    }
    if (!body.result) {
      throw new RunosError({
        errorClass: "gateway_error",
        errorCode: "contract_violation",
        message: "runos returned neither result nor error",
        retryable: true,
        raw: body,
      });
    }

    // Layer 2: execution failure. HTTP was 200 - the call was accepted and then
    // failed - so the verdict lives inside the tool result.
    if (body.result.isError) {
      const text = body.result.content?.find((c) => c.type === "text")?.text ?? "";
      throw parseToolError(text, body.result);
    }

    return body.result;
  }
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
