import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";

const post = (headers: Record<string, string>, body = "{\"workspaces\":[]}") =>
  POST(new Request("http://localhost/api/jobs/commitment-sweep", { method: "POST", headers, body }));

test("an unset INTERNAL_JOB_TOKEN refuses rather than allows", async () => {
  delete process.env.INTERNAL_JOB_TOKEN;
  assert.equal((await post({ "x-internal-job-token": "anything" })).status, 403);
});

test("a mismatched or missing token refuses", async () => {
  process.env.INTERNAL_JOB_TOKEN = "correct";
  assert.equal((await post({ "x-internal-job-token": "wrong" })).status, 403);
  assert.equal((await post({})).status, 403);
  delete process.env.INTERNAL_JOB_TOKEN;
});

test("an authorised call with no workspaces is a clean no-op, not an error", async () => {
  process.env.INTERNAL_JOB_TOKEN = "t";
  const res = await post({ "x-internal-job-token": "t" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { overdue: number; proposed: number };
  assert.equal(body.overdue, 0);
  assert.equal(body.proposed, 0);
  delete process.env.INTERNAL_JOB_TOKEN;
});

test("a malformed body is rejected before anything runs", async () => {
  process.env.INTERNAL_JOB_TOKEN = "t";
  const res = await post({ "x-internal-job-token": "t" }, "{not json");
  assert.equal(res.status, 400);
  delete process.env.INTERNAL_JOB_TOKEN;
});
