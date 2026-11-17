import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { logoutResponse, SWITCH_COOKIE } from "./logout";
import type { OidcConfig } from "./config";
import type { RpSession } from "./session-store";

const cfg = {
  clientId: "yucer", cookieName: "__Host-vx_rp_session",
  endSessionUrl: "https://accounts.example.test/oidc/end_session",
  postLogoutRedirectUri: "https://yucer.example.test/",
} as OidcConfig;

function store() {
  let current = { idToken: "test-only-id" } as RpSession | null;
  return {
    getSession: async () => current,
    deleteSession: async () => { current = null; },
    peek: () => current,
  };
}

test("logout returns 303, destroys the local session and clears the browser cookie", async () => {
  const deps = store();
  const response = await logoutResponse(cfg, "old-rp", undefined, deps);
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.pathname, "/oidc/end_session");
  assert.equal(location.searchParams.get("client_id"), "yucer");
  assert.equal(location.searchParams.get("post_logout_redirect_uri"), cfg.postLogoutRedirectUri);
  assert.equal(location.searchParams.get("id_token_hint"), "test-only-id");
  assert.equal(response.cookies.get(cfg.cookieName)?.value, "");
  assert.equal(deps.peek(), null);
  assert.match(response.headers.get("cache-control")!, /no-store/);
});

test("repeated logout still navigates centrally without a local token", async () => {
  const deps = store();
  await logoutResponse(cfg, "old-rp", undefined, deps);
  const repeated = await logoutResponse(cfg, "old-rp", undefined, deps);
  assert.equal(repeated.status, 303);
  assert.equal(new URL(repeated.headers.get("location")!).searchParams.has("id_token_hint"), false);
});

test("account switching logs out before setting a same-origin login continuation", async () => {
  const deps = store();
  const response = await logoutResponse(cfg, "old-rp", "/pipeline", deps);
  assert.equal(response.status, 303);
  assert.equal(response.cookies.get(SWITCH_COOKIE)?.value, "/pipeline");
  assert.equal(deps.peek(), null);
  const unsafe = await logoutResponse(cfg, undefined, "https://untrusted.example", deps);
  assert.equal(unsafe.cookies.get(SWITCH_COOKIE)?.value, "/");
});

test("a store outage cannot prevent the browser from reaching central logout", async () => {
  const response = await logoutResponse(cfg, "old-rp", undefined, {
    getSession: async () => { throw new Error("store down"); },
    deleteSession: async () => { throw new Error("store down"); },
  });
  assert.equal(response.status, 303);
  assert.equal(response.cookies.get(cfg.cookieName)?.value, "");
});

test("following the logout POST 303 really requests end_session with GET", async () => {
  const seen: string[] = [];
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith("/oidc/end_session")) {
      seen.push(req.method!); res.end("central logout reached"); return;
    }
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const response = await logoutResponse({ ...cfg, endSessionUrl: `${origin}/oidc/end_session` }, undefined, undefined, store());
    res.writeHead(response.status, { location: response.headers.get("location")! }); res.end();
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/auth/logout`, { method: "POST" });
    assert.equal(await response.text(), "central logout reached");
    assert.deepEqual(seen, ["GET"]);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
