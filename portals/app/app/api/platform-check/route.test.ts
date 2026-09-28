import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "./route";
import { liveIdentityFrom, runPlatformCheck } from "./check";

// The self-proof surface, offline: with nothing configured every probe must
// say so without touching the network, and the gate must behave like
// /api/status's. The live probes are what the endpoint is FOR and are
// exercised on the deployed stack, not here.

const KEYS = [
  "STATUS_PAGE", "OIDC_RP_ENABLED", "PLATFORM_API_URL", "PLATFORM_INTERNAL_AUTH_TOKEN",
  "PROVISION_WEBHOOK_SECRET", "PROVISION_WEBHOOK_SECRET_NEXT", "OIDC_CLIENT_SECRET", "S2S_CLIENT_SECRET",
  "ATLAS_BASE_URL", "RUNOS_BASE_URL", "ARDA_BASE_URL",
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function bare(): void {
  for (const k of KEYS) delete process.env[k];
}

test("STATUS_PAGE=off is indistinguishable from a missing route", async () => {
  bare();
  process.env.STATUS_PAGE = "off";
  const res = await GET();
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "PLATFORM_CHECK_NOT_FOUND");
});

test("authed mode without a session is refused with the envelope, not a redirect", async () => {
  bare();
  process.env.STATUS_PAGE = "authed";
  const res = await GET();
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { code: string }).code, "PLATFORM_CHECK_NOT_AUTHENTICATED");
});

test("with nothing configured every probe reports not-configured and names what is missing", async () => {
  bare();
  const check = await runPlatformCheck(null);
  for (const [name, probe] of [
    ["c1", check.c1], ["c2", check.c2], ["c3Up", check.c3Up], ["c3Down", check.c3Down],
    ["tokenMint", check.tokenMint], ["atlas", check.planes.atlas], ["runos", check.planes.runos], ["arda", check.planes.arda],
    ["c3Replay", check.c3Replay],
  ] as const) {
    assert.equal(probe.configured, false, `${name} must be unconfigured`);
    assert.equal(probe.ok, false, `${name} must not claim ok`);
    assert.ok(probe.detail.length > 0, `${name} must say what is missing`);
  }
});

test("the C3-down self-test runs offline once a secret is present, and rejects a tampered body", async () => {
  bare();
  process.env.PROVISION_WEBHOOK_SECRET = "probe-secret";
  const check = await runPlatformCheck(null);
  assert.equal(check.c3Down.configured, true);
  assert.equal(check.c3Down.ok, true);
  assert.match(check.c3Down.detail, /self-test passed, tamper rejection passed/);
});

test("the C2 probe asks for a session rather than guessing a workspace", async () => {
  bare();
  process.env.PLATFORM_API_URL = "https://platform.internal";
  process.env.PLATFORM_INTERNAL_AUTH_TOKEN = "t";
  const check = await runPlatformCheck(null);
  assert.equal(check.c2.configured, true);
  assert.equal(check.c2.ok, false);
  assert.match(check.c2.detail, /sign in/);
});

function post(body: unknown): Request {
  return new Request("https://yucer.vxture.com/api/platform-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("the replay probe is the only spending probe, and it is refused offline in order: off, unknown, unconfigured", async () => {
  bare();
  process.env.STATUS_PAGE = "off";
  assert.equal((await POST(post({ probe: "c3-replay" }))).status, 404);
  delete process.env.STATUS_PAGE;
  const unknown = await POST(post({ probe: "anything-else" }));
  assert.equal(unknown.status, 400);
  assert.equal(((await unknown.json()) as { code: string }).code, "PLATFORM_CHECK_UNKNOWN_PROBE");
  const unconfigured = await POST(post({ probe: "c3-replay" }));
  assert.equal(unconfigured.status, 503);
  assert.equal(((await unconfigured.json()) as { code: string; retryable: boolean }).code, "PLATFORM_CHECK_NOT_CONFIGURED");
});

// --- The live probes (2026-09-28), against a stubbed network -----------------

import { resetS2SCache } from "../../platform/s2s";

function stubFetch(handler: (url: string) => { status: number; body: unknown }) {
  const original = globalThis.fetch;
  const seen: string[] = [];
  const bodies: Array<{ url: string; body: string; headers: Headers }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    seen.push(url);
    bodies.push({ url, body: String(init?.body ?? ""), headers: new Headers(init?.headers) });
    const { status, body } = handler(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { seen, bodies, restore: () => (globalThis.fetch = original) };
}

const LIVE = { workspaceId: "ws_live", tenantId: "org_live", subjectToken: "member-access-token" };

test("signed in: the exchange runs for both planes and Atlas answers an authenticated model list", async () => {
  bare();
  resetS2SCache();
  process.env.OIDC_CLIENT_SECRET = "s";
  process.env.ATLAS_BASE_URL = "http://atlas.test:3100";
  process.env.RUNOS_BASE_URL = "http://runos.test:3120";
  const net = stubFetch((url) =>
    url.endsWith("/oidc/token")
      ? { status: 200, body: { access_token: "tok", token_type: "Bearer", expires_in: 300 } }
      : url.endsWith("/v1/models")
        ? { status: 200, body: { data: [{ modelCode: "m1" }, { modelCode: "m2" }] } }
        : url.endsWith("/v1/mcp")
          ? { status: 200, body: { jsonrpc: "2.0", id: 1, result: { structuredContent: { capabilities: [] } } } }
          : { status: 404, body: {} },
  );
  try {
    const check = await runPlatformCheck("ws_live", LIVE);
    assert.equal(check.tokenMint.ok, true);
    assert.match(check.tokenMint.detail, /atlas: minted.*runos: minted/);
    assert.equal(check.planes.atlas.ok, true);
    assert.match(check.planes.atlas.detail, /answered 200 - 2 model\(s\)/);
    assert.ok(net.seen.some((u) => u === "http://atlas.test:3100/v1/models"));
    // Runos gets the turn's own shape: a non-empty query and a limit.
    const mcp = JSON.parse(net.bodies.find((b) => b.url.endsWith("/v1/mcp"))!.body);
    assert.equal(mcp.params.arguments.query, "sales");
    assert.equal(mcp.params.arguments.limit, 20);
    // An empty Runos catalog is a normal answer, and says so.
    assert.equal(check.planes.runos.ok, true);
    assert.match(check.planes.runos.detail, /0 capabilities granted to yucer \(an empty catalog is a normal answer\)/);
  } finally {
    net.restore();
  }
});

test("signed in: a refused Atlas call reports its status and code, not just 'reachable'", async () => {
  bare();
  resetS2SCache();
  process.env.OIDC_CLIENT_SECRET = "s";
  process.env.ATLAS_BASE_URL = "http://atlas.test:3100";
  process.env.RUNOS_BASE_URL = "http://runos.test:3120";
  const net = stubFetch((url) =>
    url.endsWith("/oidc/token")
      ? { status: 200, body: { access_token: "tok", token_type: "Bearer", expires_in: 300 } }
      : url.endsWith("/v1/models")
        ? { status: 403, body: { code: "GRANT_DENIED", message: "no grant", retryable: false } }
        : { status: 500, body: { code: "INTERNAL", message: "down" } },
  );
  try {
    const check = await runPlatformCheck("ws_live", LIVE);
    assert.equal(check.planes.atlas.ok, false);
    assert.match(check.planes.atlas.detail, /HTTP 403 · GRANT_DENIED/);
    assert.equal(check.planes.runos.ok, false);
    assert.match(check.planes.runos.detail, /authenticated runos_discover failed/);
  } finally {
    net.restore();
  }
});

test("a session mints only with an access token and an active tenant", () => {
  assert.deepEqual(liveIdentityFrom({ workspaceId: "w", tenantId: "t", accessToken: "a" }), { workspaceId: "w", tenantId: "t", subjectToken: "a" });
  assert.equal(liveIdentityFrom({ workspaceId: "w", tenantId: null, accessToken: "a" }), null);
  assert.equal(liveIdentityFrom({ workspaceId: "w", tenantId: "t", accessToken: null }), null);
});

test("the Atlas live-call probe sends a UUID applicationId - Atlas casts it for its grant lookup", async () => {
  bare();
  resetS2SCache();
  process.env.OIDC_CLIENT_SECRET = "s";
  process.env.ATLAS_BASE_URL = "http://atlas.test:3100";
  const net = stubFetch((url) =>
    url.endsWith("/oidc/token")
      ? { status: 200, body: { access_token: "tok", token_type: "Bearer", expires_in: 300 } }
      : url.endsWith("/v1/chat")
        ? {
            status: 200,
            body: { id: "c", modelCode: "m1", message: { role: "assistant", content: "pong" }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, latencyMs: 5 },
          }
        : { status: 404, body: {} },
  );
  try {
    const { runAtlasProbe } = await import("./check");
    const r = await runAtlasProbe("ws_live", "org_live");
    assert.equal(r.ok, true);
    const sent = JSON.parse(net.bodies.find((b) => b.url.endsWith("/v1/chat"))!.body);
    assert.match(sent.applicationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  } finally {
    net.restore();
  }
});
