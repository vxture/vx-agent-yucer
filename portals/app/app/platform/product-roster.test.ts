import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchProductRoster, getProductRosterConfig } from "./product-roster";

const WS = "11111111-1111-4111-8111-111111111111";
const SUB = "usr_11111111-1111-4111-8111-111111111111";

function envelope(items: unknown[] = [], nextCursor: string | null = null) {
  return { org_id: WS, workspace_id: WS, product: "yucer", authorization_mode: "assigned_seats", version: "a".repeat(32), items, nextCursor };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("product roster follows the ticket-bound cursor and normalizes display names", async () => {
  const urls: string[] = [];
  const result = await fetchProductRoster({
    baseUrl: "http://127.0.0.1:4100",
    product: "yucer",
    workspaceId: WS, orgId: WS,
    accessToken: async () => "ticket",
  }, { fetchImpl: async (url, init) => {
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer ticket");
    urls.push(url);
    if (urls.length === 1) return response(envelope([{ subject: SUB, display_name: " Alice ", eligible: true }], "next"));
    return response(envelope());
  } });
  assert.deepEqual(result, [{ subject: SUB, displayName: "Alice" }]);
  assert.match(urls[0]!, /limit=200/);
  assert.match(urls[1]!, /cursor=next/);
});

test("product roster rejects a response for another workspace", async () => {
  await assert.rejects(() => fetchProductRoster({
    baseUrl: "http://127.0.0.1:4100", product: "yucer", workspaceId: WS, orgId: WS,
    accessToken: async () => "ticket",
  }, { fetchImpl: async () => response({ ...envelope(), workspace_id: "22222222-2222-4222-8222-222222222222" }) }), /scope/);
});

test("product roster keeps a read failure distinct from an empty roster", async () => {
  await assert.rejects(() => fetchProductRoster({
    baseUrl: "http://127.0.0.1:4100", product: "yucer", workspaceId: WS, orgId: WS,
    accessToken: async () => "ticket",
  }, { fetchImpl: async () => response({}, 503) }), /503/);
});

test("a changed roster discards partial pages and restarts once from the beginning", async () => {
  let calls = 0;
  const stale = { subject: SUB, display_name: "Old", eligible: true };
  const result = await fetchProductRoster({
    baseUrl: "http://127.0.0.1:4100", product: "yucer", workspaceId: WS, orgId: WS,
    accessToken: async () => "ticket",
  }, { fetchImpl: async (url) => {
    calls++;
    if (calls === 1) return response(envelope([stale], "next"));
    if (calls === 2) return response({}, 409);
    assert.equal(new URL(url).searchParams.has("cursor"), false);
    return response(envelope([{ ...stale, display_name: "Current" }]));
  } });
  assert.deepEqual(result, [{ subject: SUB, displayName: "Current" }]);
  assert.equal(calls, 3);
});

test("malformed, cross-organization and ineligible roster responses fail closed", async () => {
  for (const body of [
    { ...envelope(), org_id: "22222222-2222-4222-8222-222222222222" },
    { ...envelope(), product: "another-product" },
    { ...envelope(), nextCursor: undefined },
    envelope([{ subject: "internal-uuid", display_name: "Wrong identity", eligible: true }]),
    envelope([{ subject: SUB, display_name: null, eligible: false }]),
    envelope([{ subject: SUB, display_name: 42, eligible: true }]),
    envelope([], "non-progressing"),
    [envelope()],
  ]) {
    await assert.rejects(() => fetchProductRoster({
      baseUrl: "http://127.0.0.1:4100", product: "yucer", workspaceId: WS, orgId: WS,
      accessToken: async () => "ticket",
    }, { fetchImpl: async () => response(body) }), /Invalid/);
  }
});

test("pagination rejects repeated identities, cursors and unannounced revision changes", async () => {
  for (const second of [
    envelope([{ subject: SUB, display_name: null, eligible: true }]),
    { ...envelope(), version: "b".repeat(32) },
    envelope([{ subject: "usr_22222222-2222-4222-8222-222222222222", display_name: null, eligible: true }], "next"),
  ]) {
    let calls = 0;
    await assert.rejects(() => fetchProductRoster({
      baseUrl: "http://127.0.0.1:4100", product: "yucer", workspaceId: WS, orgId: WS,
      accessToken: async () => "ticket",
    }, { fetchImpl: async () => response(++calls === 1 ? envelope([{ subject: SUB, display_name: null, eligible: true }], "next") : second) }), /Invalid/);
  }
});

test("repeated conflicts surface as a failed read rather than an empty roster", async () => {
  let calls = 0;
  await assert.rejects(() => fetchProductRoster({
    baseUrl: "http://127.0.0.1:4100", product: "yucer", workspaceId: WS, orgId: WS,
    accessToken: async () => "ticket",
  }, { fetchImpl: async () => { calls++; return response({}, 409); } }), /409/);
  assert.equal(calls, 2);
});

test("configured product roster refuses an absent organization instead of minting an unbound ticket", () => {
  assert.throws(() => getProductRosterConfig(WS, null, {
    PLATFORM_API_URL: "https://platform.example.test", OIDC_CLIENT_SECRET: "test-secret",
  }), /verified organization/);
  assert.equal(getProductRosterConfig(WS, null, {}), null, "offline development remains explicit");
});
