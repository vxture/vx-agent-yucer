import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../entitlement/types";
import { unwrap } from "../domains/shared/result";
import {
  DEFAULT_ROLE_LINES,
  DEFAULT_ROLE_RANKS,
  PERM_CODES,
  PRESET_ROLE_ORDER,
  ROLE_PERMISSIONS,
  permissionsForRoles,
  presetRoles,
  type RoleCode,
} from "./catalog";
import { InMemoryAuthzStore } from "./store";
import { InMemoryAuditStore, setAuditStore } from "../audit/lib/store";
import { assignRole, revokeRole } from "./admin";
import { resolveAuthzContext, resetAuthzCache } from "./context";
import { toAuthUser } from "../auth/lib/claims";
import {
  isPresetRole,
  listRoleGroups,
  listRoles,
  moveRole,
  moveRoleGroup,
  removeRole,
  removeRoleGroup,
  resetPresetRoles,
  saveRole,
  saveRoleGroup,
  type RoleContext,
} from "./roles";

/* 角色管理 (incr/0046, 0047) against the in-memory store - the same verbs the
 * Prisma adapter answers from local_authz.workspace_role, role_line and
 * role_rank, proven there by workspace-role.db.test.ts. */

const WS = "11111111-1111-1111-1111-111111111146";

function ctx(role: RoleCode | null, store: InMemoryAuthzStore, tier: Entitlement["tier"] = "enterprise"): RoleContext {
  return {
    workspaceId: WS,
    sub: "usr_admin",
    holder: { permissions: new Set(role ? permissionsForRoles([role]) : []) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

function fresh(): InMemoryAuthzStore {
  setAuditStore(new InMemoryAuditStore());
  const store = new InMemoryAuthzStore();
  store.seed(WS, "usr_admin", ["sales_leader"]);
  return store;
}

/** The ids of a shipped line and rung in this workspace - what the form sends. */
async function group(store: InMemoryAuthzStore, line = "sales", rank = "staff") {
  const lines = await store.listRoleGroups(WS, "line");
  const ranks = await store.listRoleGroups(WS, "rank");
  return { lineId: lines.find((g) => g.code === line)!.id, rankId: ranks.find((g) => g.code === rank)!.id };
}

const draft = async (store: InMemoryAuthzStore, over: Partial<{
  code: string; name: string; description: string; lineId: string; rankId: string; permissions: readonly string[];
}> = {}) => ({
  code: "partner_ops", name: "伙伴运营", description: "", permissions: ["account.read"] as readonly string[],
  ...(await group(store, "channel", "staff")),
  ...over,
});

// --- the presets --------------------------------------------------------------

test("a workspace starts from the 31 presets, in roster order, grouped, and they read as 系统预置", async () => {
  const store = fresh();
  const rows = unwrap(await listRoles(ctx("sales_leader", store)));
  assert.deepEqual(rows.map((r) => r.code), [...PRESET_ROLE_ORDER]);
  assert.equal(rows.length, 31);
  assert.ok(rows.every((r) => r.preset), "untouched presets are presets");
  assert.equal(rows.find((r) => r.code === "sales_ops")?.line?.code, "ops");
  assert.equal(rows.find((r) => r.code === "sales_ops")?.name, "高级运营经理");
  assert.equal(rows.find((r) => r.code === "regional_general_manager")?.rank?.code, "general_manager");
  assert.deepEqual(rows.find((r) => r.code === "viewer")?.permissions, [...ROLE_PERMISSIONS.viewer]);
  assert.equal(rows.find((r) => r.code === "sales_leader")?.members, 1);
  // And the two vocabularies were seeded with the shipped lists, in order.
  const lines = unwrap(await listRoleGroups(ctx("sales_leader", store), "line"));
  assert.deepEqual(lines.map((g) => g.code), DEFAULT_ROLE_LINES.map((g) => g.code));
  assert.equal(lines.find((g) => g.code === "sales")?.roles, 7, "seven presets stand in 销售");
  const ranks = unwrap(await listRoleGroups(ctx("sales_leader", store), "rank"));
  assert.deepEqual(ranks.map((g) => g.name), DEFAULT_ROLE_RANKS.map((g) => g.name));
});

test("the first sighting materialises the presets and the vocabularies, so the owner bootstrap finds sales_leader", async () => {
  resetAuthzCache();
  const store = new InMemoryAuthzStore();
  assert.deepEqual(await store.listRoles(WS), []);
  const owner = toAuthUser({ sub: "usr_owner", active_workspace: WS, roles: ["workspace:owner"] });
  const c = await resolveAuthzContext(owner, store);
  assert.deepEqual(c?.roles, ["sales_leader"]);
  assert.equal((await store.listRoles(WS)).length, 31);
  assert.equal((await store.listRoleGroups(WS, "line")).length, 8);
  assert.equal((await store.listRoleGroups(WS, "rank")).length, 6);
  // Seeding is once: a second workspace-level seed changes nothing.
  assert.equal(await store.seedPresetRoles(WS), false);
});

test("a member's permissions come from the WORKSPACE'S rows, not the build's table", async () => {
  const store = fresh();
  store.seed(WS, "usr_rep", ["sales_rep"]);
  // Narrow sales_rep: take away pipeline.write.
  const narrowed = ROLE_PERMISSIONS.sales_rep.filter((p) => p !== "pipeline.write");
  unwrap(await saveRole(ctx("sales_leader", store), await draft(store, {
    code: "sales_rep", name: "销售代表", permissions: narrowed,
  })));
  const perms = await store.permissionsOf(WS, "usr_rep");
  assert.ok(!perms.includes("pipeline.write"), "the narrowed grant is gone for the member");
  assert.ok(perms.includes("pipeline.read"));
  // And the row reads as the tenant's now.
  const rows = unwrap(await listRoles(ctx("sales_leader", store)));
  assert.equal(rows.find((r) => r.code === "sales_rep")?.preset, false);
});

test("isPresetRole compares name, description, group codes and the whole grant set", () => {
  const presets = presetRoles();
  const viewer = presets.find((p) => p.code === "viewer")!;
  const asRow = { ...viewer, line: { code: viewer.line }, rank: { code: viewer.rank }, permissions: [...viewer.permissions] };
  assert.equal(isPresetRole(presets, asRow), true);
  assert.equal(isPresetRole(presets, { ...asRow, name: "观察员" }), false);
  assert.equal(isPresetRole(presets, { ...asRow, description: "x" }), false);
  assert.equal(isPresetRole(presets, { ...asRow, permissions: viewer.permissions.slice(1) }), false);
  assert.equal(isPresetRole(presets, { ...asRow, line: { code: "sales" } }), false);
  assert.equal(isPresetRole(presets, { ...asRow, rank: null }), false);
  assert.equal(isPresetRole(presets, { ...asRow, permissions: [...viewer.permissions, "admin.manage"] }), false);
  assert.equal(isPresetRole(presets, { code: "channel", name: "渠道", description: "", line: null, rank: null, permissions: [] }), false);
});

// --- both gates -----------------------------------------------------------------

test("a member without admin.manage can neither list nor change roles", async () => {
  const store = fresh();
  store.seed(WS, "usr_rep", ["sales_rep"]);
  const c = { ...ctx("sales_rep", store), sub: "usr_rep" };
  assert.equal((await listRoles(c)).ok, false);
  const r = await saveRole(c, await draft(store, { code: "x", name: "x" }));
  assert.equal(r.ok === false && r.violations[0]!.code, "permission_denied");
  assert.equal((await store.listRoles(WS)).length, 31, "nothing was written");
});

test("role administration survives a workspace with no feature entitlement", async () => {
  const store = fresh();
  unwrap(await saveRole(ctx("sales_leader", store, "free"), await draft(store)));
  assert.equal((await store.listRoles(WS)).length, 32);
});

// --- saving ---------------------------------------------------------------------

test("a new role is created after the presets, in its group, with the grants stated, and reads as 自定义", async () => {
  const store = fresh();
  const row = unwrap(await saveRole(ctx("sales_leader", store), await draft(store, {
    description: "经营伙伴体系。",
    permissions: ["account.read", "pipeline.read", "account.read"],
  })));
  assert.equal(row.sortOrder, 32);
  assert.equal(row.line?.code, "channel");
  assert.equal(row.rank?.code, "staff");
  assert.deepEqual(row.permissions, ["account.read", "pipeline.read"], "de-duplicated, catalogue order");
  const rows = unwrap(await listRoles(ctx("sales_leader", store)));
  const mine = rows.find((r) => r.code === "partner_ops")!;
  assert.equal(mine.preset, false);
  assert.equal(mine.description, "经营伙伴体系。");
  // And it can be granted.
  unwrap(await assignRole({ ...ctx("sales_leader", store) }, "usr_new", "partner_ops"));
  assert.deepEqual(await store.permissionsOf(WS, "usr_new"), ["account.read", "pipeline.read"]);
});

test("saving an existing code renames and re-groups it and replaces its grants whole; the code stays", async () => {
  const store = fresh();
  unwrap(await saveRole(ctx("sales_leader", store), await draft(store, {
    code: "viewer", name: "观察员", description: "只看。", permissions: ["account.read"],
    ...(await group(store, "group", "manager")),
  })));
  const rows = await store.listRoles(WS);
  const v = rows.find((r) => r.code === "viewer")!;
  assert.equal(v.name, "观察员");
  assert.equal(v.rank?.code, "manager");
  assert.deepEqual(v.permissions, ["account.read"]);
  assert.equal(rows.length, 31, "an edit is not a second row");
});

test("the code, the name, the groups and the permissions are validated in the product's words", async () => {
  const store = fresh();
  const c = ctx("sales_leader", store);
  const code = async (over: Partial<{ code: string; name: string; lineId: string; rankId: string; permissions: string[] }>) => {
    const r = await saveRole(c, await draft(store, { code: "ok_code", name: "x", permissions: [], ...over }));
    return r.ok ? "ok" : r.violations[0]!.code;
  };
  assert.equal(await code({ code: " " }), "code_required");
  assert.equal(await code({ code: "Channel" }), "code_shape");
  assert.equal(await code({ code: "9lives" }), "code_shape");
  assert.equal(await code({ code: "with-dash" }), "code_shape");
  assert.equal(await code({ name: "  " }), "name_required");
  assert.equal(await code({ lineId: "nope" }), "line_unknown");
  assert.equal(await code({ rankId: "nope" }), "rank_unknown");
  assert.equal(await code({ permissions: ["account.read", "nope.write"] }), "permission_unknown");
  assert.equal((await store.listRoles(WS)).length, 31, "nothing was written");
});

test("taking admin.manage off the only administrative role anybody holds is refused", async () => {
  const store = fresh(); // usr_admin holds sales_leader, the only admin holder
  const leader = await draft(store, {
    code: "sales_leader", name: "销售负责人",
    permissions: ROLE_PERMISSIONS.sales_leader.filter((p) => p !== "admin.manage"),
    ...(await group(store, "group", "executive")),
  });
  const r = await saveRole(ctx("sales_leader", store), leader);
  assert.equal(r.ok === false && r.violations[0]!.code, "last_admin");
  // Give somebody sales_ops (which also administers) and the same edit lands.
  store.seed(WS, "usr_ops", ["sales_ops"]);
  unwrap(await saveRole(ctx("sales_leader", store), leader));
  // An INACTIVE administrator does not count.
  await store.setMemberStatus(WS, "usr_ops", "inactive");
  const again = await saveRole(ctx("sales_leader", store), await draft(store, {
    code: "sales_ops", name: "高级运营经理", permissions: ["planning.read"],
  }));
  assert.equal(again.ok === false && again.violations[0]!.code, "last_admin");
});

// --- removing ---------------------------------------------------------------------

test("a role somebody holds cannot be removed; an unheld one can; an unknown one is named", async () => {
  const store = fresh();
  store.seed(WS, "usr_rep", ["sales_rep"]);
  const held = await removeRole(ctx("sales_leader", store), "sales_rep");
  assert.equal(held.ok === false && held.violations[0]!.code, "role_in_use");
  unwrap(await removeRole(ctx("sales_leader", store), "presales"));
  assert.equal((await store.listRoles(WS)).length, 30);
  const gone = await removeRole(ctx("sales_leader", store), "presales");
  assert.equal(gone.ok === false && gone.violations[0]!.code, "role_unknown");
  // And the store itself refuses a held one, whatever the caller checked.
  await assert.rejects(store.removeRole(WS, "sales_rep"), /still held/);
});

test("a removed role cannot be assigned, and revoking a role the workspace lacks is refused", async () => {
  const store = fresh();
  unwrap(await removeRole(ctx("sales_leader", store), "presales"));
  const r = await assignRole(ctx("sales_leader", store), "usr_x", "presales");
  assert.equal(r.ok === false && r.violations[0]!.code, "unknown_role");
  const v = await revokeRole(ctx("sales_leader", store), "usr_admin", "presales");
  assert.equal(v.ok === false && v.violations[0]!.code, "unknown_role");
});

// --- ordering ---------------------------------------------------------------------

test("the four moves renumber the whole list densely and refuse the edges", async () => {
  const store = fresh();
  const codes = async () => (await store.listRoles(WS)).map((r) => r.code);
  unwrap(await moveRole(ctx("sales_leader", store), { code: "viewer", direction: "top" }));
  assert.equal((await codes())[0], "viewer");
  unwrap(await moveRole(ctx("sales_leader", store), { code: "viewer", direction: "down" }));
  assert.deepEqual((await codes()).slice(0, 2), ["executive", "viewer"]);
  unwrap(await moveRole(ctx("sales_leader", store), { code: "viewer", direction: "bottom" }));
  assert.equal((await codes())[30], "viewer");
  const edge = await moveRole(ctx("sales_leader", store), { code: "viewer", direction: "down" });
  assert.equal(edge.ok === false && edge.violations[0]!.code, "move_at_edge");
  const orders = (await store.listRoles(WS)).map((r) => r.sortOrder);
  assert.deepEqual(orders, orders.map((_, i) => i + 1), "dense after any move");
});

// --- reset ------------------------------------------------------------------------

test("重置预置 restores edited and deleted presets, keeps custom roles, and reports the count", async () => {
  const store = fresh();
  const c = ctx("sales_leader", store);
  unwrap(await saveRole(c, await draft(store, { code: "viewer", name: "观察员", permissions: ["account.read"] })));
  unwrap(await removeRole(c, "presales"));
  unwrap(await saveRole(c, await draft(store)));
  unwrap(await moveRole(c, { code: "partner_ops", direction: "top" }));

  const r = unwrap(await resetPresetRoles(c));
  assert.equal(r.restored, 2, "viewer and presales");
  assert.equal(r.unchanged, 29);
  const rows = unwrap(await listRoles(c));
  assert.deepEqual(rows.map((x) => x.code), [...PRESET_ROLE_ORDER, "partner_ops"], "presets first, in order, custom after");
  assert.ok(rows.filter((x) => x.code !== "partner_ops").every((x) => x.preset));
  assert.equal(rows.find((x) => x.code === "partner_ops")?.name, "伙伴运营", "the custom role is untouched");
  // Nothing to restore the second time.
  assert.equal(unwrap(await resetPresetRoles(c)).restored, 0);
});

test("重置预置 brings back a shipped group the tenant had deleted, when a preset needs it", async () => {
  const store = fresh();
  const c = ctx("sales_leader", store);
  // Empty the 售前 line of its two presets, delete the line, then reset.
  unwrap(await removeRole(c, "presales"));
  unwrap(await removeRole(c, "senior_presales"));
  unwrap(await removeRole(c, "presales_head"));
  const line = (await store.listRoleGroups(WS, "line")).find((g) => g.code === "presales")!;
  unwrap(await removeRoleGroup(c, "line", line.id));
  assert.equal((await store.listRoleGroups(WS, "line")).length, 7);
  unwrap(await resetPresetRoles(c));
  const back = (await store.listRoleGroups(WS, "line")).find((g) => g.code === "presales");
  assert.ok(back, "the line is back with its shipped name");
  assert.equal(back.name, "售前");
  assert.equal((await store.listRoles(WS)).find((r) => r.code === "presales")?.line?.id, back.id);
});

// --- the two vocabularies ------------------------------------------------------------

test("a group is added, renamed by its code, re-ordered, and deleted only while empty", async () => {
  const store = fresh();
  const c = ctx("sales_leader", store);
  const made = unwrap(await saveRoleGroup(c, "line", { code: "public_sector", name: "政企" }));
  assert.equal(made.sortOrder, 9);
  unwrap(await saveRoleGroup(c, "line", { code: "public_sector", name: "政企与公共" }));
  let lines = unwrap(await listRoleGroups(c, "line"));
  assert.equal(lines.length, 9, "a rename is not a second row");
  assert.equal(lines[8]!.name, "政企与公共");
  unwrap(await moveRoleGroup(c, "line", { id: made.id, direction: "up" }));
  lines = unwrap(await listRoleGroups(c, "line"));
  assert.equal(lines[7]!.code, "public_sector");
  // Validation, in the product's words.
  const bad = await saveRoleGroup(c, "rank", { code: "Boss", name: "x" });
  assert.equal(bad.ok === false && bad.violations[0]!.code, "code_shape");
  const blank = await saveRoleGroup(c, "rank", { code: "boss", name: " " });
  assert.equal(blank.ok === false && blank.violations[0]!.code, "name_required");
  // A group with roles in it cannot go; an empty one can.
  const sales = lines.find((g) => g.code === "sales")!;
  const used = await removeRoleGroup(c, "line", sales.id);
  assert.equal(used.ok === false && used.violations[0]!.code, "line_in_use");
  unwrap(await removeRoleGroup(c, "line", made.id));
  assert.equal(unwrap(await listRoleGroups(c, "line")).length, 8);
  // And the store itself refuses a used one, whatever the caller checked.
  await assert.rejects(store.removeRoleGroup(WS, "line", sales.id), /still has roles/);
  // A reader without admin.manage sees neither list.
  store.seed(WS, "usr_rep", ["sales_rep"]);
  assert.equal((await listRoleGroups({ ...ctx("sales_rep", store), sub: "usr_rep" }, "rank")).ok, false);
});

test("every permission a preset grants is one the catalogue has, and every preset names a shipped group", () => {
  for (const p of presetRoles()) {
    for (const perm of p.permissions) assert.ok(PERM_CODES.includes(perm), `${p.code}: ${perm}`);
    assert.ok(p.name.length > 0 && p.description.length > 0, `${p.code} has a name and a sentence`);
    assert.ok(DEFAULT_ROLE_LINES.some((g) => g.code === p.line), `${p.code}: line ${p.line}`);
    assert.ok(DEFAULT_ROLE_RANKS.some((g) => g.code === p.rank), `${p.code}: rank ${p.rank}`);
  }
});
