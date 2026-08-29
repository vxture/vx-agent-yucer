import { test } from "node:test";
import assert from "node:assert/strict";
import { type AuthUser, toAuthUser } from "../auth/lib/claims";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../entitlement/types";
import { InMemoryAuthzStore } from "./store";
import { OWNER_BOOTSTRAP_ROLE, permissionsForRoles } from "./catalog";
import { resolveAuthzContext, can, decisionsFor, invalidateAuthz, resetAuthzCache } from "./context";

const WS = "11111111-1111-1111-1111-111111111111";

function user(over: Partial<AuthUser> = {}): AuthUser {
  const base = toAuthUser({ sub: "usr_1", active_workspace: WS, roles: [] });
  return { ...base, ...over };
}

function ent(over: Partial<Entitlement> = {}): Entitlement {
  return { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", ...over };
}

function fresh() {
  resetAuthzCache();
  return new InMemoryAuthzStore();
}

test("a token with no active workspace resolves to no context", async () => {
  // There is no such thing as a permission outside a workspace, and defaulting
  // to "some workspace" would be inventing the isolation key.
  const store = fresh();
  const ctx = await resolveAuthzContext(user({ activeWorkspace: null }), store);
  assert.equal(ctx, null);
});

test("first sighting creates the member row lazily", async () => {
  const store = fresh();
  assert.deepEqual(await store.listMembers(WS), []);
  const ctx = await resolveAuthzContext(user(), store);
  assert.equal(ctx?.workspaceId, WS);
  assert.equal((await store.listMembers(WS)).length, 1);
});

test("a plain member starts with no roles and therefore no permissions", async () => {
  const store = fresh();
  const ctx = await resolveAuthzContext(user(), store);
  assert.deepEqual(ctx!.roles, []);
  assert.equal(ctx!.permissions.size, 0);
});

test("a platform workspace:owner is bootstrapped to the default product role", async () => {
  const store = fresh();
  const owner = toAuthUser({ sub: "usr_owner", active_workspace: WS, roles: ["workspace:owner"] });
  const ctx = await resolveAuthzContext(owner, store);
  assert.deepEqual(ctx!.roles, [OWNER_BOOTSTRAP_ROLE]);
  assert.ok(ctx!.permissions.has("admin.manage"));
});

test("the owner bootstrap does not resurrect a revoked role on later logins", async () => {
  // This is the whole reason seeMember reports `created` rather than being a
  // plain upsert: re-applying the default every login would silently undo an
  // administrator's decision.
  const store = fresh();
  const owner = toAuthUser({ sub: "usr_owner", active_workspace: WS, roles: ["workspace:owner"] });
  await resolveAuthzContext(owner, store);

  await store.revokeRole(WS, "usr_owner", OWNER_BOOTSTRAP_ROLE);
  await store.grantRole(WS, "usr_owner", "viewer");
  invalidateAuthz(WS, "usr_owner");

  const ctx = await resolveAuthzContext(owner, store);
  assert.deepEqual(ctx!.roles, ["viewer"]);
});

test("a non-owner is never bootstrapped, however many governance roles they carry", async () => {
  const store = fresh();
  const manager = toAuthUser({
    sub: "usr_mgr",
    active_workspace: WS,
    roles: ["workspace:manager", "org:owner"],
  });
  const ctx = await resolveAuthzContext(manager, store);
  assert.deepEqual(ctx!.roles, []);
});

test("the context is cached, and invalidation makes a role change visible at once", async () => {
  const store = fresh();
  await resolveAuthzContext(user(), store);

  await store.grantRole(WS, "usr_1", "sales_rep");
  const stale = await resolveAuthzContext(user(), store);
  assert.deepEqual(stale!.roles, [], "cache should still be serving the old answer");

  invalidateAuthz(WS, "usr_1");
  const fresh1 = await resolveAuthzContext(user(), store);
  assert.deepEqual(fresh1!.roles, ["sales_rep"]);
});

test("workspace-wide invalidation drops every member of that workspace only", async () => {
  const store = fresh();
  const other = "22222222-2222-2222-2222-222222222222";
  await resolveAuthzContext(user(), store);
  await resolveAuthzContext(user({ sub: "usr_2" }), store);
  await resolveAuthzContext(user({ sub: "usr_3", activeWorkspace: other }), store);

  await store.grantRole(WS, "usr_1", "viewer");
  await store.grantRole(other, "usr_3", "viewer");
  invalidateAuthz(WS);

  assert.deepEqual((await resolveAuthzContext(user(), store))!.roles, ["viewer"]);
  // The other workspace's entry was not evicted, so it still serves the old value.
  const otherCtx = await resolveAuthzContext(user({ sub: "usr_3", activeWorkspace: other }), store);
  assert.deepEqual(otherCtx!.roles, []);
});

// --- can() : the two gates against a named action ---------------------------

async function ctxWith(roles: Parameters<typeof permissionsForRoles>[0]) {
  const store = fresh();
  for (const r of roles) await store.grantRole(WS, "usr_1", r as never);
  const ctx = await resolveAuthzContext(user(), store);
  return ctx!;
}

test("can() runs both gates for the action's declared pair", async () => {
  const ctx = await ctxWith(["sales_ops"]);
  assert.equal(can(ctx, ent({ tier: "pro" }), "pipeline.forecast.snapshot").allowed, true);
  // Same member, tier too low.
  assert.equal(
    can(ctx, ent({ tier: "starter" }), "pipeline.forecast.snapshot").reason,
    "feature_not_in_tier",
  );
});

test("can() denies a permitted-but-unentitled action before naming the permission", async () => {
  const ctx = await ctxWith(["sales_leader"]);
  const d = can(ctx, ent({ tier: "free" }), "strategy.plan.create");
  assert.equal(d.reason, "feature_not_in_tier");
  assert.equal(d.requiredPerm, null);
});

test("can() denies an entitled-but-unpermitted action", async () => {
  const ctx = await ctxWith(["sales_rep"]);
  const d = can(ctx, ent({ tier: "enterprise" }), "pipeline.forecast.snapshot");
  assert.equal(d.reason, "permission_denied");
  assert.equal(d.requiredPerm, "pipeline.forecast");
});

test("the ui surface is stricter than the data surface for bundled-only coverage", async () => {
  const ctx = await ctxWith(["sales_leader"]);
  const bundled = ent({ tier: null, bundled: true });
  assert.equal(can(ctx, bundled, "admin.member.view", "ui").reason, "no_product_access");
  assert.equal(can(ctx, bundled, "admin.member.view", "data").allowed, true);
});

test("decisionsFor answers a whole surface in one pass, agreeing with can()", async () => {
  const ctx = await ctxWith(["sales_rep"]);
  const e = ent({ tier: "pro" });
  const ids = ["pipeline.view", "pipeline.opportunity.advance", "pipeline.forecast.snapshot"] as const;
  const all = decisionsFor(ctx, e, ids, "ui");
  for (const id of ids) {
    assert.deepEqual(all[id], can(ctx, e, id, "ui"), `${id} disagrees with can()`);
  }
  assert.equal(all["pipeline.view"].allowed, true);
  assert.equal(all["pipeline.forecast.snapshot"].allowed, false);
});
