import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { type AuthUser, toAuthUser } from "../auth/lib/claims";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../entitlement/types";
import { InMemoryAuthzStore } from "./store";
import { InMemoryAuditStore, setAuditStore } from "../audit/lib/store";
import { DEFAULT_MEMBER_ROLE, OWNER_BOOTSTRAP_ROLE, permissionsForRoles } from "./catalog";
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

test("a sighting caches the token's name for the roster; a nameless token keeps the cached one", async () => {
  // Production rendered every member as the bare sub: this sighting never
  // passed the name, and the roster is the only place other pages read it.
  const store = fresh();
  await resolveAuthzContext(toAuthUser({ sub: "usr_1", active_workspace: WS, roles: [], name: "张三" }), store);
  assert.equal((await store.listMembers(WS))[0]!.displayName, "张三");
  resetAuthzCache();
  await resolveAuthzContext(toAuthUser({ sub: "usr_1", active_workspace: WS, roles: [] }), store);
  assert.equal((await store.listMembers(WS))[0]!.displayName, "张三", "the sub is never cached as a name");
});

test("a sighting caches phone, email and face; a claim gone clears it; user_no is kept until told", async () => {
  const store = fresh();
  await store.seeMember({ workspaceId: WS, sub: "usr_1", userNo: "1000010000" });
  await resolveAuthzContext(
    toAuthUser({ sub: "usr_1", active_workspace: WS, roles: [], phone: "+8613800000000", email: "a@example.com", picture: "https://x/avatar" }),
    store,
  );
  let m = (await store.listMembers(WS))[0]!;
  assert.deepEqual([m.phone, m.email, m.pictureUrl, m.userNo], ["+8613800000000", "a@example.com", "https://x/avatar", "1000010000"]);
  resetAuthzCache();
  await resolveAuthzContext(toAuthUser({ sub: "usr_1", active_workspace: WS, roles: [], email: "a@example.com" }), store);
  m = (await store.listMembers(WS))[0]!;
  assert.deepEqual([m.phone, m.pictureUrl, m.userNo], [null, null, "1000010000"]);
});

test("a member without confirmed product access is not assigned the ordinary default", async () => {
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
  // Holding an explicitly assigned role preserves the administrator's choice.
  const store = fresh();
  const owner = toAuthUser({ sub: "usr_owner", active_workspace: WS, roles: ["workspace:owner"] });
  await resolveAuthzContext(owner, store);

  await store.revokeRole(WS, "usr_owner", OWNER_BOOTSTRAP_ROLE);
  await store.grantRole(WS, "usr_owner", "viewer");
  invalidateAuthz(WS, "usr_owner");

  const ctx = await resolveAuthzContext(owner, store);
  assert.deepEqual(ctx!.roles, ["viewer"]);
});

test("an owner who looked at the product before owning it is still bootstrapped", async () => {
  // THE STRANDING CASE the condition used to allow. A member row is created by
  // the first page load in a workspace - including the screen that says the
  // workspace has no subscription - so somebody who read that page, then
  // subscribed, had already spent their one "first sighting". Under the old
  // `created && isWorkspaceOwner` they held no role forever, looking at a
  // screen telling them to ask an administrator, which was them.
  const store = fresh();
  const sub = "usr_buyer";

  // Sighting one: signed in, not yet the workspace owner.
  await resolveAuthzContext(toAuthUser({ sub, active_workspace: WS, roles: [] }), store);
  invalidateAuthz(WS, sub);

  // Sighting two: the subscription is open and the token now carries it.
  const owner = toAuthUser({ sub, active_workspace: WS, roles: ["workspace:owner"] });
  const ctx = await resolveAuthzContext(owner, store);
  assert.deepEqual(ctx!.roles, [OWNER_BOOTSTRAP_ROLE]);
  assert.ok(ctx!.permissions.has("admin.manage"), "the super administrator can configure and assign roles");
});

test("an owner stripped of every role is healed; one who was merely moved is not", async () => {
  // The two halves of the same rule. Holding SOMETHING is an administrator's
  // decision and is left alone; holding NOTHING is a workspace nobody can
  // administer, which is not a state anyone can have intended.
  const store = fresh();
  const owner = toAuthUser({ sub: "usr_owner", active_workspace: WS, roles: ["workspace:owner"] });
  await resolveAuthzContext(owner, store);

  await store.revokeRole(WS, "usr_owner", OWNER_BOOTSTRAP_ROLE);
  invalidateAuthz(WS, "usr_owner");
  const healed = await resolveAuthzContext(owner, store);
  assert.deepEqual(healed!.roles, [OWNER_BOOTSTRAP_ROLE], "nothing left to administer the workspace with");
});

test("non-owner governance claims do not bootstrap an administrator", async () => {
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
  await store.grantRole(WS, "usr_1", "viewer");
  await resolveAuthzContext(user(), store);

  await store.grantRole(WS, "usr_1", "sales_rep");
  const stale = await resolveAuthzContext(user(), store);
  assert.deepEqual(stale!.roles, ["viewer"], "cache should still be serving the old answer");

  invalidateAuthz(WS, "usr_1");
  const fresh1 = await resolveAuthzContext(user(), store);
  assert.deepEqual(fresh1!.roles, ["viewer", "sales_rep"]);
});

test("workspace-wide invalidation drops every member of that workspace only", async () => {
  const store = fresh();
  const other = "22222222-2222-2222-2222-222222222222";
  await store.grantRole(WS, "usr_1", "sales_rep");
  await store.grantRole(other, "usr_3", "sales_rep");
  await resolveAuthzContext(user(), store);
  await resolveAuthzContext(user({ sub: "usr_2" }), store);
  await resolveAuthzContext(user({ sub: "usr_3", activeWorkspace: other }), store);

  await store.grantRole(WS, "usr_1", "viewer");
  await store.grantRole(other, "usr_3", "viewer");
  invalidateAuthz(WS);

  assert.deepEqual((await resolveAuthzContext(user(), store))!.roles, ["sales_rep", "viewer"]);
  // The other workspace's entry was not evicted, so it still serves the old value.
  const otherCtx = await resolveAuthzContext(user({ sub: "usr_3", activeWorkspace: other }), store);
  assert.deepEqual(otherCtx!.roles, ["sales_rep"]);
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

// Ordinary defaults are separate from owner recovery and from role definitions.
afterEach(() => setAuditStore(null));

test("an entitled ordinary member receives the workspace sales role with customer, opportunity and quote access", async () => {
  const store = fresh();
  const audit = new InMemoryAuditStore();
  setAuditStore(audit);
  const e = ent({ tier: "pro" });
  const ctx = (await resolveAuthzContext(user(), store, e))!;
  assert.deepEqual(ctx.roles, [DEFAULT_MEMBER_ROLE]);
  assert.deepEqual([...ctx.permissions], await store.permissionsOf(WS, "usr_1"));
  for (const permission of ["account.read", "account.write", "pipeline.read", "pipeline.write", "catalog.read", "copilot.use"] as const) {
    assert.ok(ctx.permissions.has(permission), permission);
  }
  for (const permission of ["admin.manage", "catalog.price", "pipeline.discount", "strategy.approve"] as const) {
    assert.ok(!ctx.permissions.has(permission), permission);
  }
  assert.deepEqual(await store.getScope(WS, "usr_1"), { kind: "workspace", territoryIds: [] });
  resetAuthzCache();
  await resolveAuthzContext(user(), store, e);
  assert.equal(audit.rows.length, 1, "repeat logins do not reassign or re-audit");
  assert.equal(audit.rows[0].action, "admin.member.role.default");
  assert.equal(audit.rows[0].objectId, "usr_1");
});

test("unconfigured existing members are healed when product access arrives, even with a cached roleless context", async () => {
  const store = fresh();
  for (const e of [ent(), ent({ bundled: true }), ent({ tier: "pro", workspace_id: "other" }), ent({ tier: "pro", product: "other" })]) {
    const ctx = await resolveAuthzContext(user(), store, e);
    assert.deepEqual(ctx!.roles, []);
  }
  const ctx = await resolveAuthzContext(user(), store, ent({ tier: "pro" }));
  assert.deepEqual(ctx!.roles, [DEFAULT_MEMBER_ROLE]);
});

test("default assignment reads the tenant's customized sales role instead of copying a permission set", async () => {
  const store = fresh();
  await store.seedPresetRoles(WS);
  await store.upsertRole(WS, { code: DEFAULT_MEMBER_ROLE, name: "Local sales", description: "", lineId: null, rankId: null, permissions: ["account.read", "account.write"] });
  const ctx = await resolveAuthzContext(user(), store, ent({ tier: "pro" }));
  assert.deepEqual([...ctx!.permissions], ["account.read", "account.write"]);
});

test("a viewer assignment or explicit removal of all roles survives subsequent entitled logins", async () => {
  const store = fresh();
  const e = ent({ tier: "pro" });
  await resolveAuthzContext(user(), store, e);
  await store.grantRole(WS, "usr_1", "viewer");
  await store.revokeRole(WS, "usr_1", DEFAULT_MEMBER_ROLE);
  invalidateAuthz(WS);
  assert.deepEqual((await resolveAuthzContext(user(), store, e))!.roles, ["viewer"]);
  await store.revokeRole(WS, "usr_1", "viewer");
  invalidateAuthz(WS);
  const ctx = await resolveAuthzContext(user(), store, e);
  assert.deepEqual(ctx!.roles, []);
  assert.equal(ctx!.permissions.size, 0);
});

test("an administrator's decision before the first entitled visit suppresses the default", async () => {
  const store = fresh();
  await store.grantRole(WS, "usr_1", "viewer");
  await store.revokeRole(WS, "usr_1", "viewer");
  const ctx = await resolveAuthzContext(user(), store, ent({ tier: "pro" }));
  assert.deepEqual(ctx!.roles, []);
});

test("inactive members, including owners, have no permissions and are not bootstrapped", async () => {
  for (const isWorkspaceOwner of [false, true]) {
    const store = fresh();
    await store.grantRole(WS, "usr_1", "sales_leader");
    await store.setMemberStatus(WS, "usr_1", "inactive");
    const ctx = await resolveAuthzContext(user({ isWorkspaceOwner }), store, ent({ tier: "pro" }));
    assert.deepEqual(ctx!.roles, []);
    assert.equal(ctx!.permissions.size, 0);
    assert.equal((await store.listMembers(WS))[0].status, "inactive");
  }
});

test("reactivating an unconfigured member does not silently grant a role", async () => {
  const store = fresh();
  await store.seeMember({ workspaceId: WS, sub: "usr_1" });
  await store.setMemberStatus(WS, "usr_1", "inactive");
  await store.setMemberStatus(WS, "usr_1", "active");
  assert.deepEqual((await resolveAuthzContext(user(), store, ent({ tier: "pro" })))!.roles, []);
});

test("a removed default role is not recreated over the tenant's configuration", async () => {
  const store = fresh();
  await store.seedPresetRoles(WS);
  await store.removeRole(WS, DEFAULT_MEMBER_ROLE);
  assert.deepEqual((await resolveAuthzContext(user(), store, ent({ tier: "pro" })))!.roles, []);
  assert.ok(!(await store.listRoles(WS)).some((r) => r.code === DEFAULT_MEMBER_ROLE));
});

test("a change in owner claims does not reuse a stale ordinary-member context", async () => {
  const store = fresh();
  await resolveAuthzContext(user(), store);
  const ctx = await resolveAuthzContext(user({ isWorkspaceOwner: true }), store);
  assert.ok(ctx!.isWorkspaceOwner);
  assert.ok(ctx!.permissions.has("admin.manage"));
});

test("rechecking the role gate sees a grant made outside this instance without waiting for the TTL", async () => {
  const store = fresh();
  const e = ent({ tier: "pro" });
  await store.grantRole(WS, "usr_1", "viewer");
  await store.revokeRole(WS, "usr_1", "viewer");
  assert.deepEqual((await resolveAuthzContext(user(), store, e))!.roles, []);
  // Store-level write simulates another app instance; no local invalidation.
  await store.grantRole(WS, "usr_1", "sales_rep");
  const recovered = await resolveAuthzContext(user(), store, e);
  assert.deepEqual(recovered!.roles, ["sales_rep"]);
  assert.ok(recovered!.permissions.has("account.write"));
});

test("an in-flight role lookup cannot restore stale permissions after invalidation", async () => {
  const store = fresh();
  await store.seeMember({ workspaceId: WS, sub: "usr_1" });
  await store.seedPresetRoles(WS);
  await store.grantRole(WS, "usr_1", "viewer");
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const original = store.rolesOf.bind(store);
  let calls = 0;
  store.rolesOf = async (workspace, sub) => {
    const roles = await original(workspace, sub);
    if (++calls === 1) { started(); await gate; }
    return roles;
  };
  const stale = resolveAuthzContext(user(), store);
  await entered;
  await store.grantRole(WS, "usr_1", "sales_rep");
  invalidateAuthz(WS, "usr_1");
  const freshContext = await resolveAuthzContext(user(), store);
  assert.ok(freshContext?.roles.includes("sales_rep"));
  release();
  await stale;
  assert.ok((await resolveAuthzContext(user(), store))?.roles.includes("sales_rep"));
});
