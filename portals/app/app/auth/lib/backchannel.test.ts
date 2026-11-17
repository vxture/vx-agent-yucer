import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import { backchannelResponse } from "./backchannel";
import { verifyToken } from "./oidc";
import type { OidcConfig } from "./config";

const cfg = { clientId: "yucer", issuer: "https://accounts.example.test", sessionTtlSeconds: 3600 } as OidcConfig;
const event = "http://schemas.openid.net/event/backchannel-logout";
const claims = { sid: "test-sid", jti: "test-jti", iat: Math.floor(Date.now() / 1000), events: { [event]: {} } };
const request = () => new Request("https://yucer.example.test/auth/backchannel-logout", {
  method: "POST", body: new URLSearchParams({ logout_token: "test-token" }),
});

test("a failed notification is retryable; repeated valid deliveries still revoke all matching RP sessions", async () => {
  let fail = true;
  const calls: string[] = [];
  const deps = {
    verifyToken: async () => claims,
    revokeSid: async (client: string, sid: string, ttl: number) => {
      assert.equal(client, cfg.clientId); assert.equal(ttl, cfg.sessionTtlSeconds);
      if (fail) throw new Error("redis down");
      calls.push(sid);
    },
  };
  assert.equal((await backchannelResponse(request(), cfg, deps)).status, 503);
  fail = false;
  assert.equal((await backchannelResponse(request(), cfg, deps)).status, 200);
  assert.equal((await backchannelResponse(request(), cfg, deps)).status, 200);
  assert.deepEqual(calls, ["test-sid", "test-sid"]);
});

test("malformed logout claims never revoke a session", async () => {
  for (const change of [{ nonce: "unexpected" }, { sid: undefined }, { jti: undefined }, { iat: undefined }, { iat: Date.now() / 1000 + 600 }, { events: {} }, { events: { [event]: "invalid" } }]) {
    const response = await backchannelResponse(request(), cfg, {
      verifyToken: async () => ({ ...claims, ...change }),
      revokeSid: async () => { assert.fail("invalid notification must not mutate sessions"); },
    });
    assert.equal(response.status, 400);
  }
});

test("real signed notifications enforce issuer, product audience and RS256 verification", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  for (const audience of ["yucer", "different-product"]) {
    const token = await new SignJWT(claims).setProtectedHeader({ alg: "RS256" }).setIssuer(cfg.issuer)
      .setAudience(audience).setExpirationTime("2m").sign(privateKey);
    let revoked = false;
    const response = await backchannelResponse(new Request("https://yucer.example.test/auth/backchannel-logout", {
      method: "POST", body: new URLSearchParams({ logout_token: token }),
    }), cfg, {
      verifyToken: (value, config) => verifyToken(value, config, { keyResolver: publicKey }),
      revokeSid: async () => { revoked = true; },
    });
    assert.equal(response.status, audience === "yucer" ? 200 : 400);
    assert.equal(revoked, audience === "yucer");
  }
});
