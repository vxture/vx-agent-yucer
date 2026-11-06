import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { SIGNED_OUT_COOKIE } from "./auth/lib/signed-out-marker";
import { ssoAttemptCookieName } from "./auth/lib/sso";

const keys = ["OIDC_RP_ENABLED", "NEXT_PUBLIC_APP_URL", "RP_SESSION_COOKIE_NAME"] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
beforeEach(() => {
  process.env.OIDC_RP_ENABLED = "on";
  process.env.NEXT_PUBLIC_APP_URL = "https://yucer.example";
  process.env.RP_SESSION_COOKIE_NAME = "__Host-test_session";
});
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function visit(headers: Record<string, string> = {}) {
  return new NextRequest("https://internal.example/pipeline?period=2026", {
    headers: { "sec-fetch-mode": "navigate", ...headers },
  });
}

test("a sessionless page redirects once to the configured public origin with its return path", () => {
  const response = proxy(visit());
  const target = new URL(response.headers.get("location")!);
  assert.equal(target.origin, "https://yucer.example");
  assert.equal(target.pathname, "/auth/login");
  assert.equal(target.searchParams.get("silent"), "1");
  assert.equal(target.searchParams.get("returnTo"), "/pipeline?period=2026");
  const marker = response.cookies.get(ssoAttemptCookieName("__Host-test_session"));
  assert.equal(marker?.value, "1");
  assert.equal(marker?.secure, true);
  assert.equal(marker?.httpOnly, true);
  assert.equal(marker?.maxAge, 600);
});

test("session, attempted SSO and explicit sign-out cookies each suppress another redirect", () => {
  for (const cookie of ["__Host-test_session=present", `${ssoAttemptCookieName("__Host-test_session")}=1`, `${SIGNED_OUT_COOKIE}=1`]) {
    const response = proxy(visit({ cookie }));
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  }
});

test("disabled SSO and background requests pass through", () => {
  const background: Record<string, string>[] = [{ "sec-fetch-mode": "cors" }, { rsc: "1" }, { "next-router-prefetch": "1" }, { purpose: "prefetch" }];
  for (const headers of background) {
    assert.equal(proxy(visit(headers)).headers.get("location"), null);
  }
  process.env.OIDC_RP_ENABLED = "off";
  assert.equal(proxy(visit()).headers.get("location"), null);
});

test("without a configured origin a local visit retains its own host", () => {
  process.env.NEXT_PUBLIC_APP_URL = "";
  assert.equal(new URL(proxy(visit()).headers.get("location")!).origin, "https://internal.example");
});
