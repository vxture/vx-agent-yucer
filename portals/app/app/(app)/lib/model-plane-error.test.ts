import { test } from "node:test";
import assert from "node:assert/strict";
import { explainModelPlaneError, isModelPlaneError } from "./model-plane-error";

const TEXT = {
  errorNotConfigured: "not configured",
  errorNoGrant: "no grant",
  errorQuota: "quota",
  errorTurnQuota: "turn quota",
  errorTooMuch: "too much",
  errorTimeout: "timeout",
  errorGeneric: "generic",
} as never;

test("anything the model plane produced is recognised, whatever it is called", () => {
  // THE POINT OF A PREFIX. `atlas_${e.code}` is composed at runtime from the
  // platform's own vocabulary, so this repo cannot enumerate the set - and the
  // reachable-codes guard, which enumerates, is structurally blind to it. That
  // is how `atlas_ATLAS_NOT_CONFIGURED` reached a reader on the account page.
  assert.equal(isModelPlaneError("atlas_ATLAS_NOT_CONFIGURED"), true);
  assert.equal(isModelPlaneError("atlas_SOMETHING_INVENTED_NEXT_YEAR"), true);
  assert.equal(isModelPlaneError("no_active_tenant"), true);
  assert.equal(isModelPlaneError("permission_denied"), false);
});

test("a code nobody has seen still gets a sentence, never the raw string", () => {
  // We cannot promise a sentence per code we do not own. We can promise never
  // to print one raw.
  assert.equal(explainModelPlaneError("atlas_WHO_KNOWS", TEXT), "generic");
});

test("the remedy survives a rename, because both spellings are matched", () => {
  // Atlas renamed GRANT_DENIED to NOT_ENTITLED on 2026-08-16. This is the one
  // message that names a fix, and losing it to a rename would leave exactly the
  // people who can fix it reading "something went wrong".
  assert.equal(explainModelPlaneError("atlas_GRANT_DENIED", TEXT), "no grant");
  assert.equal(explainModelPlaneError("atlas_NOT_ENTITLED", TEXT), "no grant");
});

test("a session with no tenant reads as unconfigured, not as a failure", () => {
  // Both mean the model plane cannot be reached, and the reader's next step is
  // the same in both cases.
  for (const code of ["no_active_tenant", "tenant_required", "atlas_ATLAS_NOT_CONFIGURED"]) {
    assert.equal(explainModelPlaneError(code, TEXT), "not configured", code);
  }
});

test("the product's own turn quota gets its own sentence, not the model plane's", () => {
  assert.equal(explainModelPlaneError("quota_exceeded", TEXT), "turn quota");
  assert.equal(explainModelPlaneError("atlas_QUOTA_EXCEEDED", TEXT), "quota");
});

test("too much input and too long a wait each get their own advice", () => {
  // Atlas v0.7.6-v0.7.10 made these non-retryable 422s and a 504; "try again"
  // is wrong advice for the first and incomplete for the second.
  for (const c of ["CONTEXT_LENGTH_EXCEEDED", "UPSTREAM_REJECTED_REQUEST", "PAYLOAD_TOO_LARGE"]) {
    assert.equal(explainModelPlaneError(`atlas_${c}`, TEXT), "too much", c);
  }
  for (const c of ["DEADLINE_EXCEEDED", "LOCAL_DEADLINE", "BODY_TIMEOUT", "STREAM_IDLE_TIMEOUT"]) {
    assert.equal(explainModelPlaneError(`atlas_${c}`, TEXT), "timeout", c);
  }
});
