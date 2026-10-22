/**
 * Channel credential isolation, expiry and failure regressions.
 * @package @yucer/app
 * @layer Application
 * @category test
 * @author AI-Generated
 * @date 2026-10-22
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mintChannelToken, resetChannelTokens } from "./channel-token";
import type { S2SConfig, FetchLike } from "./s2s";
const config: S2SConfig = { tokenUrl: "https://idp.test/oidc/token", clientId: "yucer", clientSecret: "test-secret", productCode: "yucer", enabled: true };
beforeEach(resetChannelTokens);

test("service requests send flat workspace only; reader scope never inherits workspace or secret", async () => {
  const calls: URLSearchParams[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    assert.equal(new Headers(init.headers).get("authorization"), "Basic " + Buffer.from("yucer:test-secret").toString("base64"));
    assert.equal(init.redirect, "error");
    const body = new URLSearchParams(String(init.body)); calls.push(body);
    assert.equal(body.get("client_secret"), null);
    for (const name of ["requested_context", "tenant_id", "act_sub", "mode"]) assert.equal(body.has(name), false);
    return Response.json({ access_token: `token-${calls.length}`, token_type: "Bearer", expires_in: 300 });
  };
  assert.equal(await mintChannelToken("workspace-a", { config, fetchImpl }), "token-1");
  assert.equal(calls[0].get("workspace_id"), "workspace-a");
  assert.equal(calls[0].get("audience"), "vxture");
  assert.equal(await mintChannelToken(null, { config, fetchImpl }), "token-2");
  assert.equal(calls[1].get("scope"), "provisioning:read");
  assert.equal(calls[1].has("workspace_id"), false);
});

test("single-flight, expiry skew, workspace/client/secret/issuer cache isolation", async () => {
  let calls = 0, clock = 1000;
  const fetchImpl: FetchLike = async () => { calls++; await new Promise((r) => setImmediate(r)); return Response.json({ access_token: `token-${calls}`, token_type: "Bearer", expires_in: 60 }); };
  const opts = { config, fetchImpl, now: () => clock };
  const same = await Promise.all(Array.from({ length: 10 }, () => mintChannelToken("a", opts)));
  assert.equal(new Set(same).size, 1); assert.equal(calls, 1);
  await mintChannelToken("b", opts);
  await mintChannelToken("a", { ...opts, config: { ...config, clientId: "yucer-beta" } });
  await mintChannelToken("a", { ...opts, config: { ...config, clientSecret: "rotated" } });
  await mintChannelToken("a", { ...opts, config: { ...config, tokenUrl: "https://other.test/token" } });
  assert.equal(calls, 5);
  clock += 31_000; await mintChannelToken("a", opts); assert.equal(calls, 6);
});

test("failures do not cache or leak IdP bodies and the next invocation retries", async () => {
  let calls = 0;
  const fetchImpl: FetchLike = async () => {
    calls++;
    if (calls === 1) return new Response("SENSITIVE_IDP_BODY", { status: 401 });
    return Response.json({ access_token: "valid", token_type: "Bearer", expires_in: 300 });
  };
  await assert.rejects(mintChannelToken("a", { config, fetchImpl }), (e: Error) => /401/.test(e.message) && !e.message.includes("SENSITIVE"));
  assert.equal(await mintChannelToken("a", { config, fetchImpl }), "valid");
});

test("invalid tokens, expiry, authentication method, and missing workspace fail closed", async () => {
  for (const raw of [{}, null, { access_token: "x", token_type: "Basic", expires_in: 300 }, { access_token: "x", token_type: "Bearer", expires_in: 0 }]) {
    resetChannelTokens();
    await assert.rejects(mintChannelToken("a", { config, fetchImpl: async () => Response.json(raw) }), /Invalid/);
  }
  await assert.rejects(mintChannelToken("", { config }), /missing/);
  await assert.rejects(mintChannelToken("a", { config: { ...config, enabled: false } }), /missing/);
});
