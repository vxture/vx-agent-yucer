// Atlas error taxonomy and retry classification (Atlas contract, Part A section
// 7 and the full code list in Part C).
//
// Two things here are worth more than the code that implements them:
//
// 1. RETRY IS PER-CODE, NEVER PER-STATUS. Retrying every 5xx and retrying
//    nothing are both wrong. GRANT_DENIED and QUOTA_EXCEEDED are 403s that will
//    never succeed on retry - they need an operator or a commercial decision -
//    while PROVIDER_UNAVAILABLE is a 503 that already exhausted the endpoint's
//    fallback chain and still deserves backoff.
//
// 2. THERE ARE THREE ERROR ENVELOPES. Only one of them has `code`. Code that
//    reads `body.code` and gives up leaves the other two shapes as "unknown
//    error" - including plain input-validation failures, which are the ones a
//    developer most needs to read.

export type AtlasErrorCode =
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_NOT_ROUTABLE"
  | "ENDPOINT_NOT_ROUTABLE"
  | "GRANT_DENIED"
  | "QUOTA_EXCEEDED"
  | "MODEL_NOT_IMPLEMENTED"
  | "CANDIDATE_POOL_TOO_LARGE"
  | "INVALID_TENANT_ID"
  | "INVALID_APPLICATION_ID"
  | (string & {});

/**
 * What the caller should do. Deliberately not a boolean: "retry after this many
 * ms" and "retry with backoff" have different implementations, and "this will
 * never work" needs to reach a human rather than a retry loop.
 */
export type RetryPolicy =
  | { kind: "no" }
  | { kind: "backoff" }
  | { kind: "after"; delayMs: number };

export class AtlasError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly modelCode?: string;
  readonly provider?: string;
  readonly retryAfterMs?: number;
  readonly resetAt?: string;
  /** The raw body, always kept: the envelope that has no `code` still has the
   * only description of what went wrong. */
  readonly raw: unknown;
  /** True when the failure arrived as an SSE frame on an already-200 response. */
  readonly fromStream: boolean;

  constructor(init: {
    code: string;
    status: number;
    message: string;
    raw?: unknown;
    requestId?: string;
    modelCode?: string;
    provider?: string;
    retryAfterMs?: number;
    resetAt?: string;
    fromStream?: boolean;
  }) {
    super(init.message);
    this.name = "AtlasError";
    this.code = init.code;
    this.status = init.status;
    this.raw = init.raw;
    this.requestId = init.requestId;
    this.modelCode = init.modelCode;
    this.provider = init.provider;
    this.retryAfterMs = init.retryAfterMs;
    this.resetAt = init.resetAt;
    this.fromStream = init.fromStream ?? false;
  }

  get retry(): RetryPolicy {
    return retryPolicyFor(this);
  }
}

const NEVER_RETRY = new Set<string>([
  // Authorization: the product has no grant for this endpoint. Retrying with a
  // different model does not help either - the reachable set is derived from
  // the same grant.
  "GRANT_DENIED",
  // Commercial, not technical: the tenant's quota is spent.
  "QUOTA_EXCEEDED",
  // The upstream simply cannot do this (all of /v1/parse today).
  "MODEL_NOT_IMPLEMENTED",
  // Absent and deactivated endpoints are intentionally indistinguishable.
  "ENDPOINT_NOT_ROUTABLE",
  // Caller bugs.
  "CANDIDATE_POOL_TOO_LARGE",
  "INVALID_TENANT_ID",
  "INVALID_APPLICATION_ID",
]);

export function retryPolicyFor(err: AtlasError): RetryPolicy {
  // A token problem is an IdP configuration problem. Replaying it a thousand
  // times produces a thousand identical 401s.
  if (err.code.startsWith("S2S_TOKEN_")) return { kind: "no" };
  if (NEVER_RETRY.has(err.code)) return { kind: "no" };

  if (err.code === "RATE_LIMITED") {
    // Atlas does not send a Retry-After header; the delay is in the body.
    if (typeof err.retryAfterMs === "number" && err.retryAfterMs >= 0) {
      return { kind: "after", delayMs: err.retryAfterMs };
    }
    if (err.resetAt) {
      const delta = Date.parse(err.resetAt) - Date.now();
      if (Number.isFinite(delta)) return { kind: "after", delayMs: Math.max(0, delta) };
    }
    return { kind: "backoff" };
  }

  if (err.code === "PROVIDER_UNAVAILABLE" || err.code === "MODEL_NOT_ROUTABLE") {
    return { kind: "backoff" };
  }

  // 4xx we do not recognize is a caller problem until proven otherwise;
  // unrecognized 5xx gets backoff. Guessing "retry" for an unknown 4xx would
  // turn a bad request into a retry storm.
  return err.status >= 500 ? { kind: "backoff" } : { kind: "no" };
}

export function isRetryable(err: unknown): boolean {
  return err instanceof AtlasError && err.retry.kind !== "no";
}

/**
 * Parse any of the three envelopes.
 *
 *   ModelRuntimeException  /v1/* and /tenancy/*   {code, message, requestId?, ...}
 *   ModelAdminException    /capability/*          {code, message, field?, ...}
 *   bare Nest exception    validation, webhooks   {statusCode, message, error}
 *
 * Resolution order is `code` then `error` then the HTTP status, which is what
 * the contract recommends, and the raw body is carried on the error either way.
 */
export function parseAtlasError(status: number, body: unknown, fallbackText = ""): AtlasError {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const code =
      (typeof b.code === "string" && b.code) ||
      (typeof b.error === "string" && b.error) ||
      String(status);
    const message =
      (typeof b.message === "string" && b.message) ||
      (Array.isArray(b.message) ? b.message.join("; ") : "") ||
      fallbackText ||
      `atlas request failed with ${status}`;
    return new AtlasError({
      code,
      status,
      message,
      raw: body,
      requestId: typeof b.requestId === "string" ? b.requestId : undefined,
      modelCode: typeof b.modelCode === "string" ? b.modelCode : undefined,
      provider: typeof b.provider === "string" ? b.provider : undefined,
      retryAfterMs: typeof b.retryAfterMs === "number" ? b.retryAfterMs : undefined,
      resetAt: typeof b.resetAt === "string" ? b.resetAt : undefined,
    });
  }
  return new AtlasError({
    code: String(status),
    status,
    message: fallbackText || `atlas request failed with ${status}`,
    raw: body,
  });
}

/**
 * A failure that arrived as an SSE frame. The HTTP status is already 200 and
 * cannot be changed, so the frame is the only signal; a client that watches
 * only the status code reads a truncated answer as a complete one.
 */
export function streamFrameError(code: string, message: string): AtlasError {
  return new AtlasError({ code, status: 200, message, fromStream: true, raw: { code, message } });
}
