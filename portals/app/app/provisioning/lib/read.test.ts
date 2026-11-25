/**
 * Read-only directory paging and workspace/organization isolation regressions.
 * @package @yucer/app
 * @layer Application
 * @category test
 * @author AI-Generated
 * @date 2026-11-24
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readProvisionedOrganizations } from "./read";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const item = (workspace_id = A, tenant_id = B, state = "provisioned") => ({
  workspace_id, tenant_id, state, seq: 1, updated_at: "2026-11-24T00:00:00Z",
});
const config = {
  baseUrl: "https://platform.internal", product: "yucer",
  accessToken: async (workspace: string | null) => { assert.equal(workspace, null); return "reader-ticket"; },
};

test("read-only directory keeps each current organization and excludes pending/deprovisioned relations", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); urls.push(url.pathname);
    assert.equal(url.pathname, "/platform/provisioning");
    assert.equal(init?.method, undefined);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer reader-ticket");
    return Response.json(url.searchParams.has("cursor")
      ? { items: [item(B, A), item(C, A, "pending"), item(D, B, "deprovisioned")], nextCursor: null }
      : { items: [item()], nextCursor: "second" });
  };
  assert.deepEqual(await readProvisionedOrganizations({ config, fetchImpl }), new Map([[A, B], [B, A]]));
  assert.deepEqual(urls, ["/platform/provisioning", "/platform/provisioning"]);
});

test("incomplete, conflicting or malformed directory never yields a usable partial map", async () => {
  for (const second of [
    new Response("", { status: 503 }),
    Response.json({ items: [item(A, C)], nextCursor: null }),
    Response.json({ items: [item(B, "not-a-verified-org")], nextCursor: null }),
    Response.json({ items: [], nextCursor: "second" }),
  ]) {
    const fetchImpl: typeof fetch = async (input) => new URL(String(input)).searchParams.has("cursor")
      ? second : Response.json({ items: [item()], nextCursor: "second" });
    await assert.rejects(readProvisionedOrganizations({ config, fetchImpl }), /503|Duplicate|Invalid|Repeated/);
  }
});

test("fresh directory scans drop a relation removed since the last run", async () => {
  let present = true;
  const fetchImpl: typeof fetch = async () => Response.json({ items: present ? [item()] : [], nextCursor: null });
  assert.equal((await readProvisionedOrganizations({ config, fetchImpl }))?.get(A), B);
  present = false;
  assert.equal((await readProvisionedOrganizations({ config, fetchImpl }))?.has(A), false);
});
