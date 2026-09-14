import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET, runPlatformCheck } from "./route";

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
