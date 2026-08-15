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
  async chat(task: CopilotTask, req: Omit<ChatRequest, "stream">, ctx: AtlasContext): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const res = await this.post("/v1/chat", this.body(task, req, ctx, false), ctx);
      const json = await this.json(res);
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
    req: Omit<ChatRequest, "stream">,
    ctx: AtlasContext,
  ): AsyncGenerator<StreamFrame, void, void> {
    const res = await this.post("/v1/chat", this.body(task, req, ctx, true), ctx);
    if (!res.ok) {
      throw parseAtlasError(res.status, await this.json(res));
    }
    if (!res.body) throw new AtlasError({ code: "EMPTY_STREAM", status: res.status, message: "atlas returned no stream body" });

    for await (const frame of parseSse(res.body)) {
      if (frame.type === "error") throw streamFrameError(frame.code, frame.message);
      yield frame;
      if (frame.type === "done") return;
    }
  }

  /**
   * Cheapest possible proof that the token works. A 200 here means every later
   * failure is an authorization or business problem, not a credential one.
   */
  async models(ctx: AtlasContext): Promise<unknown> {
    const res = await this.request("GET", "/v1/models", undefined, ctx);
    const json = await this.json(res);
    if (!res.ok) throw parseAtlasError(res.status, json);
    return json;
  }

  /** Entitlement as Atlas sees it, scoped by the token rather than by a param. */
  async quotas(ctx: AtlasContext): Promise<unknown> {
    const res = await this.request("GET", "/tenancy/quotas", undefined, ctx);
    const json = await this.json(res);
    if (!res.ok) throw parseAtlasError(res.status, json);
    return json;
  }

  private body(
    task: CopilotTask,
    req: Omit<ChatRequest, "stream">,
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
      stream,
    };
  }

  private async post(path: string, body: unknown, ctx: AtlasContext): Promise<Response> {
    return this.request("POST", path, body, ctx);
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
    ctx: AtlasContext,
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

    const controller = new AbortController();
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
): AsyncGenerator<StreamFrame, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
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
    reader.releaseLock();
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
