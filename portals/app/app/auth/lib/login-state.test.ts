import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessTokenFor,
  accountsStatusAuthority,
  grantAuthority,
  LoginStateUnavailableError,
  resolveLoginState,
  type LoginAuthority,
  type LoginStateDeps,
} from "./login-state";
import { authDropSnapshot } from "./auth-failures";
import type { RpSession } from "./session-store";
import type { OidcConfig } from "./config";
import type { TokenSet } from "./oidc";
import { toAuthUser } from "./claims";

// The product's one login state (owner rulings, 2026-09-29), pinned rule by
// rule: accounts is the only authority; one checker; asked on activity only;
// the state ends only when accounts says so; a token that cannot be had
// affects that call and nothing else.

const cfg = { clientId: "yucer", clientSecret: "s", sessionTtlSeconds: 60 } as OidcConfig;
const NOW = 1_800_000_000;
const CLAIMS = { sub: "u1", active_workspace: "ws-1", name: "Tester" };

/** An IdP that rotates refresh tokens and revokes on replay, like the platform. */
function rotatingIdp(opts: { latencyMs?: number; fail?: "refuse" | "network" } = {}) {
  let live = "rt-0";
  let issued = 0;
  const calls: string[] = [];
  const refreshTokens = async (_c: OidcConfig, rt: string): Promise<TokenSet> => {
    calls.push(rt);
    await new Promise((r) => setTimeout(r, opts.latencyMs ?? 15));
    if (opts.fail === "network") throw new Error("fetch failed");
    if (opts.fail === "refuse" || rt !== live) throw new Error("token endpoint 400: invalid_grant");
    issued += 1;
    live = `rt-${issued}`;
    return { access_token: `at-${issued}`, refresh_token: live, token_type: "Bearer", expires_in: 300 };
  };
  const verifyToken = (async () => ({ ...CLAIMS })) as never;
  return { calls, refreshTokens, verifyToken };
}

function world(record: RpSession | null, authorityOf: (now: () => number) => LoginAuthority) {
  const map = new Map<string, RpSession>();
  if (record) map.set("r1", record);
  let locked = false;
  let clock = NOW;
  const now = () => clock;
  const deps: LoginStateDeps = {
    getSession: async (_c, id) => map.get(id) ?? null,
    updateSession: async (_c, id, before, data) => {
      if (JSON.stringify(map.get(id)) !== JSON.stringify(before)) return false;
      map.set(id, data); return true;
    },
    deleteSession: async (_c, id, expected) => {
      if (!expected || (locked && JSON.stringify(map.get(id)) === JSON.stringify(expected.session))) map.delete(id);
    },
    acquireCheckLock: async () => locked ? null : (locked = true, "lease"),
    releaseCheckLock: async () => void (locked = false),
    authority: authorityOf(now),
    now,
  };
  return {
    deps,
    peek: () => map.get("r1") ?? null,
    advance: (s: number) => void (clock += s),
    hold: () => void (locked = true),
    release: () => void (locked = false),
  };
}

/** A logged-in record whose check falls due in `inSeconds`. */
function record(inSeconds: number, extra: Partial<RpSession> = {}): RpSession {
  return {
    idToken: "id", accessToken: "at-0", refreshToken: "rt-0", sub: "u1", sid: "sid-1",
    accessExpiresAt: NOW + inSeconds, nextCheckAt: NOW + inSeconds, claims: { ...CLAIMS }, ...extra,
  };
}

const counts = () => authDropSnapshot().counts;

test("token renewal preserves platform organization presentation and the actual workspace context", async () => {
  const idp = rotatingIdp();
  const renewedClaims = {
    ...CLAIMS,
    active_org: "org-next",
    active_org_name: "Acme Holdings Limited",
    active_org_display_name: "Acme",
    active_org_logo_url: "https://accounts.example.test/logo?v=2",
    active_workspace: "workspace-next",
    active_workspace_name: "Regional Sales",
  };
  const w = world(record(-5), (now) => grantAuthority({
    ...idp,
    verifyToken: (async () => renewedClaims) as never,
  }, now));
  const state = await resolveLoginState(cfg, "r1", { activity: true }, w.deps);
  assert.ok(state);
  const user = toAuthUser(state.claims);
  assert.equal(user.activeOrgName, "Acme Holdings Limited");
  assert.equal(user.activeOrgDisplayName, "Acme");
  assert.equal(user.activeOrgLogoUrl, "https://accounts.example.test/logo?v=2");
  assert.equal(user.activeOrg, "org-next");
  assert.equal(user.activeWorkspace, "workspace-next");
  assert.equal(user.activeWorkspaceName, "Regional Sales");
});

test("many sections resolving at once, check due: accounts is asked ONCE and nobody is signed out", async () => {
  const idp = rotatingIdp();
  const w = world(record(-5), (now) => grantAuthority(idp, now));
  const results = await Promise.all(
    Array.from({ length: 8 }, () => resolveLoginState(cfg, "r1", { activity: true }, w.deps)),
  );
  assert.deepEqual(idp.calls, ["rt-0"], "one checker, one question - never a replay");
  for (const r of results) assert.equal(r?.claims.sub, "u1", "every section still sees the member");
  assert.equal(w.peek()?.refreshToken, "rt-1");
});

test("a check that is not due asks nothing", async () => {
  const idp = rotatingIdp();
  const w = world(record(600), (now) => grantAuthority(idp, now));
  assert.equal((await resolveLoginState(cfg, "r1", { activity: true }, w.deps))?.claims.sub, "u1");
  assert.deepEqual(idp.calls, []);
});

test("a due background probe asks Accounts with active:false without renewing tokens", async () => {
  const seen: unknown[] = [];
  const idp = rotatingIdp();
  const w = world(record(-5), (now) => accountsStatusAuthority("u", {
    ...idp, fetch: statusFetch({ body: { valid: true, next_check_at: NOW + 300 } }, seen),
  }, now));
  assert.equal((await resolveLoginState(cfg, "r1", { activity: false }, w.deps))?.claims.sub, "u1");
  assert.deepEqual(idp.calls, [], "an open tab must not keep the login alive by itself");
  assert.deepEqual(seen, [{ sid: "sid-1", active: false }]);
});

test("a protected request waits for the existing check rather than accepting an unchecked record", async () => {
  const idp = rotatingIdp();
  const w = world(record(-5), (now) => grantAuthority(idp, now));
  w.hold();
  setTimeout(w.release, 60);
  assert.equal((await resolveLoginState(cfg, "r1", { activity: true }, w.deps))?.claims.sub, "u1");
  assert.deepEqual(idp.calls, ["rt-0"]);
});

test("ACCOUNTS saying no ends the state - once, recorded, and never re-asked on every request", async () => {
  const before = counts().ended_by_accounts;
  const idp = rotatingIdp({ fail: "refuse" });
  const w = world(record(-5), (now) => grantAuthority(idp, now));
  assert.equal(await resolveLoginState(cfg, "r1", { activity: true }, w.deps), null);
  assert.equal(w.peek(), null, "the record is gone");
  assert.equal(counts().ended_by_accounts, before + 1);
  assert.equal(await resolveLoginState(cfg, "r1", { activity: true }, w.deps), null);
  assert.equal(idp.calls.length, 1, "the dead grant is not presented again");
});

test("central outage retains credentials for recovery and refuses protected rendering", async () => {
  const before = counts().check_unavailable;
  const idp = rotatingIdp({ fail: "network" });
  const w = world(record(-5), (now) => grantAuthority(idp, now));
  await assert.rejects(resolveLoginState(cfg, "r1", { activity: true }, w.deps), LoginStateUnavailableError);
  assert.ok(w.peek(), "the record is kept");
  assert.equal(counts().check_unavailable, before + 1);
  // Retried on a later activity, not on the very next request.
  await assert.rejects(resolveLoginState(cfg, "r1", { activity: true }, w.deps), LoginStateUnavailableError);
  assert.equal(idp.calls.length, 1);
});

test("a record written before login-state (no claims) is asked once, even without activity", async () => {
  const idp = rotatingIdp();
  const w = world(record(600, { claims: undefined }), (now) => grantAuthority(idp, now));
  assert.equal((await resolveLoginState(cfg, "r1", { activity: false }, w.deps))?.claims.sub, "u1");
  assert.deepEqual(idp.calls, ["rt-0"]);
});

test("the schedule comes from accounts: asked shortly before accounts' deadline, not on a product clock", async () => {
  const idp = rotatingIdp();
  const w = world(record(100), (now) => grantAuthority(idp, now));
  await resolveLoginState(cfg, "r1", { activity: true }, w.deps);
  assert.deepEqual(idp.calls, [], "100s left: not yet");
  w.advance(80);
  await resolveLoginState(cfg, "r1", { activity: true }, w.deps);
  assert.deepEqual(idp.calls, ["rt-0"], "20s left: asked");
  assert.equal(w.peek()?.nextCheckAt, NOW + 80 + 300, "next deadline is what accounts just issued");
});

test("a token for a platform call: fresh one reused; stale one renewed once however many callers ask", async () => {
  const idp = rotatingIdp();
  const fresh = world(record(600), (now) => grantAuthority(idp, now));
  assert.equal(await accessTokenFor(cfg, "r1", fresh.deps), "at-0");
  assert.deepEqual(idp.calls, []);

  const stale = world(record(-5), (now) => grantAuthority(idp, now));
  const tokens = await Promise.all(Array.from({ length: 5 }, () => accessTokenFor(cfg, "r1", stale.deps)));
  assert.deepEqual(tokens, ["at-1", "at-1", "at-1", "at-1", "at-1"]);
  assert.deepEqual(idp.calls, ["rt-0"]);
});

// --- the status-query adapter (vxture-platform#538, proposed shape) ------------

function statusFetch(answer: { status?: number; body?: unknown; throws?: boolean }, seen: unknown[] = []) {
  return (async (_url: string, init: RequestInit) => {
    seen.push(JSON.parse(String(init.body)));
    if (answer.throws) throw new Error("fetch failed");
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 });
  }) as unknown as typeof fetch;
}

test("status query: 'valid' keeps the state and takes accounts' next-check time; the activity flag is sent", async () => {
  const seen: unknown[] = [];
  const idp = rotatingIdp();
  const w = world(record(-5), (now) =>
    accountsStatusAuthority("https://accounts/status", { ...idp, fetch: statusFetch({ body: { valid: true, next_check_at: NOW + 999 } }, seen) }, now));
  assert.equal((await resolveLoginState(cfg, "r1", { activity: true }, w.deps))?.claims.sub, "u1");
  assert.deepEqual(seen, [{ sid: "sid-1", active: true }]);
  assert.equal(w.peek()?.nextCheckAt, NOW + 999);
  assert.deepEqual(idp.calls, [], "the login is confirmed by the query, not by renewing a token");
});

test("status query: 'not valid' ends the state; a failed query does not", async () => {
  const ended = world(record(-5), (now) =>
    accountsStatusAuthority("u", { ...rotatingIdp(), fetch: statusFetch({ body: { valid: false } }) }, now));
  assert.equal(await resolveLoginState(cfg, "r1", { activity: true }, ended.deps), null);

  const down = world(record(-5), (now) =>
    accountsStatusAuthority("u", { ...rotatingIdp(), fetch: statusFetch({ status: 503 }) }, now));
  await assert.rejects(resolveLoginState(cfg, "r1", { activity: true }, down.deps), LoginStateUnavailableError);
  assert.ok(down.peek());
});

test("status query mode: a refused token renewal fails that call only - the member stays signed in", async () => {
  const idp = rotatingIdp({ fail: "refuse" });
  const w = world(record(-5, { nextCheckAt: NOW + 900 }), (now) =>
    accountsStatusAuthority("u", { ...idp, fetch: statusFetch({ body: { valid: true } }) }, now));
  assert.equal(await accessTokenFor(cfg, "r1", w.deps), null);
  assert.ok(w.peek(), "record kept");
  assert.equal((await resolveLoginState(cfg, "r1", { activity: true }, w.deps))?.claims.sub, "u1");
});

test("no record behind the cookie is simply logged out, and noted", async () => {
  const before = counts().no_record;
  const w = world(null, (now) => grantAuthority(rotatingIdp(), now));
  assert.equal(await resolveLoginState(cfg, "r1", { activity: true }, w.deps), null);
  assert.equal(counts().no_record, before + 1);
});


test("refresh/refocus force a read-only check before the scheduled deadline", async () => {
  const seen: unknown[] = [];
  const w = world(record(600), (now) => accountsStatusAuthority("u", {
    ...rotatingIdp(), fetch: statusFetch({ body: { valid: false } }, seen),
  }, now));
  assert.equal(await resolveLoginState(cfg, "r1", { activity: false, forceCheck: true }, w.deps), null);
  assert.deepEqual(seen, [{ sid: "sid-1", active: false }]);
});

test("a background probe detects logout even when the notification was lost", async () => {
  const w = world(record(-5), (now) => accountsStatusAuthority("u", {
    ...rotatingIdp(), fetch: statusFetch({ body: { valid: false } }),
  }, now));
  assert.equal(await resolveLoginState(cfg, "r1", { activity: false }, w.deps), null);
  assert.equal(w.peek(), null);
});

test("back-channel deletion during a status check cannot resurrect a session", async () => {
  const w = world(record(-5), () => ({
    check: async (_cfg, session) => {
      await w.deps.deleteSession(cfg.clientId, "r1");
      return { kind: "valid", session };
    },
    freshToken: async () => ({ kind: "unavailable", detail: "unused" }),
  }));
  assert.equal(await resolveLoginState(cfg, "r1", { activity: true }, w.deps), null);
  assert.equal(w.peek(), null);
});

test("back-channel deletion during token renewal cannot resurrect credentials", async () => {
  const w = world(record(-5), () => ({
    check: async (_cfg, session) => ({ kind: "valid", session }),
    freshToken: async (_cfg, session) => {
      await w.deps.deleteSession(cfg.clientId, "r1");
      return { kind: "valid", session: { ...session, accessToken: "late-token", accessExpiresAt: NOW + 600 } };
    },
  }));
  assert.equal(await accessTokenFor(cfg, "r1", w.deps), null);
  assert.equal(w.peek(), null);
});

test("a read-only successful retry recovers a temporarily unavailable session", async () => {
  let down = true;
  const w = world(record(600), () => ({
    check: async (_cfg, session) => down ? { kind: "unavailable", detail: "network" }
      : { kind: "valid", session: { ...session, nextCheckAt: NOW + 600 } },
    freshToken: async () => ({ kind: "unavailable", detail: "unused" }),
  }));
  await assert.rejects(resolveLoginState(cfg, "r1", { activity: false, forceCheck: true }, w.deps), LoginStateUnavailableError);
  down = false;
  assert.equal((await resolveLoginState(cfg, "r1", { activity: false, forceCheck: true }, w.deps))?.claims.sub, "u1");
  assert.equal(w.peek()?.statusUnavailable, false);
});


test("forced foreground checks still report real user activity", async () => {
  const seen: unknown[] = [];
  const w = world(record(600), (now) => accountsStatusAuthority("u", {
    ...rotatingIdp(), fetch: statusFetch({ body: { valid: true, next_check_at: NOW + 600 } }, seen),
  }, now));
  assert.equal((await resolveLoginState(cfg, "r1", { activity: true, forceCheck: true }, w.deps))?.claims.sub, "u1");
  assert.deepEqual(seen, [{ sid: "sid-1", active: true }]);
});


test("foreground return receives current workspace even while old token and status remain fresh", async () => {
  const idp = rotatingIdp();
  let current = { ...CLAIMS, active_org: "organization", active_workspace: "workspace-b" };
  const w = world(record(600), (now) => accountsStatusAuthority("u", {
    ...idp, verifyToken: (async () => current) as never,
    fetch: statusFetch({ body: { valid: true, next_check_at: NOW + 900 } }),
  }, now));
  for (const selection of [
    { active_org: "organization", active_workspace: "workspace-b" },
    { active_org: "personal", active_workspace: "personal-default" },
    { active_org: "organization", active_workspace: "workspace-a" },
  ]) {
    current = { ...CLAIMS, ...selection };
    w.advance(1);
    const state = await resolveLoginState(cfg, "r1", { activity: true, forceCheck: true, syncContext: true }, w.deps);
    assert.equal(state?.claims.active_org, selection.active_org);
    assert.equal(state?.claims.active_workspace, selection.active_workspace);
    assert.equal(w.peek()?.contextUnavailable, false);
  }
  assert.deepEqual(idp.calls, ["rt-0", "rt-1", "rt-2"]);
  await resolveLoginState(cfg, "r1", { activity: false }, w.deps);
  assert.equal(idp.calls.length, 3, "ordinary reads never trigger foreground refresh");
});

test("concurrent foreground returns share one refresh of a fresh token without replay", async () => {
  const idp = rotatingIdp({ latencyMs: 30 });
  const w = world(record(600), (now) => accountsStatusAuthority("u", {
    ...idp, fetch: statusFetch({ body: { valid: true, next_check_at: NOW + 900 } }),
  }, now));
  const results = await Promise.all(Array.from({ length: 8 }, () =>
    resolveLoginState(cfg, "r1", { activity: false, forceCheck: true, syncContext: true }, w.deps)));
  assert.equal(results.every(r => r?.claims.sub === CLAIMS.sub), true);
  assert.deepEqual(idp.calls, ["rt-0"]);
});

test("failed context refresh keeps credentials, blocks old scope and recovers only with a successful foreground retry", async () => {
  for (const fail of ["refuse", "network"] as const) {
    let down = true;
    const idp = rotatingIdp({ fail });
    const good = rotatingIdp();
    const w = world(record(600), (now) => accountsStatusAuthority("u", {
      refreshTokens: (c, token) => (down ? idp : good).refreshTokens(c, token),
      verifyToken: good.verifyToken,
      fetch: statusFetch({ body: { valid: true, next_check_at: NOW + 900 } }),
    }, now));
    await assert.rejects(resolveLoginState(cfg, "r1", { activity: false, syncContext: true }, w.deps), LoginStateUnavailableError);
    assert.ok(w.peek()?.refreshToken, "failed renewal is not proof of central logout");
    await assert.rejects(resolveLoginState(cfg, "r1", { activity: false }, w.deps), LoginStateUnavailableError);
    await assert.rejects(accessTokenFor(cfg, "r1", w.deps, CLAIMS), LoginStateUnavailableError);
    down = false;
    assert.equal((await resolveLoginState(cfg, "r1", { activity: false, syncContext: true }, w.deps))?.claims.sub, CLAIMS.sub);
  }
});

for (const result of ["unchanged", "changed", "unavailable", "logout"] as const) {
  test(`navigation joining a foreground refresh: ${result}`, async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const joined = Promise.withResolvers<void>();
    let refreshes = 0;
    const w = world(record(600), () => ({
      check: async (_cfg, session) => ({ kind: "valid", session }),
      freshToken: async (_cfg, session) => {
        refreshes++;
        entered.resolve();
        await release.promise;
        if (result === "unavailable") return { kind: "unavailable", detail: "timeout" };
        if (result === "logout") await w.deps.deleteSession(cfg.clientId, "r1");
        const workspace = result === "changed" ? "next" : CLAIMS.active_workspace;
        return { kind: "valid", session: { ...session, claims: { ...CLAIMS, active_workspace: workspace } } };
      },
    }));
    const acquire = w.deps.acquireCheckLock;
    w.deps.acquireCheckLock = async (...args) => {
      const lease = await acquire(...args);
      if (!lease) joined.resolve();
      return lease;
    };
    const outcome = (p: ReturnType<typeof resolveLoginState>) => p.then(
      state => state?.claims.active_workspace ?? null,
      error => { assert.ok(error instanceof LoginStateUnavailableError); return "refused"; },
    );
    const foreground = outcome(resolveLoginState(cfg, "r1", { activity: false, syncContext: true }, w.deps));
    await entered.promise;
    const navigation = outcome(resolveLoginState(cfg, "r1", { activity: false }, w.deps));
    try {
      assert.equal(await Promise.race([joined.promise.then(() => "waiting"), navigation]), "waiting");
      await assert.rejects(accessTokenFor(cfg, "r1", w.deps, CLAIMS), LoginStateUnavailableError);
    } finally {
      release.resolve();
    }
    const expected = {
      unchanged: [CLAIMS.active_workspace, CLAIMS.active_workspace], changed: ["next", "refused"],
      unavailable: ["refused", "refused"], logout: [null, null],
    }[result];
    assert.deepEqual(await Promise.all([foreground, navigation]), expected);
    assert.equal(refreshes, 1, "navigation never starts a new token refresh");
  });
}

for (const [name, change] of [
  ["workspace", { active_workspace: "new-workspace" }],
  ["tenant alone", { active_org: "tenant-b" }],
  ["tenant and workspace", { active_org: "tenant-b", active_workspace: "tenant-b-workspace" }],
] as const) {
  test(`an old request cannot obtain the new ${name} OBO token after renewal`, async () => {
    const previous = { ...CLAIMS, active_org: "tenant-a" };
    const current = { ...previous, ...change };
    const idp = rotatingIdp();
    const w = world(record(-5, { nextCheckAt: NOW + 900, claims: previous }), (now) => accountsStatusAuthority("u", {
      ...idp, verifyToken: (async () => current) as never,
      fetch: statusFetch({ body: { valid: true } }),
    }, now));
    await assert.rejects(accessTokenFor(cfg, "r1", w.deps, previous), LoginStateUnavailableError);
    assert.deepEqual(w.peek()?.claims, current);
    await assert.rejects(accessTokenFor(cfg, "r1", w.deps, previous), LoginStateUnavailableError);
    assert.equal(await accessTokenFor(cfg, "r1", w.deps, current), "at-1");
    assert.deepEqual(idp.calls, ["rt-0"], "a rejected stale caller cannot renew again or fall back to a service token");
  });
}

test("unverified refreshed claims never replace the verified workspace", async () => {
  const idp = rotatingIdp();
  const w = world(record(600), (now) => accountsStatusAuthority("u", {
    ...idp, verifyToken: (async () => { throw new Error("bad signature"); }) as never,
    fetch: statusFetch({ body: { valid: true } }),
  }, now));
  await assert.rejects(resolveLoginState(cfg, "r1", { activity: false, syncContext: true }, w.deps), LoginStateUnavailableError);
  assert.equal(w.peek()?.claims?.active_workspace, CLAIMS.active_workspace);
  assert.equal(w.peek()?.contextUnavailable, true);
});

test("context refresh cannot resurrect a session deleted by logout", async () => {
  const w = world(record(600), () => ({
    check: async (_cfg, session) => ({ kind: "valid", session }),
    freshToken: async (_cfg, session) => {
      await w.deps.deleteSession(cfg.clientId, "r1");
      return { kind: "valid", session: { ...session, claims: { ...CLAIMS, active_workspace: "late" } } };
    },
  }));
  assert.equal(await resolveLoginState(cfg, "r1", { activity: false, syncContext: true }, w.deps), null);
  assert.equal(w.peek(), null);
});


test("a request with resolved scope cannot fall back to service credentials after its login was deleted", async () => {
  const w = world(null, (now) => accountsStatusAuthority("u", {
    ...rotatingIdp(), fetch: statusFetch({ body: { valid: false } }),
  }, now));
  await assert.rejects(accessTokenFor(cfg, "r1", w.deps, CLAIMS), LoginStateUnavailableError);
});
