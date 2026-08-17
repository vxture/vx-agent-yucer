// Runos error model (Runos interface reference, section 19).
//
// The capability face splits failures across TWO layers on purpose:
//
//   - protocol / authentication failures ride the HTTP status. The call was
//     never accepted.
//   - execution failures ride an MCP tool result with isError, whose
//     content[0].text is a JSON {error_class, error_code, retryable, call_id}.
//     HTTP is already 200 here: the call WAS accepted and then failed.
//
// Collapsing the two would destroy the distinction between "not accepted" and
// "accepted and failed", which is exactly the distinction that decides whether
// retrying can possibly help.

export type ErrorClass =
  | "authz_rejected"
  | "caller_error"
  | "capability_error"
  | "capability_timeout"
  | "gateway_error"
  | "gateway_timeout"
  | "cancelled"
  | (string & {});

export type ErrorCode =
  | "not_entitled"
  | "policy_denied"
  | "approval_required"
  | "quota_exceeded"
  | "schema_invalid"
  | "missing_metadata"
  // Delegation-token verification, stage 5 of invoke. It sits ABOVE the audit
  // boundary, so unlike every other refusal here it yields no call_id and no
  // audit row - there is nothing to correlate a support question against.
  | "invalid_delegation"
  | "unknown_capability"
  | "version_not_found"
  | "provider_unavailable"
  | "contract_violation"
  | "invalid_arguments"
  | (string & {});

export class RunosError extends Error {
  readonly errorClass: ErrorClass;
  readonly errorCode: ErrorCode;
  /** Runos's own verdict. Authoritative - see retryable() below. */
  readonly retryable: boolean;
  readonly callId?: string;
  /** HTTP status when the failure rode the transport instead of a tool result. */
  readonly status?: number;
  readonly raw: unknown;

  constructor(init: {
    errorClass: ErrorClass;
    errorCode: ErrorCode;
    message: string;
    retryable?: boolean;
    callId?: string;
    status?: number;
    raw?: unknown;
  }) {
    super(init.message);
    this.name = "RunosError";
    this.errorClass = init.errorClass;
    this.errorCode = init.errorCode;
    this.retryable = init.retryable ?? defaultRetryable(init.errorClass);
    this.callId = init.callId;
    this.status = init.status;
    this.raw = init.raw;
  }

  /**
   * True when the capability was refused rather than attempted. These four are
   * the adjudication chain (entitlement, risk ceiling, approval, quota) and none
   * of them changes by trying again.
   */
  get isAdjudication(): boolean {
    return (
      this.errorClass === "authz_rejected" ||
      this.errorCode === "not_entitled" ||
      this.errorCode === "policy_denied" ||
      this.errorCode === "approval_required" ||
      this.errorCode === "quota_exceeded"
    );
  }

  /**
   * unknown_capability deliberately covers BOTH "no such capability" and "you
   * are not entitled to it". Callers must treat it as "does not exist" and must
   * not probe: if the two were distinguishable, enumerating error codes would
   * enumerate the catalog.
   */
  get isUnknown(): boolean {
    return this.errorCode === "unknown_capability";
  }
}

function defaultRetryable(cls: ErrorClass): boolean {
  return cls === "capability_timeout" || cls === "gateway_error" || cls === "gateway_timeout";
}

/**
 * Whether to retry. Runos's own `retryable` flag wins whenever it is present,
 * because the gateway knows things the class alone does not - capability_error
 * is "sometimes" by design.
 *
 * One extra guard on top: never retry a non-idempotent operation. The gateway
 * will not retry one on your behalf either, and a retry is a NEW call with a
 * new audit row, so a repeated write is a real duplicate rather than a
 * deduplicated replay.
 */
export function shouldRetry(err: unknown, opts: { idempotent?: boolean } = {}): boolean {
  if (!(err instanceof RunosError)) return false;
  if (!err.retryable) return false;
  if (opts.idempotent === false) return false;
  return true;
}

/**
 * Parse the JSON error body carried inside an isError tool result. A body that
 * is not the documented shape still becomes an error, tagged gateway_error, so
 * an unparseable failure is never mistaken for a success.
 */
export function parseToolError(text: string, raw?: unknown): RunosError {
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }

  if (!body) {
    return new RunosError({
      errorClass: "gateway_error",
      errorCode: "contract_violation",
      message: text.slice(0, 500) || "runos returned an unparseable error result",
      retryable: false,
      raw: raw ?? text,
    });
  }

  return new RunosError({
    errorClass: (body.error_class as ErrorClass) ?? "gateway_error",
    errorCode: (body.error_code as ErrorCode) ?? "contract_violation",
    message:
      (typeof body.message === "string" && body.message) ||
      `${String(body.error_class ?? "error")}: ${String(body.error_code ?? "unknown")}`,
    retryable: typeof body.retryable === "boolean" ? body.retryable : undefined,
    callId: typeof body.call_id === "string" ? body.call_id : undefined,
    raw: raw ?? body,
  });
}

/** A protocol/authentication failure, which rides the HTTP status. */
export function transportError(status: number, body: unknown): RunosError {
  const b = (body ?? {}) as Record<string, unknown>;
  const message =
    typeof b.message === "string" ? b.message : `runos request failed with ${status}`;

  // Carry Runos's own code through when it sent one.
  //
  // A transport 401 used to be relabelled `not_entitled`, which inverted the
  // diagnosis exactly: `not_entitled` makes isAdjudication true, so a wrong
  // scope or a missing act.sub - pure ticket-minting bugs on OUR side - were
  // reported as "this workspace has not bought this capability". The gateway
  // publishes six distinguishable S2S_TOKEN_* codes precisely so a reader can
  // tell those apart, and collapsing all six into the one label that means
  // something else discarded the whole distinction.
  //
  // Real entitlement denial never arrives on this path: it comes back as
  // authz_rejected/not_entitled in the TOOL RESULT, under HTTP 200.
  const code = typeof b.code === "string" ? b.code : undefined;
  const errorCode =
    code ?? (status === 401 || status === 403 ? "invalid_credential" : "contract_violation");

  return new RunosError({
    errorClass: status >= 500 ? "gateway_error" : "caller_error",
    errorCode,
    message,
    // 401/403 here mean the ticket itself is wrong: wrong audience, wrong scope,
    // wrong mode. Replaying it cannot fix any of those.
    retryable: status >= 500,
    status,
    raw: body,
  });
}
