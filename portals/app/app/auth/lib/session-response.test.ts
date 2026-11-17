import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionResponse } from "./session-response";
import type { OidcConfig } from "./config";
import { toAuthUser } from "./claims";

const cfg = { cookieName: "vx_rp_session" } as OidcConfig;

test("status force-checks centrally with activity false and never leaks tokens", async () => {
  const response = await sessionResponse(cfg, "rp", true, async (_c, _r, options) => {
    assert.deepEqual(options, { activity: false, forceCheck: true });
    return toAuthUser({ sub: "customer", active_workspace: "workspace" });
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.user.sub, "customer");
  assert.doesNotMatch(JSON.stringify(body), /accessToken|refreshToken|idToken|rpsid/);
  assert.match(response.headers.get("cache-control")!, /no-store/);
});

test("an old invalid probe never clears a newer sign-in cookie", async () => {
  const response = await sessionResponse(cfg, "rp", true, async () => null);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(response.headers.get("set-cookie"), null);
});

test("central unavailability returns retryable 503 and retains cookie for recovery", async () => {
  const response = await sessionResponse(cfg, "rp", true, async () => { throw new Error("central down"); });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { authenticated: null, code: "SESSION_STATUS_UNAVAILABLE", retryable: true });
  assert.equal(response.cookies.get(cfg.cookieName), undefined);
});
