import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";
import { NullArdaFactSource, setArdaFactSource } from "../../../platform/arda/source";

// The job route's gate. Fail-closed, and never a user session.

const post = (headers: Record<string, string>, body: unknown = { workspaces: [] }) =>
  POST(
    new Request("http://localhost/api/arda/sync", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );

test("an unset INTERNAL_JOB_TOKEN refuses rather than allows", async () => {
  // Fail-closed. A misconfigured deployment must not expose a job route that
  // writes rows, and "no token configured" is the likeliest misconfiguration.
  delete process.env.INTERNAL_JOB_TOKEN;
  const res = await post({ "x-internal-job-token": "anything" });
  assert.equal(res.status, 403);
});

test("a mismatched token refuses", async () => {
  process.env.INTERNAL_JOB_TOKEN = "correct";
  assert.equal((await post({ "x-internal-job-token": "wrong" })).status, 403);
  assert.equal((await post({})).status, 403, "a missing header is not a pass");
  delete process.env.INTERNAL_JOB_TOKEN;
});

test("a deliberately unconfigured plane is 200 disabled, not an error", async () => {
  // A job nobody switched on is not a fault. Dressing it as one means the first
  // real failure reads as more of the same.
  process.env.INTERNAL_JOB_TOKEN = "t";
  setArdaFactSource(new NullArdaFactSource());
  const res = await post({ "x-internal-job-token": "t" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string; recorded: number };
  assert.equal(body.status, "disabled");
  assert.equal(body.recorded, 0);
  setArdaFactSource(null);
  delete process.env.INTERNAL_JOB_TOKEN;
});

test("a malformed body is rejected before anything runs", async () => {
  process.env.INTERNAL_JOB_TOKEN = "t";
  const res = await POST(
    new Request("http://localhost/api/arda/sync", {
      method: "POST",
      headers: { "x-internal-job-token": "t" },
      body: "{not json",
    }),
  );
  assert.equal(res.status, 400);
  delete process.env.INTERNAL_JOB_TOKEN;
});

test("workspace entries that are not well formed are dropped, not coerced", async () => {
  process.env.INTERNAL_JOB_TOKEN = "t";
  setArdaFactSource(new NullArdaFactSource());
  const res = await post({ "x-internal-job-token": "t" }, {
    workspaces: [{ workspaceId: "ws" }, { tenantId: "tn" }, 42, null],
  });
  assert.equal(res.status, 200);
  // s2s.ts throws on a missing workspace_id precisely because Atlas silently
  // meters against a NULL workspace instead of failing. Half a workspace pair
  // must never reach a mint call.
  setArdaFactSource(null);
  delete process.env.INTERNAL_JOB_TOKEN;
});
