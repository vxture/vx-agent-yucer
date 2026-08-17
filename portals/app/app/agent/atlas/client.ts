import { mintS2SToken, type FetchLike } from "../../platform/s2s";
import { AtlasError, parseAtlasError, streamFrameError, type RetryPolicy } from "./errors";
import { endpointFor, type CopilotTask } from "./endpoints";
import type { ChatRequest, ChatResponse, StreamFrame } from "./types";

/** Env reader shape. Matches lib/status.ts rather than NodeJS.ProcessEnv:
 * once next-env.d.ts is generated ProcessEnv requires NODE_ENV, so a caller
 * passing a small literal for a test would stop type-checking. These readers
 * only ever look up named keys. */
type EnvLike = Record<string, string | undefined>;


// Atlas data-plane client. Every model call in yucer goes through here.
//
// Atlas lives on the tailnet only and atlas.vxture.com is reserved but unbound,
// so the base URL comes from deployment config and is never hardcoded.

export interface AtlasConfig {
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  enabled: boolean;
}

export interface AtlasContext {
  /** Both are mandatory upstream; s2s.ts refuses to mint a token without them. */
  workspaceId: string;
  tenantId: string;
  /** Present when a signed-in member is behind the call -> OBO mode. Absent for
   * background work (feed scoring, scheduled digests) -> service mode. */
  subjectToken?: string;
  /** Copied to applicationId, which is Atlas's default metering grouping axis. */
  applicationId?: string;
  /** Lets an operator find this exact call in /capability/logs?requestId=. */
  requestId?: string;
  /**
   * MANDATORY since Atlas v0.15.0 - a call without it is 400 TASK_ID_REQUIRED.
   *
   * Required rather than optional on purpose: making it optional would let a
   * new call site compile and then fail at runtime against production, which is
   * exactly how this defect reached main in the first place. The type is the
   * only place that can refuse it before a member does.
   */
  taskId: string;
}

export function getAtlasConfig(env: EnvLike = process.env): AtlasConfig {
  const baseUrl = (env.ATLAS_BASE_URL ?? "").replace(/\/$/, "");
  return {
    baseUrl,
    timeoutMs: Number(env.ATLAS_TIMEOUT_MS ?? 60_000),
    maxRetries: Number(env.ATLAS_MAX_RETRIES ?? 2),
    enabled: Boolean(baseUrl),
  };
}

export interface AtlasDeps {
  fetchImpl?: FetchLike;
  /** Injected so tests do not need an IdP. */
  mintToken?: typeof mintS2SToken;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AtlasClient {
  private readonly fetchImpl: FetchLike;
  private readonly mint: typeof mintS2SToken;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly cfg: AtlasConfig = getAtlasConfig(),
    deps: AtlasDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.mint = deps.mintToken ?? mintS2SToken;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  /** Non-streaming chat, with per-code retry. */
  async chat(task: CopilotTask, req: Omit<ChatRequest, "stream" | "taskId">, ctx: AtlasContext): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const { res, json } = await this.requestJson("POST", "/v1/chat", this.body(task, req, ctx, false), ctx);
      if (!res.ok) throw parseAtlasError(res.status, json);
      return json as ChatResponse;
    });
  }

  /**
   * Streaming chat. Yields frames in order and THROWS on an error frame.
   *
   * The contract's sharpest trap is here: once the response headers are out the
   * status is 200 forever, so a mid-stream failure arrives as a single
   * `type:"error"` frame followed by the stream closing. A consumer that trusts
   * the status code reads a truncated answer as a complete one. Turning the
   * frame into a throw makes that impossible to ignore.
   *
   * Not retried: bytes have already been handed to the caller, and replaying
   * would duplicate them. The caller decides whether to start over.
   */
  async *chatStream(
    task: CopilotTask,
    req: Omit<ChatRequest, "stream" | "taskId">,
    ctx: AtlasContext,
  ): AsyncGenerator<StreamFrame, void, void> {
    const { res, controller } = await this.postStreaming("/v1/chat", this.body(task, req, ctx, true), ctx);
    if (!res.ok) {
      // READ THEN ABORT, in that order. Aborting first errors the body, json()
      // swallows that into null, and parseAtlasError falls through to its
      // generic branch - so GRANT_DENIED, QUOTA_EXCEEDED and RATE_LIMITED all
      // collapse to a bare "403"/"429" with no message, no requestId and no
      // retryAfterMs. The refusal that tells an operator what to fix is the one
      // thing worth keeping from a failed call.
      const body = await this.json(res);
      controller.abort();
      throw parseAtlasError(res.status, body);
    }
    if (!res.body) {
      controller.abort();
      throw new AtlasError({ code: "EMPTY_STREAM", status: res.status, message: "atlas returned no stream body" });
    }

    // The controller is handed to parseSse, whose finally block aborts it. That
    // block runs on EVERY exit - the done sentinel, a thrown error frame, and
    // the .return() a consumer triggers by abandoning this generator - which is
    // what makes abandonment stop the upstream generation instead of merely
    // stopping our reading of it.
    for await (const frame of parseSse(res.body, { controller, idleMs: this.cfg.timeoutMs })) {
      if (frame.type === "error") {
        // Not every error frame ends the exchange. UPSTREAM_FRAME_UNPARSEABLE
        // is the one code Atlas documents as "the stream itself continues" - a
        // single malformed upstream frame. Throwing on it would discard a good
        // answer already in progress, the mirror of the bug the mid-stream
        // handling exists to prevent. parseSse already applies this reasoning
        // to its OWN parse failures; Atlas's equivalent signal gets it too.
        if (frame.code === "UPSTREAM_FRAME_UNPARSEABLE") continue;
        throw streamFrameError(frame.code, frame.message, frame.retryable);
      }
      yield frame;
      if (frame.type === "done") return;
    }
  }

  /**
   * Cheapest possible proof that the token works. A 200 here means every later
   * failure is an authorization or business problem, not a credential one.
   */
  async models(ctx: AtlasContext): Promise<unknown> {
    const { res, json } = await this.requestJson("GET", "/v1/models", undefined, ctx);
    if (!res.ok) throw parseAtlasError(res.status, json);
    return json;
  }

  /** Entitlement as Atlas sees it, scoped by the token rather than by a param. */
  async quotas(ctx: AtlasContext): Promise<unknown> {
    const { res, json } = await this.requestJson("GET", "/tenancy/quotas", undefined, ctx);
    if (!res.ok) throw parseAtlasError(res.status, json);
    return json;
  }

  private body(
    task: CopilotTask,
    req: Omit<ChatRequest, "stream" | "taskId">,
    ctx: AtlasContext,
    stream: boolean,
  ): ChatRequest {
    return {
      // Routing by endpoint, never by model - see endpoints.ts.
      endpointCode: req.endpointCode ?? endpointFor(task),
      tenantId: ctx.tenantId,
      applicationType: "agent",
      applicationId: ctx.applicationId,
      requestId: ctx.requestId,
      ...req,
      // AFTER the spread, not before. Mandatory since v0.15.0, and a caller
      // passing `taskId: undefined` would otherwise blank it and get a 400 -
      // the same latent trap the other defaults still carry.
      taskId: ctx.taskId,
      stream,
    };
  }

  /**
   * A streaming POST. The caller owns the returned controller and must abort it
   * when it stops reading.
   *
   * request()'s deadline covers reaching the far side and nothing more - the
   * response resolves when the HEADERS arrive. The body gets a per-frame idle
   * deadline instead, armed by parseSse, because a single overall budget would
   * cut off exactly the long answers worth waiting for.
   */
  private async postStreaming(
    path: string,
    body: unknown,
    ctx: AtlasContext,
  ): Promise<{ res: Response; controller: AbortController }> {
    const controller = new AbortController();
    const res = await this.request("POST", path, body, ctx, controller);
    return { res, controller };
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
    ctx: AtlasContext,
    /** Supplied by a streaming caller that outlives the headers. */
    externalController?: AbortController,
  ): Promise<Response> {
    if (!this.cfg.enabled) {
      throw new AtlasError({
        code: "ATLAS_NOT_CONFIGURED",
        status: 0,
        message: "ATLAS_BASE_URL is not set; the model plane is unreachable",
      });
    }
    const token = await this.mint({
      audience: "atlas",
      // A member behind the call gets an OBO ticket so the far-side audit names
      // a person; background work gets a service ticket.
      mode: ctx.subjectToken ? "obo" : "service",
      workspaceId: ctx.workspaceId,
      tenantId: ctx.tenantId,
      subjectToken: ctx.subjectToken,
    });

    const controller = externalController ?? new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      return await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      // This deadline covers reaching the far side, and nothing more: the
      // response resolves when the HEADERS arrive. Whoever reads the body owns
      // its deadline - requestJson() re-arms one around the read, and the
      // streaming path arms a per-frame idle timer instead.
      clearTimeout(timer);
    }
  }

  /**
   * A non-streaming call, with the body read under its OWN deadline.
   *
   * Without this, timeoutMs bounds only the connect phase and a server that
   * answers with headers and then dribbles forever hangs the call - the failure
   * that presents as "the copilot is thinking" and never ends.
   */
  private async requestJson(
    method: string,
    path: string,
    body: unknown,
    ctx: AtlasContext,
  ): Promise<{ res: Response; json: unknown }> {
    const controller = new AbortController();
    const res = await this.request(method, path, body, ctx, controller);

    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const json = await this.json(res);
      // json() is deliberately tolerant - it turns an unreadable body into null
      // so a non-JSON error envelope is still carried. That tolerance would
      // silently swallow a timeout, so the abort is checked explicitly and a
      // truncated read is reported as what it is.
      if (controller.signal.aborted) {
        throw new AtlasError({
          code: "BODY_TIMEOUT",
          status: res.status,
          message: `atlas did not finish sending within ${this.cfg.timeoutMs}ms`,
        });
      }
      return { res, json };
    } finally {
      clearTimeout(timer);
    }
  }

  private async json(res: Response): Promise<unknown> {
    const text = await res.text().catch(() => "");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      // One of the three envelopes is a bare framework exception; a non-JSON
      // body is still worth carrying rather than discarding.
      return { message: text };
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof AtlasError) || attempt >= this.cfg.maxRetries) throw e;
        const policy: RetryPolicy = e.retry;
        if (policy.kind === "no") throw e;
        const delay = policy.kind === "after" ? policy.delayMs : backoffMs(attempt);
        await this.sleep(delay);
        attempt += 1;
      }
    }
  }
}

/** Exponential backoff with a deterministic shape (no jitter: tests read it). */
export function backoffMs(attempt: number): number {
  return Math.min(8_000, 250 * 2 ** attempt);
}

/**
 * Minimal SSE reader for the Atlas frame protocol. Handles `data:{...}` and
 * `data: {...}` alike, ignores comments and other field names, and stops at the
 * `[DONE]` sentinel. Unparseable frames are skipped rather than thrown: a
 * malformed keepalive must not destroy a good answer.
 */
export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
  opts: {
    /** Aborted when the consumer stops reading, so the upstream call ends too. */
    controller?: AbortController;
    /** Silence budget between frames. Bounds the BODY, not just the headers. */
    idleMs?: number;
  } = {},
): AsyncGenerator<StreamFrame, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Re-armed on every frame rather than set once: the deadline is about
  // SILENCE. A long answer that keeps producing tokens is healthy; one that
  // stops mid-sentence is not, and a single overall deadline cannot tell them
  // apart.
  //
  // Firing it CANCELS THE READER as well as aborting the controller. Aborting
  // alone is not enough: it only unblocks a pending read when the stream is a
  // fetch body wired to that same signal, so any other stream - and any future
  // caller that passes one - would hang forever on a silent producer. Cancelling
  // resolves the pending read as done, which works for every stream.
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const armIdle = () => {
    if (!opts.idleMs) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      opts.controller?.abort();
      void reader.cancel().catch(() => {});
    }, opts.idleMs);
  };

  try {
    armIdle();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        // A cancel from the idle timer also surfaces here as a clean `done`.
        // Letting that pass would hand the consumer a truncated answer dressed
        // up as a complete one, which is worse than an error.
        if (timedOut) {
          throw new AtlasError({
            code: "STREAM_IDLE_TIMEOUT",
            status: 0,
            message: `atlas stopped sending for ${opts.idleMs}ms`,
            fromStream: true,
          });
        }
        break;
      }
      armIdle();
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        const frame = parseSseLine(line);
        if (frame === "done-sentinel") return;
        if (frame) yield frame;
      }
    }
    // Flush a trailing frame that arrived without its newline.
    const tail = parseSseLine(buffer.replace(/\r$/, ""));
    if (tail && tail !== "done-sentinel") yield tail;
  } finally {
    clearTimeout(idleTimer);

    // cancel(), not releaseLock(). releaseLock unlocks the reader but leaves the
    // stream - and the HTTP response body behind it - open, so Atlas is never
    // told the consumer left: it generates the whole completion and meters every
    // token of it against the workspace. A member who reads one sentence and
    // navigates away pays for the answer they never saw.
    await reader.cancel().catch(() => {});

    // Cancelling the body should end the request, but the abort is what
    // guarantees it - and it is also the only thing that stops a fetch still
    // waiting on headers.
    opts.controller?.abort();
  }
}

function parseSseLine(line: string): StreamFrame | "done-sentinel" | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice("data:".length).trim();
  if (!payload) return null;
  if (payload === "[DONE]") return "done-sentinel";
  try {
    const parsed = JSON.parse(payload) as StreamFrame;
    return parsed && typeof parsed === "object" && "type" in parsed ? parsed : null;
  } catch {
    return null;
  }
}
