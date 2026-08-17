import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasClient, type AtlasContext } from "./client";
import { AtlasError, parseAtlasError, retryPolicyFor, streamFrameError } from "./errors";

// The v0.15.0 contract corrections.
//
// yucer was built against Atlas v0.8.0 and the plane moved seven minor versions
// without anything here going red - CI never contacts Atlas, so every one of
// these defects was invisible to a green suite. These tests are the part that
// can at least pin the corrections once they are known.

const CTX: AtlasContext = {
  workspaceId: "ws_1",
  tenantId: "3f1b0c9e-0000-4000-8000-000000000000",
  taskId: "sess_1:4",
  applicationId: "sess_1",
  requestId: "sess_1:4",
};

function capturingClient(status = 200, body: unknown = { choices: [] }) {
  const seen: { url: string; init: RequestInit }[] = [];
  const client = new AtlasClient(
    { baseUrl: "https://atlas.invalid", timeoutMs: 1_000, maxRetries: 0, enabled: true },
    {
      fetchImpl: async (url, init) => {
        seen.push({ url, init });
        return new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      },
      mintToken: async () => ({
        accessToken: "t",
        expiresAt: 0,
        audience: "atlas" as const,
        mode: "service" as const,
      }),
    },
  );
  return { client, seen };
}

test("every chat call carries taskId - it is mandatory since v0.15.0", async () => {
  // Without it: 400 TASK_ID_REQUIRED, retryable:false, first attempt. The
  // copilot was entirely non-functional against production and nothing here
  // said so, because the suite only ever talks to a stub.
  const { client, seen } = capturingClient();
  await client.chat("chat", { messages: [{ role: "user", content: "hi" }] }, CTX).catch(() => {});
  assert.equal(seen.length, 1);
  const body = JSON.parse(String(seen[0].init.body)) as { taskId?: string };
  assert.equal(body.taskId, "sess_1:4");
});

test("a caller cannot set or erase taskId - it comes from the context", async () => {
  // Two defences, because the field is mandatory and a wrong value is worse
  // than a missing one (it splits a task's ledger silently rather than 400ing).
  //
  // First the type: the request parameter is Omit<..., "taskId">, so a caller
  // supplying one does not compile. Second the order: body() applies it AFTER
  // spreading the caller's object, so even an `as any` cannot blank it.
  const { client, seen } = capturingClient();
  const sneaky = { messages: [{ role: "user", content: "hi" }], taskId: undefined } as never;
  await client.chat("chat", sneaky, CTX).catch(() => {});
  const body = JSON.parse(String(seen[0].init.body)) as { taskId?: string };
  assert.equal(body.taskId, "sess_1:4", "the context value survives the spread");
});

test("NOT_ENTITLED is never retried, and neither is the old name", async () => {
  // Renamed from GRANT_DENIED on 2026-08-16. Before this, NOT_ENTITLED missed
  // the table entirely and got the right answer from the status fallback - the
  // right outcome for the wrong reason, which stops being right the moment the
  // status changes.
  for (const code of ["NOT_ENTITLED", "GRANT_DENIED"]) {
    const err = parseAtlasError(403, { code, message: "no grant" });
    assert.equal(retryPolicyFor(err).kind, "no", code);
  }
});

test("MODEL_NOT_ROUTABLE is not retried - it means something was deactivated", () => {
  // The v0.8.0 contract called it briefly retryable; v0.15.0 marks it
  // retryable:false. A deactivated model does not come back within two 500ms
  // backoffs, and each attempt is metered.
  const err = parseAtlasError(404, { code: "MODEL_NOT_ROUTABLE", message: "gone" });
  assert.equal(retryPolicyFor(err).kind, "no");

  // PROVIDER_UNAVAILABLE still is retried - it is the transient one.
  const transient = parseAtlasError(503, { code: "PROVIDER_UNAVAILABLE", message: "upstream" });
  assert.equal(retryPolicyFor(transient).kind, "backoff");
});

test("Atlas's own retryable flag beats the local table", () => {
  // The table is a copy of a contract that moved seven versions once already.
  // When Atlas states a verdict, it wins.
  const err = parseAtlasError(503, {
    code: "PROVIDER_UNAVAILABLE",
    message: "permanent for this request",
    retryable: false,
  });
  assert.equal(err.retryable, false);
  assert.equal(retryPolicyFor(err).kind, "no", "Atlas said no, so no");
});

test("a retryable stream frame is classified from the frame, not from status 200", () => {
  // A stream error arrives on an already-200 response, so the status fallback
  // would call every mid-stream failure non-retryable - including
  // MODEL_RUNTIME_STREAM_FAILED, which the contract marks retryable.
  const withFlag = streamFrameError("MODEL_RUNTIME_STREAM_FAILED", "upstream died", true);
  assert.equal(withFlag.retryable, true);
  assert.notEqual(retryPolicyFor(withFlag).kind, "no");

  const withoutFlag = streamFrameError("MODEL_RUNTIME_STREAM_FAILED", "upstream died");
  assert.equal(withoutFlag.retryable, undefined, "absent stays absent rather than defaulting");
});

test("RATE_LIMITED still prefers the body's exact delay over the rounded header", () => {
  // The header exists as of v0.15.0 but is whole seconds rounded UP. The body
  // value is exact, so it stays preferred - the old comment claiming the header
  // does not exist was wrong, the behaviour was right.
  const err = parseAtlasError(429, { code: "RATE_LIMITED", message: "slow down", retryAfterMs: 1400 });
  assert.deepEqual(retryPolicyFor(err), { kind: "after", delayMs: 1400 });
});

test("request-validation codes are named rather than caught by the status fallback", () => {
  for (const code of ["TASK_ID_REQUIRED", "TENANT_ID_REQUIRED", "TARGET_SELECTOR_REQUIRED"]) {
    const err = new AtlasError({ code, status: 400, message: "bad request" });
    assert.equal(retryPolicyFor(err).kind, "no", code);
  }
});
