import { test } from "node:test";
import assert from "node:assert/strict";
import { RunosError, transportError } from "./errors";

// The Runos contract corrections.
//
// Same species as the Atlas ones: yucer was built against a superseded revision
// of the interface reference and nothing went red, because CI never contacts
// Runos and the fixtures were written from the same superseded document.

test("a transport 401 is not reported as an entitlement denial", () => {
  // The inversion this prevents. `not_entitled` sets isAdjudication, so a wrong
  // scope or a missing act.sub - our own ticket-minting bugs - used to be
  // reported to the reader as "this workspace has not bought this capability".
  const err = transportError(401, { message: "bad scope" });
  assert.notEqual(err.errorCode, "not_entitled");
  assert.equal(err.isAdjudication, false, "a broken ticket is not a business decision");
  assert.equal(err.errorClass, "caller_error");
  assert.equal(err.retryable, false);
});

test("the gateway's own token code is carried through rather than overwritten", () => {
  // Runos publishes six distinguishable S2S_TOKEN_* codes so a reader can tell
  // a wrong audience from a missing subject. Collapsing them loses the only
  // thing that makes a 401 diagnosable.
  for (const code of ["S2S_TOKEN_WRONG_SCOPE", "S2S_TOKEN_MISSING_ACT", "S2S_TOKEN_INVALID"]) {
    const err = transportError(401, { code, message: "nope" });
    assert.equal(err.errorCode, code);
    assert.equal(err.isAdjudication, false);
  }
});

test("a real entitlement denial still reads as adjudication", () => {
  // It arrives in the TOOL RESULT under HTTP 200, never on the transport path.
  const err = new RunosError({
    errorClass: "authz_rejected",
    errorCode: "not_entitled",
    message: "no grant",
    retryable: false,
  });
  assert.equal(err.isAdjudication, true);
});

test("a failed delegation token is a caller error, not an adjudication", () => {
  // Runos DOES verify the token - stage 5 of invoke, above the audit boundary,
  // so there is no call_id to correlate. But a malformed credential is our bug,
  // not a decision about what this workspace may do, and reporting it as an
  // entitlement problem would send someone to the wrong console.
  const err = new RunosError({
    errorClass: "caller_error",
    errorCode: "invalid_delegation",
    message: "aud mismatch",
    retryable: false,
  });
  assert.equal(err.isAdjudication, false);
  assert.equal(err.retryable, false);
});

test("a 5xx stays retryable and keeps its gateway class", () => {
  const err = transportError(503, {});
  assert.equal(err.errorClass, "gateway_error");
  assert.equal(err.retryable, true);
});
