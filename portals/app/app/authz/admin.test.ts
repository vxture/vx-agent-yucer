import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../entitlement/types";
import { unwrap } from "../domains/shared/result";
import { permissionsForRoles, type RoleCode } from "./catalog";
import { InMemoryAuthzStore } from "./store";
import {
  assignRole,
  deactivateMember,
  listWorkspaceMembers,
  reactivateMember,
  revokeRole,
  setMemberScope,
  type AdminContext,
} from "./admin";

const WS = "ws_1";

function ctx(role: RoleCode | null, tier: Entitlement["tier"], store: InMemoryAuthzStore): AdminContext {
  return {
    workspaceId: WS,
    sub: "usr_admin",
    holder: { permissions: new Set(role ? permissionsForRoles([role]) : []) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

async function rolesOf(store: InMemoryAuthzStore, sub: string): Promise<string[]> {
  return [...(await store.rolesOf(WS, sub))].sort();
}

// --- Both gates ------------------------------------------------------------

test("a member without admin.manage cannot list members", async () => {
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_rep"]);
  const r = await listWorkspaceMembers(ctx("sales_rep", "enterprise", store));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("a member without admin.manage cannot grant a role", async () => {
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_target", []);
  const r = await assignRole(ctx("sales_rep", "enterprise", store), "usr_target", "sales_rep");
  assert.equal(r.ok, false);
  assert.deepEqual(await rolesOf(store, "usr_target"), [], "nothing was written");
});

test("administration survives a workspace with no feature entitlement", async () => {
  // admin.member.* carries feature: null. A workspace that could not administer
  // its own members because of its price plan would be one nobody can get into.
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_ops"]);
  store.seed(WS, "usr_target", []);
  unwrap(await assignRole(ctx("sales_ops", "free", store), "usr_target", "viewer"));
  assert.deepEqual(await rolesOf(store, "usr_target"), ["viewer"]);
});

test("an unsubscribed workspace cannot administer members either", async () => {
  // feature: null skips the per-feature check, not base product access.
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_ops"]);
  const r = await listWorkspaceMembers(ctx("sales_ops", null, store));
  assert.equal(r.ok, false);
});

// --- Granting --------------------------------------------------------------

test("granting a role makes a locked-out member able to see the product", async () => {
  // The whole reason this surface exists: without it a member's row is created
  // at first login with no roles and nothing can ever change that.
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  await store.seeMember({ workspaceId: WS, sub: "usr_new" });
  assert.deepEqual(await rolesOf(store, "usr_new"), [], "a new member starts with nothing");

  const member = unwrap(await assignRole(ctx("sales_leader", "pro", store), "usr_new", "sales_rep"));
  assert.deepEqual(member.roles, ["sales_rep"]);
  assert.ok((await store.permissionsOf(WS, "usr_new")).includes("pipeline.write"));
});

test("a role outside the catalog is refused rather than silently dropped", async () => {
  // The in-memory adapter ignores an unknown code and Prisma would fail on a
  // foreign key. Without this check the two adapters disagree about what just
  // happened.
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  store.seed(WS, "usr_target", []);
  const r = await assignRole(ctx("sales_leader", "pro", store), "usr_target", "superuser");
  assert.equal(r.ok === false && r.violations[0].code, "unknown_role");
});

test("granting the same role twice does not duplicate it", async () => {
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  store.seed(WS, "usr_target", []);
  const c = ctx("sales_leader", "pro", store);
  unwrap(await assignRole(c, "usr_target", "viewer"));
  const twice = unwrap(await assignRole(c, "usr_target", "viewer"));
  assert.deepEqual(twice.roles, ["viewer"]);
});

test("a member can hold several roles at once", async () => {
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  store.seed(WS, "usr_target", []);
  const c = ctx("sales_leader", "pro", store);
  unwrap(await assignRole(c, "usr_target", "sales_rep"));
  unwrap(await assignRole(c, "usr_target", "delivery_manager"));
  assert.deepEqual(await rolesOf(store, "usr_target"), ["delivery_manager", "sales_rep"]);
});

// --- The last-administrator guard -----------------------------------------

test("the last administrator cannot remove their own admin role", async () => {
  // The owner bootstrap runs on FIRST sighting only, deliberately, so it cannot
  // resurrect a role someone removed on purpose. That means a workspace with
  // nobody holding admin.manage has no path back - not through a later login,
  // not through the platform. This refusal is the difference between a
  // recoverable mistake and a repair against the database by hand.
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  const r = await revokeRole(ctx("sales_leader", "pro", store), "usr_admin", "sales_leader");
  assert.equal(r.ok === false && r.violations[0].code, "last_admin");
  assert.deepEqual(await rolesOf(store, "usr_admin"), ["sales_leader"]);
});

test("demoting a colleague is allowed while the actor still administers", async () => {
  // The guard asks about the WORKSPACE, not about the actor. Reaching zero
  // administrators needs the actor to drop their own last admin role - a
  // colleague can never be the last one while the person revoking also holds
  // it - so this is the case that must NOT be blocked, and a guard keyed to
  // "the target is an admin" rather than "anyone would be left" would block it.
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  store.seed(WS, "usr_second", ["sales_ops"]);

  const member = unwrap(await revokeRole(ctx("sales_leader", "pro", store), "usr_second", "sales_ops"));
  assert.deepEqual(member.roles, []);
  assert.deepEqual(await rolesOf(store, "usr_admin"), ["sales_leader"]);
});

test("an administrator may step down once another one exists", async () => {
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  store.seed(WS, "usr_two", ["sales_ops"]);
  const member = unwrap(await revokeRole(ctx("sales_leader", "pro", store), "usr_admin", "sales_leader"));
  assert.deepEqual(member.roles, []);
  assert.deepEqual(await rolesOf(store, "usr_two"), ["sales_ops"], "the remaining admin is untouched");
});

test("the guard counts the permission, not the role name", async () => {
  // sales_ops and sales_leader both carry admin.manage by different routes.
  // A guard keyed to one role code would miss the other.
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_ops"]);
  const r = await revokeRole(ctx("sales_ops", "pro", store), "usr_admin", "sales_ops");
  assert.equal(r.ok === false && r.violations[0].code, "last_admin");
});

test("a member holding two admin-carrying roles may lose one of them", async () => {
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader", "sales_ops"]);
  const member = unwrap(await revokeRole(ctx("sales_leader", "pro", store), "usr_admin", "sales_ops"));
  assert.deepEqual(member.roles, ["sales_leader"], "they still administer the workspace");
});

test("a non-admin role is revocable without the guard firing", async () => {
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  store.seed(WS, "usr_target", ["sales_rep"]);
  const member = unwrap(await revokeRole(ctx("sales_leader", "pro", store), "usr_target", "sales_rep"));
  assert.deepEqual(member.roles, []);
});

// --- Listing ---------------------------------------------------------------

test("the list is workspace-scoped", async () => {
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  store.seed("ws_other", "usr_elsewhere", ["sales_rep"]);
  const members = unwrap(await listWorkspaceMembers(ctx("sales_leader", "pro", store)));
  assert.deepEqual(
    members.map((m) => m.sub),
    ["usr_admin"],
  );
});

test("the list is stably ordered, so a grant does not reshuffle the table", async () => {
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_c", ["viewer"]);
  store.seed(WS, "usr_admin", ["sales_leader"]);
  store.seed(WS, "usr_b", []);
  const c = ctx("sales_leader", "pro", store);

  const before = unwrap(await listWorkspaceMembers(c)).map((m) => m.sub);
  unwrap(await assignRole(c, "usr_b", "sales_rep"));
  const after = unwrap(await listWorkspaceMembers(c)).map((m) => m.sub);
  assert.deepEqual(before, after);
  assert.deepEqual(before, ["usr_admin", "usr_b", "usr_c"]);
});

test("a roleless member appears in the list rather than being invisible", async () => {
  // They are the reason an administrator opens this screen.
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  await store.seeMember({ workspaceId: WS, sub: "usr_new" });
  const members = unwrap(await listWorkspaceMembers(ctx("sales_leader", "pro", store)));
  const target = members.find((m) => m.sub === "usr_new");
  assert.ok(target);
  assert.deepEqual(target.roles, []);
});


// --- People leave (2026-09-01) ----------------------------------------------
//
// The owner's ruling: the platform decides who may use the app and how many
// seats there are; the product decides activation, deactivation, and what
// happens to the history. These tests hold the product's half.

test("deactivating keeps the row and takes the roles", async () => {
  // THE ROW IS THE POINT. Every attribution column in the product stores a sub
  // as plain text, so deleting the member breaks no foreign key - it just makes
  // every signature in the audit trail an unreadable `usr_<uuid>`.
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_leaver", displayName: "Leaver" });
  await store.grantRole(WS, "usr_leaver", "sales_rep");
  await store.seeMember({ workspaceId: WS, sub: "usr_admin" });
  await store.grantRole(WS, "usr_admin", "sales_leader");

  const out = unwrap(await deactivateMember(ctx("sales_leader", "pro", store), "usr_leaver"));
  assert.equal(out.status, "inactive");
  assert.equal(out.displayName, "Leaver", "the name that makes the audit trail readable survives");
  assert.deepEqual(await rolesOf(store, "usr_leaver"), []);

  const members = await store.listMembers(WS);
  assert.ok(
    members.some((m) => m.sub === "usr_leaver"),
    "the member row must never be deleted",
  );
});

test("coming back restores nothing - the roles were dropped, not remembered", async () => {
  // THE HOLE THIS VERB CLOSES. The platform can grant the same sub access again
  // - a transfer back, a rehire - and `seeMember` does not re-run the owner
  // bootstrap or re-examine roles. Without dropping them on the way out, that
  // person walks back in still holding sales_leader because nobody ever took it
  // away. Coming back has to be a decision somebody makes again.
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_boomerang" });
  await store.grantRole(WS, "usr_boomerang", "sales_rep");
  await store.seeMember({ workspaceId: WS, sub: "usr_admin" });
  await store.grantRole(WS, "usr_admin", "sales_leader");
  const c = ctx("sales_leader", "pro", store);

  await deactivateMember(c, "usr_boomerang");
  const back = unwrap(await reactivateMember(c, "usr_boomerang"));
  assert.equal(back.status, "active");
  assert.deepEqual(await rolesOf(store, "usr_boomerang"), [], "no role comes back on its own");
});

test("signing in again does not undo a deactivation", async () => {
  // seeMember is a lazy upsert that runs on every login. If it touched status,
  // a deactivated person would reactivate themselves simply by being seen -
  // and the platform is what stops them signing in, so the product would be
  // relying on a control it does not own.
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_gone" });
  await store.seeMember({ workspaceId: WS, sub: "usr_admin" });
  await store.grantRole(WS, "usr_admin", "sales_leader");
  await deactivateMember(ctx("sales_leader", "pro", store), "usr_gone");

  await store.seeMember({ workspaceId: WS, sub: "usr_gone", displayName: "Seen again" });
  const members = await store.listMembers(WS);
  assert.equal(members.find((m) => m.sub === "usr_gone")?.status, "inactive");
});

test("the last administrator cannot be deactivated either", async () => {
  // The same fact revokeRole guards, reached by a different door: a workspace
  // with nobody holding admin.manage has no path back, not through a later
  // login and not through the platform.
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_admin" });
  await store.grantRole(WS, "usr_admin", "sales_leader");

  const r = await deactivateMember(ctx("sales_leader", "pro", store), "usr_admin");
  assert.equal(r.ok === false && r.violations[0].code, "last_admin");
  assert.deepEqual(await rolesOf(store, "usr_admin"), ["sales_leader"], "and nothing was taken");
});

test("deactivating an admin is fine while another one remains", async () => {
  const store = new InMemoryAuthzStore();
  for (const sub of ["usr_admin", "usr_admin2"]) {
    await store.seeMember({ workspaceId: WS, sub });
    await store.grantRole(WS, sub, "sales_leader");
  }
  const out = unwrap(await deactivateMember(ctx("sales_leader", "pro", store), "usr_admin2"));
  assert.equal(out.status, "inactive");
});

test("a sub nobody has ever seen is not_found, not a silent no-op", async () => {
  // Deactivating somebody who is not a member should say so: a UI that reported
  // success would let an admin believe they had removed access from a person
  // this workspace has no record of.
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_admin" });
  await store.grantRole(WS, "usr_admin", "sales_leader");
  const r = await deactivateMember(ctx("sales_leader", "pro", store), "usr_ghost");
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

test("deactivation needs admin.manage, like every other member write", async () => {
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_x" });
  const r = await deactivateMember(ctx("sales_rep", "pro", store), "usr_x");
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});


// --- Who sees what (incr/0022) ----------------------------------------------

test("an administrator decides the scope, and a rep cannot", async () => {
  // The owner's ruling: the decision belongs to the workspace administrator,
  // not to the role. admin.manage is held by sales_leader AND sales_ops, which
  // is what "not necessarily the GM" means in this catalogue.
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_rep" });

  const denied = await setMemberScope(ctx("sales_rep", "pro", store), "usr_rep", {
    kind: "own",
    territoryIds: [],
  });
  assert.equal(denied.ok === false && denied.violations[0].code, "permission_denied");

  const ok = unwrap(
    await setMemberScope(ctx("sales_ops", "pro", store), "usr_rep", {
      kind: "own",
      territoryIds: [],
    }),
  );
  assert.equal(ok.scope, "own");
});

test("a territory scope with no territory is refused, not saved half-done", async () => {
  // It would resolve to seeing nothing, which is the safe direction - but the
  // administrator who saved it would believe they had granted a region.
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_dir" });
  const r = await setMemberScope(ctx("sales_leader", "pro", store), "usr_dir", {
    kind: "territory",
    territoryIds: [],
  });
  assert.equal(r.ok === false && r.violations[0].code, "territory_required");
  assert.equal((await store.getScope(WS, "usr_dir")).kind, "workspace", "and nothing was saved");
});

test("switching away from territory drops the assignment rather than keeping it", async () => {
  // A stale list is not an error to report, but storing it would leave a
  // configuration that looks assigned and is not.
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_dir" });
  const c = ctx("sales_leader", "pro", store);
  await setMemberScope(c, "usr_dir", { kind: "territory", territoryIds: ["t_east"] });
  assert.deepEqual((await store.getScope(WS, "usr_dir")).territoryIds, ["t_east"]);

  await setMemberScope(c, "usr_dir", { kind: "own", territoryIds: [] });
  assert.deepEqual((await store.getScope(WS, "usr_dir")).territoryIds, []);
});

test("a member nobody has seen cannot be scoped", async () => {
  const store = new InMemoryAuthzStore();
  await store.seeMember({ workspaceId: WS, sub: "usr_admin" });
  const r = await setMemberScope(ctx("sales_leader", "pro", store), "usr_ghost", {
    kind: "own",
    territoryIds: [],
  });
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

test("a sub with no row reads as unscoped, not as invisible", async () => {
  // Somebody the workspace has never seen has had nothing decided about them.
  // Defaulting to a narrow scope would hide rows from a member whose row simply
  // has not been written yet.
  const store = new InMemoryAuthzStore();
  assert.equal((await store.getScope(WS, "usr_never_seen")).kind, "workspace");
});
