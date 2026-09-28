import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInteractionRequired,
  shouldTrySilentSso,
  silentErrorOutcome,
  ssoAttemptCookieName,
  ssoAttemptCookieOptions,
} from "./sso";

const visit = {
  method: "GET",
  pathname: "/",
  enabled: true,
  hasSession: false,
  triedRecently: false,
  justSignedOut: false,
  fetchMode: "navigate",
  isRscOrPrefetch: false,
};

test("a session-less page visit starts a silent attempt", () => {
  assert.equal(shouldTrySilentSso(visit), true);
  assert.equal(shouldTrySilentSso({ ...visit, pathname: "/pipeline/opp_1" }), true);
  // An older browser that sends no Sec-Fetch-Mode is still a navigation.
  assert.equal(shouldTrySilentSso({ ...visit, fetchMode: null }), true);
});

test("no attempt with a session, after one attempt, or straight after sign-out", () => {
  assert.equal(shouldTrySilentSso({ ...visit, hasSession: true }), false);
  assert.equal(shouldTrySilentSso({ ...visit, triedRecently: true }), false);
  assert.equal(shouldTrySilentSso({ ...visit, justSignedOut: true }), false);
  assert.equal(shouldTrySilentSso({ ...visit, enabled: false }), false);
});

test("only top-level page navigations - never fetches, RSC, prefetch or POST", () => {
  assert.equal(shouldTrySilentSso({ ...visit, method: "POST" }), false);
  assert.equal(shouldTrySilentSso({ ...visit, fetchMode: "cors" }), false);
  assert.equal(shouldTrySilentSso({ ...visit, isRscOrPrefetch: true }), false);
});

test("never the login round trip, route handlers, build output or files", () => {
  for (const pathname of ["/auth/login", "/auth", "/api/status", "/api/auth/oidc/callback", "/_next/static/x.js", "/assets/logo.svg", "/favicon.ico"]) {
    assert.equal(shouldTrySilentSso({ ...visit, pathname }), false, pathname);
  }
  // A page whose name merely starts with the same letters is still a page.
  assert.equal(shouldTrySilentSso({ ...visit, pathname: "/authz-audit" }), true);
});

test("login_required on a silent handshake returns to the page; anything else rejects", () => {
  assert.equal(silentErrorOutcome("login_required", { silent: true }), "return");
  assert.equal(silentErrorOutcome("interaction_required", { silent: true }), "return");
  // The same answer to a handshake the visitor started by hand is a failure.
  assert.equal(silentErrorOutcome("login_required", {}), "reject");
  assert.equal(silentErrorOutcome("login_required", null), "reject");
  assert.equal(silentErrorOutcome("access_denied", { silent: true }), "reject");
  assert.equal(isInteractionRequired("server_error"), false);
});

test("the marker is host-prefixed exactly when the session cookie is", () => {
  assert.equal(ssoAttemptCookieName("__Host-vx_rp_session"), "__Host-yucer_sso_tried");
  assert.equal(ssoAttemptCookieName("vx_rp_session"), "yucer_sso_tried");
  assert.equal(ssoAttemptCookieOptions("__Host-vx_rp_session").secure, true);
  assert.equal(ssoAttemptCookieOptions("vx_rp_session", 0).maxAge, 0);
});
