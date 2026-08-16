import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getS2SConfig,
  mintS2SToken,
  resetS2SCache,
  scopeFor,
  S2SError,
  type FetchLike,
  type S2SConfig,
  type S2SRequest,
} from "./s2s";

// The trust boundary nothing was watching.
//
// ADR-004 names this file as the enforcement point for the billing subject, and
// the reason is that the failure is SILENT: Atlas does not error on a missing
// workspace_id, it skips the quota check and meters usage against a NULL
// workspace, dropping the traffic out of the tenant x workspace pair that is the
// billing subject. Nothing downstream notices. The same file holds cacheKey(),
// which is what keeps one workspace's minted token from being handed to another
// - a dropped field there leaks a tenant-scoped credential sideways.
//
// Both consumers stub the minter in their own tests, so before this file no
// assertion anywhere touched either.

const CFG: S2SConfig = {
  tokenUrl: "https://idp.test/oidc/token",
  clientId: "yucer",
  clientSecret: "s3cret",
  productCode: "yucer",
  enabled: true,
};

const WS = "11111111-1111-1111-1111-111111111111";
const TN = "22222222-2222-2222-2222-222222222222";

function req(over: Partial<S2SRequest> = {}): S2SRequest {
  return { audience: "atlas", mode: "service", workspaceId: WS, tenantId: TN, ...over };
}

/** Records every call and hands back a distinct token each time. */
function idp(opts: { expiresIn?: number; status?: number; body?: unknown } = {}) {
  const calls: Array<{ url: string; params: URLSearchParams }> = [];
  let n = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    n += 1;
    calls.push({ url, params: new URLSearchParams(String(init.body)) });
    if (opts.status && opts.status !== 200) {
      return new Response(typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? {}), {
        status: opts.status,
      });
    }
    return new Response(
      JSON.stringify(
        opts.body ?? { access_token: `tok_${n}`, expires_in: opts.expiresIn ?? 300 },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { fetchImpl, calls };
}

const at = (seconds: number) => () => seconds * 1000;

test.beforeEach(() => resetS2SCache());

// --- Refusing before the wire ----------------------------------------------

test("a missing workspaceId throws before any request is attempted", async () => {
  // The whole point. A token minted without it WORKS, and meters to nobody.
  const { fetchImpl, calls } = idp();
  await assert.rejects(
    () => mintS2SToken(req({ workspaceId: "" }), { config: CFG, fetchImpl }),
    (e: Error) => e instanceof S2SError && /workspace/i.test(e.message),
  );
  assert.equal(calls.length, 0, "no token may be minted at all");
});

test("a missing tenantId throws before any request is attempted", async () => {
  const { fetchImpl, calls } = idp();
  await assert.rejects(
    () => mintS2SToken(req({ tenantId: "" }), { config: CFG, fetchImpl }),
    (e: Error) => e instanceof S2SError && /tenant/i.test(e.message),
  );
  assert.equal(calls.length, 0);
});

test("obo without the member's token throws before any request is attempted", async () => {
  // Exchanging with no subject would silently produce a SERVICE ticket, and the
  // downstream audit would name the product where it should name a person.
  const { fetchImpl, calls } = idp();
  await assert.rejects(
    () => mintS2SToken(req({ mode: "obo" }), { config: CFG, fetchImpl }),
    (e: Error) => e instanceof S2SError && /obo/i.test(e.message),
  );
  assert.equal(calls.length, 0);
});

// --- The claims that are actually posted -----------------------------------

test("the exchange carries every claim both platforms authorize on", async () => {
  const { fetchImpl, calls } = idp();
  await mintS2SToken(req(), { config: CFG, fetchImpl });

  assert.equal(calls[0].url, CFG.tokenUrl);
  const p = calls[0].params;
  assert.equal(p.get("workspace_id"), WS, "the billing subject");
  assert.equal(p.get("tenant_id"), TN);
  assert.equal(p.get("act_sub"), "yucer", "Runos ADR-010 hangs its grants on this");
  assert.equal(p.get("scope"), "tool:atlas");
  assert.equal(p.get("mode"), "service");
  assert.equal(p.get("grant_type"), "urn:ietf:params:oauth:grant-type:token-exchange");
  assert.equal(p.get("requested_token_type"), "urn:ietf:params:oauth:token-type:access_token");
  assert.equal(p.get("client_id"), "yucer");
  assert.equal(p.get("client_secret"), "s3cret");
});

test("act_sub comes from the configured product code, not from the caller", async () => {
  const { fetchImpl, calls } = idp();
  await mintS2SToken(req(), { config: { ...CFG, productCode: "other-product" }, fetchImpl });
  assert.equal(calls[0].params.get("act_sub"), "other-product");
});

test("the scope follows the audience, because both platforms reject a mismatch", async () => {
  assert.equal(scopeFor("atlas"), "tool:atlas");
  assert.equal(scopeFor("runos"), "tool:runos");

  const { fetchImpl, calls } = idp();
  await mintS2SToken(req({ audience: "runos" }), { config: CFG, fetchImpl });
  assert.equal(calls[0].params.get("scope"), "tool:runos");
  assert.equal(calls[0].params.get("audience"), "runos");
});

test("obo adds the subject token; service does not", async () => {
  const { fetchImpl, calls } = idp();
  await mintS2SToken(req({ mode: "obo", subjectToken: "member-jwt" }), { config: CFG, fetchImpl });
  assert.equal(calls[0].params.get("subject_token"), "member-jwt");
  assert.equal(calls[0].params.get("subject_token_type"), "urn:ietf:params:oauth:token-type:access_token");
  assert.equal(calls[0].params.get("mode"), "obo");

  resetS2SCache();
  const svc = idp();
  await mintS2SToken(req(), { config: CFG, fetchImpl: svc.fetchImpl });
  assert.equal(svc.calls[0].params.get("subject_token"), null, "a service ticket carries no subject");
});

// --- The cache must never cross a boundary ---------------------------------

test("an identical repeat inside the window is served from cache", async () => {
  const { fetchImpl, calls } = idp();
  const a = await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_000) });
  const b = await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_010) });
  assert.equal(calls.length, 1, "an IdP round trip in front of every model call is the thing to avoid");
  assert.equal(a.accessToken, b.accessToken);
});

test("two workspaces never share a token", async () => {
  // The leak this key exists to prevent: workspace A's credential handed to B.
  const { fetchImpl, calls } = idp();
  const a = await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_000) });
  const b = await mintS2SToken(req({ workspaceId: "99999999-9999-9999-9999-999999999999" }), {
    config: CFG,
    fetchImpl,
    now: at(1_000),
  });
  assert.equal(calls.length, 2);
  assert.notEqual(a.accessToken, b.accessToken);
});

test("two tenants never share a token", async () => {
  const { fetchImpl, calls } = idp();
  await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_000) });
  await mintS2SToken(req({ tenantId: "99999999-9999-9999-9999-999999999999" }), {
    config: CFG,
    fetchImpl,
    now: at(1_000),
  });
  assert.equal(calls.length, 2);
});

test("the two audiences never share a token", async () => {
  // An atlas ticket presented to Runos is rejected on scope, so sharing one
  // would turn a cache hit into a runtime authorization failure.
  const { fetchImpl, calls } = idp();
  await mintS2SToken(req({ audience: "atlas" }), { config: CFG, fetchImpl, now: at(1_000) });
  await mintS2SToken(req({ audience: "runos" }), { config: CFG, fetchImpl, now: at(1_000) });
  assert.equal(calls.length, 2);
});

test("service and obo never share a token", async () => {
  const { fetchImpl, calls } = idp();
  await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_000) });
  await mintS2SToken(req({ mode: "obo", subjectToken: "member-jwt" }), {
    config: CFG,
    fetchImpl,
    now: at(1_000),
  });
  assert.equal(calls.length, 2);
});

test("two members never share an obo ticket", async () => {
  // The tail is what separates them; two members' tickets colliding would have
  // one person's actions audited as another's.
  const { fetchImpl, calls } = idp();
  await mintS2SToken(req({ mode: "obo", subjectToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaa-member-one" }), {
    config: CFG,
    fetchImpl,
    now: at(1_000),
  });
  await mintS2SToken(req({ mode: "obo", subjectToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaa-member-two" }), {
    config: CFG,
    fetchImpl,
    now: at(1_000),
  });
  assert.equal(calls.length, 2);
});

test("no pair of key fields can be rearranged into the same cache entry", async () => {
  // The key is built from several caller-supplied strings. If it joined them
  // with a delimiter those strings could contain, a tenant/workspace pair could
  // be rearranged to collide - and a collision here hands one workspace's
  // credential to another. Unlikely with platform UUIDs; catastrophic if it
  // ever happened, and free to make impossible.
  const { fetchImpl, calls } = idp();
  await mintS2SToken(req({ tenantId: "a|b", workspaceId: "c" }), {
    config: CFG,
    fetchImpl,
    now: at(1_000),
  });
  await mintS2SToken(req({ tenantId: "a", workspaceId: "b|c" }), {
    config: CFG,
    fetchImpl,
    now: at(1_000),
  });
  assert.equal(calls.length, 2, "these are different workspaces and must not share a token");
});

// --- Expiry ----------------------------------------------------------------

test("a token close to expiry is re-minted rather than handed out", async () => {
  // Serving one that expires in flight produces a 401 from the far side that
  // looks like a configuration problem and is not.
  const { fetchImpl, calls } = idp({ expiresIn: 300 });
  await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_000) });
  // 1300 - 30s skew = usable until 1270.
  await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_269) });
  assert.equal(calls.length, 1, "still comfortably valid");

  await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_271) });
  assert.equal(calls.length, 2, "inside the skew window it must be replaced");
});

test("expiry is computed from the injected clock and the IdP's expires_in", async () => {
  const { fetchImpl } = idp({ expiresIn: 120 });
  const token = await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(5_000) });
  assert.equal(token.expiresAt, 5_120);
});

test("an IdP that omits expires_in gets the documented default", async () => {
  const { fetchImpl } = idp({ body: { access_token: "tok" } });
  const token = await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_000) });
  assert.equal(token.expiresAt, 1_300);
});

test("resetS2SCache actually drops the entries", async () => {
  const { fetchImpl, calls } = idp();
  await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_000) });
  resetS2SCache();
  await mintS2SToken(req(), { config: CFG, fetchImpl, now: at(1_000) });
  assert.equal(calls.length, 2);
});

// --- Failures are reported as themselves -----------------------------------

test("a refused exchange carries the status and the audience", async () => {
  const { fetchImpl } = idp({ status: 401, body: "invalid_client" });
  await assert.rejects(
    () => mintS2SToken(req(), { config: CFG, fetchImpl }),
    (e: Error) =>
      e instanceof S2SError && /401/.test(e.message) && /atlas/.test(e.message) && /invalid_client/.test(e.message),
  );
});

test("an unreachable token endpoint names the URL and keeps the cause", async () => {
  const boom = new Error("ECONNREFUSED");
  const fetchImpl: FetchLike = async () => {
    throw boom;
  };
  await assert.rejects(
    () => mintS2SToken(req(), { config: CFG, fetchImpl }),
    (e: S2SError) => e instanceof S2SError && e.message.includes(CFG.tokenUrl) && e.cause === boom,
  );
});

test("a 200 with no access_token is a failure, not a token", async () => {
  const { fetchImpl } = idp({ body: { token_type: "Bearer" } });
  await assert.rejects(
    () => mintS2SToken(req(), { config: CFG, fetchImpl }),
    (e: Error) => e instanceof S2SError && /access_token/.test(e.message),
  );
});

test("a failed mint is not cached", async () => {
  // Caching a failure would turn one bad moment into a persistent outage.
  const first = idp({ status: 503 });
  await assert.rejects(() => mintS2SToken(req(), { config: CFG, fetchImpl: first.fetchImpl }));

  const second = idp();
  const token = await mintS2SToken(req(), { config: CFG, fetchImpl: second.fetchImpl });
  assert.equal(token.accessToken, "tok_1");
  assert.equal(second.calls.length, 1);
});

// --- Config ----------------------------------------------------------------

test("the token URL is derived from the issuer, with a trailing slash tolerated", () => {
  assert.equal(
    getS2SConfig({ OIDC_ISSUER: "https://accounts.vxture.com/" }).tokenUrl,
    "https://accounts.vxture.com/oidc/token",
  );
  assert.equal(
    getS2SConfig({ S2S_TOKEN_URL: "https://elsewhere.test/token" }).tokenUrl,
    "https://elsewhere.test/token",
  );
});

test("the per-client secret wins over the unsuffixed one", () => {
  // Using the unsuffixed secret against a different client_id yields
  // invalid_client, which reads like an environment problem and is not one.
  const cfg = getS2SConfig({ S2S_CLIENT_SECRET: "specific", OIDC_CLIENT_SECRET: "generic" });
  assert.equal(cfg.clientSecret, "specific");
  assert.equal(getS2SConfig({ OIDC_CLIENT_SECRET: "generic" }).clientSecret, "generic");
});

test("no secret anywhere reports the module as disabled rather than half-working", () => {
  assert.equal(getS2SConfig({}).enabled, false);
  assert.equal(getS2SConfig({ OIDC_CLIENT_SECRET: "x" }).enabled, true);
});
