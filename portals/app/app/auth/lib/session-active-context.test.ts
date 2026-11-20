import { test } from "node:test";
import assert from "node:assert/strict";
import { getAuthSession, type AuthSessionDeps } from "./session";
import type { OidcConfig } from "./config";
import type { AccessClaims } from "./claims";
import { sameAccessScope } from "./session-context";

const cfg = { clientId: "test" } as OidcConfig;
const oldClaims = { sub: "member", active_org: "org", active_workspace: "workspace-a", roles: ["workspace:owner"] };
const newClaims = { ...oldClaims, active_workspace: "workspace-b", roles: ["workspace:member"] };

function fixture(claims: AccessClaims = newClaims) {
  const invalidated: string[] = [];
  const bound: AccessClaims[] = [];
  const deps: AuthSessionDeps = {
    resolve: async () => ({ session: { sub: claims.sub, idToken: "id", accessToken: "at", accessExpiresAt: 100 }, claims, previousClaims: oldClaims }),
    token: async (_c, _r, _d, expected) => { if (expected) bound.push(expected); return "server-only-ticket"; },
    invalidate: (workspace, sub) => { invalidated.push(`${workspace}:${sub}`); },
  };
  return { deps, invalidated, bound };
}

test("foreground refresh invalidates previous and current workspace gates before returning new claims", async () => {
  const f = fixture();
  const session = await getAuthSession(cfg, "rp", { activity: false, syncContext: true }, f.deps);
  assert.deepEqual(f.invalidated, ["workspace-a:member", "workspace-b:member"]);
  assert.equal(session?.user.activeWorkspace, "workspace-b");
  assert.equal(session?.user.isWorkspaceOwner, false);
  assert.equal(await session?.accessToken(), "server-only-ticket");
  assert.equal(await session?.accessToken(), "server-only-ticket");
  assert.deepEqual(f.bound, [newClaims], "OBO resolution binds to this render's verified claims and memoizes");
});

test("periodic status does not invalidate shared workspace caches or request OBO tokens", async () => {
  const f = fixture();
  await getAuthSession(cfg, "rp", { activity: false }, f.deps);
  assert.deepEqual(f.invalidated, []);
  assert.deepEqual(f.bound, []);
});

test("a verified token without workspace never falls back to the old workspace", async () => {
  const f = fixture({ sub: "member", active_org: "personal" });
  const session = await getAuthSession(cfg, "rp", { activity: true, syncContext: true }, f.deps);
  assert.equal(session?.user.activeWorkspace, null);
  assert.deepEqual(f.invalidated, ["workspace-a:member"]);
});

test("an inactive account cannot return an authenticated session after refresh", async () => {
  const f = fixture({ ...newClaims, account_status: "suspended" });
  assert.equal(await getAuthSession(cfg, "rp", { activity: false, syncContext: true }, f.deps), null);
});

test("scope comparison ignores role ordering but rejects tenant, workspace, subject and authorization changes", () => {
  const claims = { ...oldClaims, roles: ["org:member", "workspace:member"], account_status: "active" };
  assert.equal(sameAccessScope(claims, { ...claims, roles: [...claims.roles].reverse() }), true);
  for (const change of [{ sub: "other" }, { active_org: "other" }, { active_workspace: "other" }, { roles: [] }, { account_status: "suspended" }]) {
    assert.equal(sameAccessScope(claims, { ...claims, ...change }), false);
  }
});
