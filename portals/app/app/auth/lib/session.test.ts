import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSession, type SessionDeps } from "./session";
import { authDropSnapshot } from "./auth-failures";
import type { RpSession } from "./session-store";
import type { OidcConfig } from "./config";
import type { TokenSet } from "./oidc";

// The refresh half of getAuthSession, against an IdP that ROTATES refresh
// tokens the way the platform does: every refresh token works exactly once, and
// presenting a spent one is invalid_grant - and, on the real platform, revokes
// the whole chain, so a replay is never survivable.
//
// The defects these pin, all reported as "idle about 10 minutes, then the page
// stops working, and sign-in goes straight back in" (2026-09-29):
//   - several requests resolving one expired session at once, each presenting
//     the same refresh token (#517);
//   - a request that read the session BEFORE another's refresh landed and
//     arrived AFTER it finished, refreshing with the token just spent;
//   - a token whose `exp` is earlier than the session's bookkeeping said.

const cfg = { clientId: "yucer", sessionTtlSeconds: 60 } as OidcConfig;
const now = () => Math.floor(Date.now() / 1000);

function rotatingIdp(opts: { latencyMs?: number } = {}) {
  let live = "rt-0";
  let issued = 0;
  const calls: string[] = [];
  const refresh = async (_cfg: OidcConfig, rt: string): Promise<TokenSet> => {
    calls.push(rt);
    await new Promise((r) => setTimeout(r, opts.latencyMs ?? 20));
    if (rt !== live) throw new Error("token endpoint 400: invalid_grant");
    issued += 1;
    live = `rt-${issued}`;
    return { access_token: `at-${issued}`, refresh_token: live, token_type: "Bearer", expires_in: 300 };
  };
  return { refresh, calls };
}

function memoryStore(initial: RpSession) {
  const map = new Map<string, RpSession>([["yucer:rpsid-1", initial]]);
  return {
    getSession: async (cid: string, rpsid: string) => map.get(`${cid}:${rpsid}`) ?? null,
    putSession: async (cid: string, rpsid: string, data: RpSession) => {
      map.set(`${cid}:${rpsid}`, data);
    },
    deleteSession: async (cid: string, rpsid: string) => {
      map.delete(`${cid}:${rpsid}`);
    },
    peek: () => map.get("yucer:rpsid-1")!,
    remove: () => map.delete("yucer:rpsid-1"),
  };
}

function expired(): RpSession {
  return { idToken: "id", accessToken: "at-0", refreshToken: "rt-0", accessExpiresAt: now() - 5, sub: "u1" };
}

/** A verifier that accepts every token except the ones it is told are expired. */
function verifier(expiredTokens: Set<string> = new Set()) {
  return (async (token: string) => {
    if (expiredTokens.has(token)) throw Object.assign(new Error('"exp" claim timestamp check failed'), { code: "ERR_JWT_EXPIRED" });
    return { sub: "u1" };
  }) as unknown as SessionDeps["verifyToken"];
}

function deps(
  store: ReturnType<typeof memoryStore>,
  idp: ReturnType<typeof rotatingIdp>,
  verifyToken = verifier(),
): SessionDeps {
  return {
    getSession: store.getSession,
    putSession: store.putSession,
    deleteSession: store.deleteSession,
    refreshTokens: idp.refresh,
    verifyToken,
  };
}

const counts = () => authDropSnapshot().counts;

test("concurrent resolutions of an expired session refresh ONCE and all succeed", async () => {
  const store = memoryStore(expired());
  const idp = rotatingIdp();
  const d = deps(store, idp);

  const results = await Promise.all([1, 2, 3, 4].map(() => resolveSession(cfg, "rpsid-1", d)));

  assert.deepEqual(idp.calls, ["rt-0"], "exactly one refresh reaches the IdP");
  for (const r of results) assert.equal(r?.session.accessToken, "at-1");
  assert.equal(store.peek().refreshToken, "rt-1", "the rotated token is what is stored");
});

test("a request that read the session BEFORE a refresh and arrives AFTER it must not replay the spent token", async () => {
  const store = memoryStore(expired());
  const idp = rotatingIdp();
  const stale = expired(); // what the slow request read earlier
  const first = await resolveSession(cfg, "rpsid-1", deps(store, idp));
  assert.equal(first?.session.accessToken, "at-1");

  let firstRead = true;
  const late: SessionDeps = {
    ...deps(store, idp),
    getSession: async (cid, rpsid) => {
      if (firstRead) {
        firstRead = false;
        return stale;
      }
      return store.getSession(cid, rpsid);
    },
  };
  const r = await resolveSession(cfg, "rpsid-1", late);

  assert.equal(r?.session.accessToken, "at-1", "it takes the session the first refresh stored");
  assert.deepEqual(idp.calls, ["rt-0"], "and never presents rt-0 a second time - on the platform that revokes the chain");
});

test("a request that lost the race to another process reads the rotated session instead of failing", async () => {
  const store = memoryStore(expired());
  const idp = rotatingIdp();
  // Another replica rotates rt-0 -> rt-1 while THIS process is mid-refresh.
  const other: SessionDeps = {
    ...deps(store, idp),
    refreshTokens: async (c, rt) => {
      await idp.refresh(c, rt);
      await store.putSession("yucer", "rpsid-1", {
        ...expired(), accessToken: "at-other", refreshToken: "rt-1", accessExpiresAt: now() + 300,
      });
      throw new Error("token endpoint 400: invalid_grant"); // this process's own attempt is the loser
    },
  };
  const r = await resolveSession(cfg, "rpsid-1", other);
  assert.equal(r?.session.accessToken, "at-other");
});

test("a refresh the IdP genuinely rejects ends the session, and the reason is recorded", async () => {
  const before = counts().refresh_failed;
  const store = memoryStore({ ...expired(), refreshToken: "rt-revoked" });
  const r = await resolveSession(cfg, "rpsid-1", deps(store, rotatingIdp()));
  assert.equal(r, null);
  assert.equal(counts().refresh_failed, before + 1);
  assert.match(authDropSnapshot().last?.detail ?? "", /invalid_grant/);
});

test("a session that is not near expiry is returned without a refresh", async () => {
  const store = memoryStore({ ...expired(), accessExpiresAt: now() + 600 });
  const idp = rotatingIdp();
  const r = await resolveSession(cfg, "rpsid-1", deps(store, idp));
  assert.equal(r?.session.accessToken, "at-0");
  assert.deepEqual(idp.calls, []);
});

test("the flight is released, so the next expiry refreshes again", async () => {
  const store = memoryStore(expired());
  const idp = rotatingIdp({ latencyMs: 1 });
  const d = deps(store, idp);
  await resolveSession(cfg, "rpsid-1", d);
  await store.putSession("yucer", "rpsid-1", { ...store.peek(), accessExpiresAt: now() - 5 });
  const r = await resolveSession(cfg, "rpsid-1", d);
  assert.equal(r?.session.accessToken, "at-2");
  assert.deepEqual(idp.calls, ["rt-0", "rt-1"]);
});

test("a token the verifier calls EXPIRED while the session's clock says fine is refreshed once, not dropped", async () => {
  // The bookkeeping says 10 more minutes; the token's own `exp` says it is over.
  const store = memoryStore({ ...expired(), accessExpiresAt: now() + 600 });
  const idp = rotatingIdp();
  const r = await resolveSession(cfg, "rpsid-1", deps(store, idp, verifier(new Set(["at-0"]))));
  assert.equal(r?.session.accessToken, "at-1");
  assert.deepEqual(idp.calls, ["rt-0"], "one refresh, and only one");
});

test("an expired token with no refresh token ends the session, recorded as token_invalid", async () => {
  const before = counts().token_invalid;
  const store = memoryStore({ ...expired(), refreshToken: undefined, accessExpiresAt: now() + 600 });
  const r = await resolveSession(cfg, "rpsid-1", deps(store, rotatingIdp(), verifier(new Set(["at-0"]))));
  assert.equal(r, null);
  assert.equal(counts().token_invalid, before + 1);
});

test("a session missing from the store is recorded as no_session", async () => {
  const before = counts().no_session;
  const store = memoryStore(expired());
  store.remove();
  assert.equal(await resolveSession(cfg, "rpsid-1", deps(store, rotatingIdp())), null);
  assert.equal(counts().no_session, before + 1);
});

test("a refresh the IdP explicitly refuses removes the dead session, so it is not replayed on every request", async () => {
  const store = memoryStore({ ...expired(), refreshToken: "rt-revoked" });
  const idp = rotatingIdp();
  const d = deps(store, idp);
  assert.equal(await resolveSession(cfg, "rpsid-1", d), null);
  assert.equal(await store.getSession("yucer", "rpsid-1"), null, "gone from the store");
  // The next request finds nothing and never reaches the IdP.
  assert.equal(await resolveSession(cfg, "rpsid-1", d), null);
  assert.deepEqual(idp.calls, ["rt-revoked"], "presented once, not once per request");
});

test("a refresh that fails for a NETWORK reason keeps the session - it says nothing about the token", async () => {
  const store = memoryStore(expired());
  const d: SessionDeps = { ...deps(store, rotatingIdp()), refreshTokens: async () => { throw new Error("fetch failed"); } };
  assert.equal(await resolveSession(cfg, "rpsid-1", d), null);
  assert.equal((await store.getSession("yucer", "rpsid-1"))?.refreshToken, "rt-0", "still there for the next try");
});
