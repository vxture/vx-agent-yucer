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
  // Renamed from GRANT_DENIED on 2026-08-16 (Atlas v0.15.0). Both are listed:
  // the old name costs one line and a workspace pinned to an older Atlas would
  // otherwise lose its retry classification and its user-facing message.
  | "NOT_ENTITLED"
  | "GRANT_DENIED"
  | "QUOTA_EXCEEDED"
  | "MODEL_NOT_IMPLEMENTED"
  | "CANDIDATE_POOL_TOO_LARGE"
  | "INVALID_TENANT_ID"
  | "INVALID_APPLICATION_ID"
  // Mandatory since v0.15.0. Listed so a regression is legible in a log rather
  // than arriving as an unrecognised 400.
  | "TASK_ID_REQUIRED"
  | "TENANT_ID_REQUIRED"
  | "TARGET_SELECTOR_REQUIRED"
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
  /**
   * Atlas's own verdict, when it sent one. Since v0.15.0 every error carries
   * it, on HTTP bodies and SSE frames alike.
   *
   * It WINS over the local table - see retryPolicyFor. The table is a copy of a
   * contract that has moved seven minor versions once already, and the Runos
   * client has always deferred to the far side's flag for the same reason: the
   * gateway knows things a code name does not.
   */
  readonly retryable?: boolean;

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
    retryable?: boolean;
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
    this.retryable = init.retryable;
  }

  get retry(): RetryPolicy {
    return retryPolicyFor(this);
  }
}

const NEVER_RETRY = new Set<string>([
  // Authorization: the product has no grant for this endpoint. Retrying with a
  // different model does not help either - the reachable set is derived from
  // the same grant.
  "NOT_ENTITLED",
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
  // Request-validation codes. All 400s, so the status fallback below would
  // classify them correctly anyway - naming them means the table says so rather
  // than the outcome happening to be right for an unrelated reason.
  "TASK_ID_REQUIRED",
  "TENANT_ID_REQUIRED",
  "TARGET_SELECTOR_REQUIRED",
]);

export function retryPolicyFor(err: AtlasError): RetryPolicy {
  // Atlas said so. Its answer beats ours whenever it gave one - a local table
  // can only be as fresh as the last time somebody read the contract, and this
  // one was a release behind for seven versions without anything going red.
  //
  // retryable:false is final. retryable:true still routes through the branches
  // below first, because "may I retry" and "how long do I wait" are different
  // questions - RATE_LIMITED carries an exact delay the flag does not - but it
  // must never fall through to the status guess at the bottom. A stream frame
  // arrives on an already-200 response, so that guess would call every
  // mid-stream failure non-retryable, including the ones Atlas marks otherwise.
  if (err.retryable === false) return { kind: "no" };
  // A token problem is an IdP configuration problem. Replaying it a thousand
  // times produces a thousand identical 401s.
  if (err.code.startsWith("S2S_TOKEN_")) return { kind: "no" };
  if (NEVER_RETRY.has(err.code)) return { kind: "no" };

  if (err.code === "RATE_LIMITED") {
    // Atlas has sent a standard Retry-After header since v0.15.0, but it is
    // whole seconds ROUNDED UP, while retryAfterMs in the body is exact. The
    // body value is preferred for that reason, not because the header is
    // missing. (It is also absent on streaming responses, where the error
    // arrives as an SSE frame after the headers have gone out.)
    if (typeof err.retryAfterMs === "number" && err.retryAfterMs >= 0) {
      return { kind: "after", delayMs: err.retryAfterMs };
    }
    if (err.resetAt) {
      const delta = Date.parse(err.resetAt) - Date.now();
      if (Number.isFinite(delta)) return { kind: "after", delayMs: Math.max(0, delta) };
    }
    return { kind: "backoff" };
  }

  // MODEL_NOT_ROUTABLE is NOT here. Until v0.15.0 the contract called it
  // briefly retryable; it is now retryable:false, and it means a model or its
  // provider was deactivated - a state that does not clear on a 500ms backoff.
  // Retrying it spends metered calls to reach the same answer.
  if (err.code === "PROVIDER_UNAVAILABLE") {
    return { kind: "backoff" };
  }

  // Atlas said yes and no branch above had a better answer.
  if (err.retryable === true) return { kind: "backoff" };

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
      retryable: typeof b.retryable === "boolean" ? b.retryable : undefined,
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
export function streamFrameError(code: string, message: string, retryable?: boolean): AtlasError {
  return new AtlasError({
    code,
    status: 200,
    message,
    fromStream: true,
    // Atlas's flag when it sent one. Without it, a stream frame carries status
    // 200, so the status fallback would classify every mid-stream failure as
    // non-retryable - including MODEL_RUNTIME_STREAM_FAILED, which the contract
    // marks retryable.
    retryable,
    raw: { code, message, retryable },
  });
}
