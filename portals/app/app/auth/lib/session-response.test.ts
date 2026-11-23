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


test("foreground context POST opts in to refresh without changing background GET semantics", async () => {
  const response = await sessionResponse(cfg, "rp", true, async (_c, _r, options) => {
    assert.deepEqual(options, { activity: false, forceCheck: true, syncContext: true });
    return toAuthUser({ sub: "customer", active_workspace: "current" });
  }, true);
  assert.equal((await response.json()).user.activeWorkspace, "current");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("probe returns current admission without exposing roster or local roles", async () => {
  for (const state of ["ready", "unassigned", "no-roles", "unavailable"] as const) {
    const response = await sessionResponse(cfg, "rp", true, async () => toAuthUser({ sub: "customer", active_workspace: "workspace" }), false, async () => ({ state, revision: "opaque" }));
    const body = await response.json(); assert.equal(body.authenticated, true); assert.equal(body.productAccess, state); assert.equal(body.accessRevision, "opaque"); assert.equal(body.members, undefined); assert.equal(body.authz, undefined);
  }
});
