// The L1 error envelope (product_251 clauses X-1, A-1, G-2).
//
// One shape for every refusal this product emits, on every transport:
//
//   { code, message, retryable, field? }
//
// The spec's own argument for it is the one worth repeating: a consumer
// branching on errors otherwise has to write three handlers, one of which can
// only match on prose - and prose changes. Before this module yucer emitted
// exactly that: bare text bodies on the job routes and the webhook, an
// `{ error: "lower_snake" }` object on the copilot routes, and a third shape
// again from the framework's own validation. Three envelopes on one product.
//
// WHAT EACH FIELD IS FOR, since a shape copied without its reasons decays:
//
//   code       SCREAMING_SNAKE with a module prefix. Machine-branchable and
//              greppable. The prefix is what stops two modules quietly meaning
//              different things by FORBIDDEN.
//   message    For a human reading a log. Never the branch key.
//   retryable  MANDATORY, and a boolean rather than an omission, because
//              "absent" reads as false to some callers and unknown to others.
//              The answer belongs to the side that knows why it refused.
//   field      Optional, for validation failures, so a caller can point at the
//              input rather than re-deriving which one was wrong.
//
// NOTE ON SCOPE. product_251 D-2 binds "agent products and their management
// faces" and does not settle whether an internal-token job route or a
// browser-facing app route is a "face" in that sense. This module applies the
// envelope to all of them anyway: the cost is one helper, and a product that
// speaks one error language everywhere cannot be wrong about which of its
// surfaces was in scope.

/** The four reserved refusal codes. Products MUST NOT invent alternatives. */
export const REFUSAL_CODES = [
  /** No entitlement. */
  "NOT_ENTITLED",
  /** A policy said no - distinct from having no entitlement at all. */
  "POLICY_DENIED",
  /** Not a failure: a route that continues once a human approves. */
  "APPROVAL_REQUIRED",
  /** Commercial ceiling reached. */
  "QUOTA_EXCEEDED",
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export interface ErrorEnvelope {
  code: string;
  message: string;
  retryable: boolean;
  field?: string;
}

/**
 * Build the body. Separate from the Response so the same envelope can be
 * carried by a transport that is not HTTP - X-1 requires the field names to
 * stay put even when the carriage changes, and a helper that could only make
 * Responses would quietly make that impossible.
 */
export function envelope(
  code: string,
  message: string,
  options: { retryable?: boolean; field?: string } = {},
): ErrorEnvelope {
  return {
    code,
    message,
    // Default false rather than true: an unknown-retryability refusal replayed
    // by an eager client turns one bad request into a storm, and the caller
    // cannot tell the difference between "we did not say" and "we said no".
    retryable: options.retryable ?? false,
    ...(options.field ? { field: options.field } : {}),
  };
}

/** An HTTP refusal carrying the envelope. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  options: { retryable?: boolean; field?: string } = {},
): Response {
  return Response.json(envelope(code, message, options), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Whether a string is a legal code under X-1.
 *
 * Exported for the guardrail rather than for runtime use: the check that
 * matters runs in CI over the source, because a malformed code that only fails
 * at runtime fails in front of a caller.
 */
export function isValidErrorCode(code: string): boolean {
  // MODULE_SOMETHING: at least two SCREAMING_SNAKE segments, so the prefix is
  // actually present rather than merely the first word of a one-word code.
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(code);
}

/**
 * Map a domain violation code onto the envelope.
 *
 * The two gate outcomes get the two RESERVED refusal codes, and the split is
 * the one this product already works to keep visible:
 *
 *   entitlement gate -> NOT_ENTITLED   the workspace has not bought it
 *   permission gate  -> POLICY_DENIED  the member may not do it
 *
 * Collapsing those into one code would undo the distinction `lockoutReason`
 * exists to preserve: "upgrade" and "ask an administrator" are different
 * remedies, and sending someone to a checkout page for a missing role wastes
 * their money and does not fix it.
 *
 * Everything else is prefixed rather than mapped. Inventing a fifth refusal
 * code is what X-1 forbids; naming a non-refusal is not.
 */
export function violationEnvelope(
  code: string,
  message: string,
  modulePrefix: string,
): ErrorEnvelope {
  if (code === "no_product_access" || code === "no_data_access" || code === "feature_not_in_tier") {
    return envelope("NOT_ENTITLED", message);
  }
  if (code === "permission_denied") {
    return envelope("POLICY_DENIED", message);
  }
  return envelope(`${modulePrefix}_${code.toUpperCase()}`, message);
}
