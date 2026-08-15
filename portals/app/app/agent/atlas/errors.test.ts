import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasError, parseAtlasError, streamFrameError, isRetryable } from "./errors";

test("authorization and commercial denials are never retried", () => {
  // These are 403s. A retry loop on them burns quota-free requests forever and
  // hides a problem that only an operator or a purchase can fix.
  for (const code of ["GRANT_DENIED", "QUOTA_EXCEEDED"]) {
    const e = new AtlasError({ code, status: 403, message: "denied" });
    assert.equal(e.retry.kind, "no", code);
    assert.equal(isRetryable(e), false, code);
  }
});

test("capability gaps and caller bugs are never retried", () => {
  const cases: Array<[string, number]> = [
    ["MODEL_NOT_IMPLEMENTED", 501],
    ["ENDPOINT_NOT_ROUTABLE", 404],
    ["CANDIDATE_POOL_TOO_LARGE", 400],
    ["INVALID_TENANT_ID", 400],
    ["INVALID_APPLICATION_ID", 400],
  ];
  for (const [code, status] of cases) {
    assert.equal(new AtlasError({ code, status, message: "x" }).retry.kind, "no", code);
  }
});

test("every S2S token error is a configuration problem, not a transient one", () => {
  for (const code of [
    "S2S_TOKEN_MISSING",
    "S2S_TOKEN_INVALID",
    "S2S_TOKEN_MISSING_ACT",
    "S2S_TOKEN_INVALID_MODE",
    "S2S_TOKEN_WRONG_SCOPE",
  ]) {
    assert.equal(new AtlasError({ code, status: 401, message: "x" }).retry.kind, "no", code);
  }
});

test("provider outages get backoff - the fallback chain is already exhausted", () => {
  // A PROVIDER_UNAVAILABLE means Atlas already walked the endpoint's whole
  // fallback chain, so this is the entire chain being down, not one model.
  assert.deepEqual(
    new AtlasError({ code: "PROVIDER_UNAVAILABLE", status: 503, message: "x" }).retry,
    { kind: "backoff" },
  );
  assert.deepEqual(new AtlasError({ code: "MODEL_NOT_ROUTABLE", status: 503, message: "x" }).retry, {
    kind: "backoff",
  });
});

test("rate limiting uses the body delay, because Atlas sends no Retry-After header", () => {
  const e = new AtlasError({ code: "RATE_LIMITED", status: 429, message: "x", retryAfterMs: 1500 });
  assert.deepEqual(e.retry, { kind: "after", delayMs: 1500 });
});

test("rate limiting falls back to resetAt, then to plain backoff", () => {
  const at = new Date(Date.now() + 5_000).toISOString();
  const viaReset = new AtlasError({ code: "RATE_LIMITED", status: 429, message: "x", resetAt: at });
  assert.equal(viaReset.retry.kind, "after");
  assert.ok((viaReset.retry as { delayMs: number }).delayMs > 3_000);

  const bare = new AtlasError({ code: "RATE_LIMITED", status: 429, message: "x" });
  assert.deepEqual(bare.retry, { kind: "backoff" });
});

test("a resetAt in the past yields a non-negative delay", () => {
  const past = new Date(Date.now() - 10_000).toISOString();
  const e = new AtlasError({ code: "RATE_LIMITED", status: 429, message: "x", resetAt: past });
  assert.deepEqual(e.retry, { kind: "after", delayMs: 0 });
});

test("unknown codes split on status: 5xx backs off, 4xx does not", () => {
  // Guessing "retry" for an unrecognized 4xx turns one bad request into a storm.
  assert.deepEqual(new AtlasError({ code: "WHAT_IS_THIS", status: 500, message: "x" }).retry, {
    kind: "backoff",
  });
  assert.deepEqual(new AtlasError({ code: "WHAT_IS_THIS", status: 422, message: "x" }).retry, {
    kind: "no",
  });
});

// --- The three envelopes ----------------------------------------------------

test("envelope 1: ModelRuntimeException carries code and the diagnostic fields", () => {
  const e = parseAtlasError(429, {
    code: "RATE_LIMITED",
    message: "slow down",
    requestId: "req_1",
    modelCode: "glm-4",
    provider: "zhipu",
    retryAfterMs: 800,
  });
  assert.equal(e.code, "RATE_LIMITED");
  assert.equal(e.requestId, "req_1");
  assert.equal(e.modelCode, "glm-4");
  assert.equal(e.provider, "zhipu");
  assert.deepEqual(e.retry, { kind: "after", delayMs: 800 });
});

test("envelope 2: ModelAdminException also leads with code", () => {
  const e = parseAtlasError(409, { code: "MODEL_ADMIN_HAS_DEPENDENTS", message: "blocked" });
  assert.equal(e.code, "MODEL_ADMIN_HAS_DEPENDENTS");
});

test("envelope 3: the bare framework exception has NO code field", () => {
  // This is the shape a plain validation failure arrives in. Reading only
  // body.code would file it as "unknown error" and throw away the one field
  // that says what is wrong.
  const e = parseAtlasError(400, { statusCode: 400, message: "texts must be an array", error: "Bad Request" });
  assert.equal(e.code, "Bad Request", "falls through code -> error");
  assert.equal(e.message, "texts must be an array");
  assert.equal(e.retry.kind, "no");
});

test("a body with neither code nor error degrades to the status string", () => {
  const e = parseAtlasError(503, { message: "upstream exploded" });
  assert.equal(e.code, "503");
  assert.equal(e.retry.kind, "backoff");
});

test("an array message (framework validation) is joined rather than dropped", () => {
  const e = parseAtlasError(400, { statusCode: 400, message: ["a must be set", "b must be a uuid"] });
  assert.match(e.message, /a must be set; b must be a uuid/);
});

test("a non-JSON body is still carried, not discarded", () => {
  const e = parseAtlasError(502, null, "<html>gateway</html>");
  assert.equal(e.message, "<html>gateway</html>");
  assert.equal(e.raw, null);
});

test("the raw body is always retained for logging", () => {
  const body = { code: "GRANT_DENIED", message: "no grant", extraFutureField: 1 };
  assert.deepEqual(parseAtlasError(403, body).raw, body);
});

// --- Stream failures --------------------------------------------------------

test("a stream error frame is marked as such and reports HTTP 200", () => {
  // The status cannot be anything else: headers went out before the failure.
  const e = streamFrameError("PROVIDER_UNAVAILABLE", "upstream dropped");
  assert.equal(e.fromStream, true);
  assert.equal(e.status, 200);
  assert.deepEqual(e.retry, { kind: "backoff" });
});
