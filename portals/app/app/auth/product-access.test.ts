import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { toAuthUser } from "./lib/claims";
import { makeEntitlement } from "../entitlement/resolver";
import { InMemoryAuthzStore } from "../authz/store";
import { resetAuthzCache } from "../authz/context";
import { productAccessRevision, resolveProductEntryAccess } from "./product-access";
const ws = "11111111-1111-4111-8111-111111111111", org = "22222222-2222-4222-8222-222222222222", sub = "usr_33333333-3333-4333-8333-333333333333";
const user = toAuthUser({ sub, active_workspace: ws, active_org: org, roles: [] });
afterEach(resetAuthzCache);
function fixture() {
  const store = new InMemoryAuthzStore();
  let members = [{ subject: sub, displayName: "Member" }];
  let entitlement = makeEntitlement(ws, "yucer", { tier: "pro", status: "active" });
  let invalidations = 0, reads = 0;
  const dependencies = { store, resolver: { resolve: async () => entitlement, invalidate: () => { invalidations++; } }, roster: async (workspace: string, organization: string) => { assert.equal(workspace, ws); assert.equal(organization, org); reads++; return members; } };
  return { store, dependencies, setMembers: (value: typeof members) => { members = value; }, setEntitlement: (value: typeof entitlement) => { entitlement = value; }, reads: () => reads, invalidations: () => invalidations };
}
test("new assigned member enters with ordinary sales role and useful baseline", async () => {
  const f = fixture(), access = await resolveProductEntryAccess(user, false, f.dependencies);
  assert.equal(access.state, "ready"); assert.deepEqual(access.authz!.roles, ["sales_rep"]);
  for (const permission of ["account.read", "account.write", "pipeline.read", "pipeline.write", "catalog.read", "copilot.use"] as const) assert.ok(access.authz!.permissions.has(permission));
  assert.ok(!access.authz!.permissions.has("admin.manage"));
});
test("unassigned member creates no local member or default role", async () => {
  const f = fixture(); f.setMembers([]);
  assert.equal((await resolveProductEntryAccess(user, false, f.dependencies)).state, "unassigned"); assert.deepEqual(await f.store.listMembers(ws), []);
});
test("platform removal blocks cached local sales role and retains historical identity", async () => {
  const f = fixture(); assert.equal((await resolveProductEntryAccess(user, false, f.dependencies)).state, "ready"); f.setMembers([]);
  const denied = await resolveProductEntryAccess(user, false, f.dependencies);
  assert.equal(denied.state, "unassigned"); assert.equal(denied.authz, null); assert.equal(f.reads(), 2);
  assert.deepEqual(await f.store.rolesOf(ws, sub), ["sales_rep"]);
});
test("workspace owner cannot bypass revoked platform assignment", async () => {
  const f = fixture(); f.setMembers([]);
  assert.equal((await resolveProductEntryAccess({ ...user, roles: ["workspace:owner"], isWorkspaceOwner: true }, true, f.dependencies)).state, "unassigned"); assert.deepEqual(await f.store.listMembers(ws), []);
});
test("restored assignment preserves explicit local downgrade", async () => {
  const f = fixture(); await resolveProductEntryAccess(user, false, f.dependencies);
  await f.store.revokeRole(ws, sub, "sales_rep"); await f.store.grantRole(ws, sub, "viewer");
  f.setMembers([]); await resolveProductEntryAccess(user, false, f.dependencies); f.setMembers([{ subject: sub, displayName: "Member" }]);
  const access = await resolveProductEntryAccess(user, true, f.dependencies);
  assert.equal(access.state, "ready"); assert.deepEqual(access.authz!.roles, ["viewer"]);
});
test("explicit local full revoke remains roleless on recheck", async () => {
  const f = fixture(); await resolveProductEntryAccess(user, false, f.dependencies); await f.store.revokeRole(ws, sub, "sales_rep");
  const access = await resolveProductEntryAccess(user, true, f.dependencies);
  assert.equal(access.state, "no-roles"); assert.deepEqual(access.authz!.roles, []);
});
test("inactive assigned member stays blocked", async () => {
  const f = fixture(); await resolveProductEntryAccess(user, false, f.dependencies); await f.store.setMemberStatus(ws, sub, "inactive");
  const access = await resolveProductEntryAccess(user, true, f.dependencies); assert.equal(access.state, "no-roles"); assert.equal(access.authz!.permissions.size, 0);
});
test("network and unknown roster fail closed without stale allow", async () => {
  const f = fixture(); await resolveProductEntryAccess(user, false, f.dependencies);
  for (const roster of [async () => { throw Error("unavailable"); }, async () => null]) {
    const access = await resolveProductEntryAccess(user, true, { ...f.dependencies, roster }); assert.equal(access.state, "unavailable"); assert.equal(access.authz, null);
  }
});
test("tenant/workspace and C2 scope mismatch cannot initialize roles", async () => {
  const f = fixture();
  for (const person of [{ ...user, activeOrg: null }, { ...user, activeWorkspace: null }]) assert.equal((await resolveProductEntryAccess(person, true, f.dependencies)).state, "unavailable");
  for (const e of [makeEntitlement("other", "yucer", { tier: "pro" }), makeEntitlement(ws, "other", { tier: "pro" })]) { f.setEntitlement(e); assert.equal((await resolveProductEntryAccess(user, true, f.dependencies)).state, "unavailable"); }
  assert.deepEqual(await f.store.listMembers(ws), []); assert.equal(f.reads(), 0);
});
test("no commercial coverage requires subscription and no default", async () => {
  const f = fixture(); f.setEntitlement(makeEntitlement(ws, "yucer"));
  assert.equal((await resolveProductEntryAccess(user, true, f.dependencies)).state, "no-subscription"); assert.equal(f.reads(), 0); assert.deepEqual(await f.store.listMembers(ws), []);
});
test("bundled-only data retains strict UI gate and assignment check", async () => {
  const f = fixture(); await resolveProductEntryAccess(user, false, f.dependencies); f.setEntitlement(makeEntitlement(ws, "yucer", { bundled: true }));
  const access = await resolveProductEntryAccess(user, true, f.dependencies); assert.equal(access.state, "no-subscription"); assert.deepEqual(access.authz!.roles, ["sales_rep"]);
  f.setMembers([]); assert.equal((await resolveProductEntryAccess(user, true, f.dependencies)).authz, null);
});
test("fresh recheck refreshes authority; balances do not invalidate working forms", async () => {
  const f = fixture(), before = await resolveProductEntryAccess(user, true, f.dependencies); assert.equal(f.invalidations(), 1);
  const version = productAccessRevision(before); before.entitlement!.quota_pools = [{ metric: "tokens", remaining: 3, limit: 100, priority: 1 }]; assert.equal(productAccessRevision(before), version);
  before.authz!.roles = ["viewer"]; assert.notEqual(productAccessRevision(before), version);
});

test("equivalent commercial limits do not invalidate work because object key order changed", async () => {
  const f = fixture(), access = await resolveProductEntryAccess(user, true, f.dependencies);
  access.entitlement!.limits = { accounts: 20, members: 5 };
  const before = productAccessRevision(access);
  access.entitlement!.limits = { members: 5, accounts: 20 };
  assert.equal(productAccessRevision(access), before);
});

test("read-only probes never materialize a profile, seed roles or initialize defaults", async () => {
  const f = fixture();
  const store = new Proxy(f.store, { get(target, key) {
    if (["seeMember", "seedPresetRoles", "initializeMemberRole"].includes(String(key))) return () => { throw Error("write attempted"); };
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  const before = await resolveProductEntryAccess(user, true, { ...f.dependencies, store }, { initialize: false });
  assert.equal(before.state, "no-roles"); assert.deepEqual(await f.store.listMembers(ws), []);
  const entered = await resolveProductEntryAccess(user, true, f.dependencies);
  const after = await resolveProductEntryAccess(user, true, { ...f.dependencies, store }, { initialize: false });
  assert.equal(after.state, "ready"); assert.equal(productAccessRevision(after), productAccessRevision(entered));
  await f.store.setMemberStatus(ws, sub, "inactive");
  const inactive = await resolveProductEntryAccess(user, true, f.dependencies);
  const probed = await resolveProductEntryAccess(user, true, { ...f.dependencies, store }, { initialize: false });
  assert.equal(probed.state, "no-roles"); assert.equal(productAccessRevision(probed), productAccessRevision(inactive));
});
