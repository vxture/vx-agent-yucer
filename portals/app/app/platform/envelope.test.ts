import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REFUSAL_CODES,
  envelope,
  errorResponse,
  isValidErrorCode,
  violationEnvelope,
} from "./envelope";

// The L1 error envelope (product_251 X-1 / A-1).

test("retryable is always present, and defaults to false rather than absent", async () => {
  // "Absent" reads as false to some callers and unknown to others. The spec
  // makes it mandatory for that reason, and false is the safe default: an
  // eager client replaying an unknown-retryability refusal turns one bad
  // request into a storm.
  const e = envelope("JOB_TOKEN_INVALID", "nope");
  assert.equal(e.retryable, false);
  assert.equal("retryable" in e, true);
  assert.equal(envelope("X_Y", "m", { retryable: true }).retryable, true);
});

test("field is omitted rather than set to undefined when there is none", () => {
  // An explicit `field: undefined` survives JSON.stringify as an absent key but
  // shows up in deepEqual and in logs as a key that exists. Optional means
  // absent.
  assert.equal("field" in envelope("A_B", "m"), false);
  assert.equal(envelope("A_B", "m", { field: "body" }).field, "body");
});

test("the two gates map onto the two reserved refusal codes, and stay distinct", () => {
  // Collapsing these would undo the distinction lockoutReason exists for:
  // "upgrade your plan" and "ask an administrator for a role" are different
  // remedies, and one of them cannot be bought.
  for (const code of ["no_product_access", "no_data_access", "feature_not_in_tier"]) {
    assert.equal(violationEnvelope(code, "m", "COPILOT").code, "NOT_ENTITLED", code);
  }
  assert.equal(violationEnvelope("permission_denied", "m", "COPILOT").code, "POLICY_DENIED");
});

test("a non-refusal is prefixed, never squeezed into a reserved code", () => {
  // X-1 forbids inventing a FIFTH refusal code. It does not forbid naming
  // something that is not a refusal.
  assert.equal(violationEnvelope("not_found", "m", "COPILOT").code, "COPILOT_NOT_FOUND");
  assert.equal(
    (REFUSAL_CODES as readonly string[]).includes(violationEnvelope("not_found", "m", "C").code),
    false,
  );
});

test("code validity requires a prefix, not merely upper case", () => {
  // The prefix is the whole point: it stops two modules quietly meaning
  // different things by FORBIDDEN.
  assert.equal(isValidErrorCode("COPILOT_NOT_AUTHENTICATED"), true);
  assert.equal(isValidErrorCode("NOT_ENTITLED"), true);
  assert.equal(isValidErrorCode("FORBIDDEN"), false, "one segment is not prefixed");
  assert.equal(isValidErrorCode("copilot_not_found"), false);
  assert.equal(isValidErrorCode("Copilot_NotFound"), false);
});

test("every reserved refusal code is itself legal", () => {
  for (const c of REFUSAL_CODES) assert.equal(isValidErrorCode(c), true, c);
});

test("the response carries the envelope as JSON with the right status", async () => {
  const res = errorResponse(403, "JOB_TOKEN_INVALID", "wrong token");
  assert.equal(res.status, 403);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await res.json(), {
    code: "JOB_TOKEN_INVALID",
    message: "wrong token",
    retryable: false,
  });
});
