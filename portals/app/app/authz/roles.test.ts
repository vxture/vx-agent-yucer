import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../entitlement/types";
import { unwrap } from "../domains/shared/result";
import { PERM_CODES, ROLE_CODES, ROLE_PERMISSIONS, permissionsForRoles, presetRoles, type RoleCode } from "./catalog";
import { InMemoryAuthzStore } from "./store";
import { InMemoryAuditStore, setAuditStore } from "../audit/lib/store";
import { assignRole, revokeRole } from "./admin";
import { resolveAuthzContext, resetAuthzCache } from "./context";
import { toAuthUser } from "../auth/lib/claims";
import {
  isPresetRole,
  listRoles,
  moveRole,
  removeRole,
  resetPresetRoles,
  saveRole,
  type RoleContext,
} from "./roles";

/* 角色管理 (incr/0046) against the in-memory store - the same verbs the
 * Prisma adapter answers from local_authz.workspace_role, proven there by
 * workspace-role.db.test.ts. */

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

// --- the presets --------------------------------------------------------------

test("a workspace starts from the nine presets, in catalogue order, and they read as 系统预置", async () => {
  const store = fresh();
  const rows = unwrap(await listRoles(ctx("sales_leader", store)));
  assert.deepEqual(rows.map((r) => r.code), [...ROLE_CODES]);
  assert.ok(rows.every((r) => r.preset), "untouched presets are presets");
  assert.deepEqual(rows.find((r) => r.code === "viewer")?.permissions, [...ROLE_PERMISSIONS.viewer]);
  assert.equal(rows.find((r) => r.code === "sales_leader")?.members, 1);
});

test("the first sighting materialises the presets, so the owner bootstrap finds sales_leader", async () => {
  resetAuthzCache();
  const store = new InMemoryAuthzStore();
  assert.deepEqual(await store.listRoles(WS), []);
  const owner = toAuthUser({ sub: "usr_owner", active_workspace: WS, roles: ["workspace:owner"] });
  const c = await resolveAuthzContext(owner, store);
  assert.deepEqual(c?.roles, ["sales_leader"]);
  assert.equal((await store.listRoles(WS)).length, 9);
  // Seeding is once: a second workspace-level seed changes nothing.
  assert.equal(await store.seedPresetRoles(WS), false);
});

test("a member's permissions come from the WORKSPACE'S rows, not the build's table", async () => {
  const store = fresh();
  store.seed(WS, "usr_rep", ["sales_rep"]);
  // Narrow sales_rep: take away pipeline.write.
  const narrowed = ROLE_PERMISSIONS.sales_rep.filter((p) => p !== "pipeline.write");
  unwrap(await saveRole(ctx("sales_leader", store), {
    code: "sales_rep", name: "销售代表", description: "", permissions: narrowed,
  }));
  const perms = await store.permissionsOf(WS, "usr_rep");
  assert.ok(!perms.includes("pipeline.write"), "the narrowed grant is gone for the member");
  assert.ok(perms.includes("pipeline.read"));
  // And the row reads as the tenant's now.
  const rows = unwrap(await listRoles(ctx("sales_leader", store)));
  assert.equal(rows.find((r) => r.code === "sales_rep")?.preset, false);
});

test("isPresetRole compares name, description and the whole grant set", () => {
  const presets = presetRoles();
  const viewer = presets.find((p) => p.code === "viewer")!;
  assert.equal(isPresetRole(presets, { ...viewer, permissions: [...viewer.permissions] }), true);
  assert.equal(isPresetRole(presets, { ...viewer, name: "观察员" }), false);
  assert.equal(isPresetRole(presets, { ...viewer, description: "x" }), false);
  assert.equal(isPresetRole(presets, { ...viewer, permissions: viewer.permissions.slice(1) }), false);
  assert.equal(isPresetRole(presets, { ...viewer, permissions: [...viewer.permissions, "admin.manage"] }), false);
  assert.equal(isPresetRole(presets, { code: "channel", name: "渠道", description: "", permissions: [] }), false);
});

// --- both gates -----------------------------------------------------------------

test("a member without admin.manage can neither list nor change roles", async () => {
  const store = fresh();
  store.seed(WS, "usr_rep", ["sales_rep"]);
  const c = { ...ctx("sales_rep", store), sub: "usr_rep" };
  assert.equal((await listRoles(c)).ok, false);
  const r = await saveRole(c, { code: "x", name: "x", description: "", permissions: [] });
  assert.equal(r.ok === false && r.violations[0]!.code, "permission_denied");
  assert.equal((await store.listRoles(WS)).length, 9, "nothing was written");
});

test("role administration survives a workspace with no feature entitlement", async () => {
  const store = fresh();
  unwrap(await saveRole(ctx("sales_leader", store, "free"), {
    code: "channel_manager", name: "渠道经理", description: "", permissions: ["account.read"],
  }));
  assert.equal((await store.listRoles(WS)).length, 10);
});

// --- saving ---------------------------------------------------------------------

test("a new role is created after the presets with the grants stated, and reads as 自定义", async () => {
  const store = fresh();
  const row = unwrap(await saveRole(ctx("sales_leader", store), {
    code: "channel_manager",
    name: "渠道经理",
    description: "管理渠道伙伴。",
    permissions: ["account.read", "pipeline.read", "account.read"],
  }));
  assert.equal(row.sortOrder, 10);
  assert.deepEqual(row.permissions, ["account.read", "pipeline.read"], "de-duplicated, catalogue order");
  const rows = unwrap(await listRoles(ctx("sales_leader", store)));
  const mine = rows.find((r) => r.code === "channel_manager")!;
  assert.equal(mine.preset, false);
  assert.equal(mine.description, "管理渠道伙伴。");
  // And it can be granted.
  unwrap(await assignRole({ ...ctx("sales_leader", store) }, "usr_new", "channel_manager"));
  assert.deepEqual(await store.permissionsOf(WS, "usr_new"), ["account.read", "pipeline.read"]);
});

test("saving an existing code renames it and replaces its grants whole; the code stays", async () => {
  const store = fresh();
  unwrap(await saveRole(ctx("sales_leader", store), {
    code: "viewer", name: "观察员", description: "只看。", permissions: ["account.read"],
  }));
  const rows = await store.listRoles(WS);
  const v = rows.find((r) => r.code === "viewer")!;
  assert.equal(v.name, "观察员");
  assert.deepEqual(v.permissions, ["account.read"]);
  assert.equal(rows.length, 9, "an edit is not a second row");
});

test("the code, the name and the permissions are validated in the product's words", async () => {
  const store = fresh();
  const c = ctx("sales_leader", store);
  const code = async (input: Partial<{ code: string; name: string; permissions: string[] }>) => {
    const r = await saveRole(c, { code: "ok_code", name: "x", description: "", permissions: [], ...input });
    return r.ok ? "ok" : r.violations[0]!.code;
  };
  assert.equal(await code({ code: " " }), "code_required");
  assert.equal(await code({ code: "Channel" }), "code_shape");
  assert.equal(await code({ code: "9lives" }), "code_shape");
  assert.equal(await code({ code: "with-dash" }), "code_shape");
  assert.equal(await code({ name: "  " }), "name_required");
  assert.equal(await code({ permissions: ["account.read", "nope.write"] }), "permission_unknown");
  assert.equal((await store.listRoles(WS)).length, 9, "nothing was written");
});

test("taking admin.manage off the only administrative role anybody holds is refused", async () => {
  const store = fresh(); // usr_admin holds sales_leader, the only admin holder
  const r = await saveRole(ctx("sales_leader", store), {
    code: "sales_leader",
    name: "销售负责人",
    description: "",
    permissions: ROLE_PERMISSIONS.sales_leader.filter((p) => p !== "admin.manage"),
  });
  assert.equal(r.ok === false && r.violations[0]!.code, "last_admin");
  // Give somebody sales_ops (which also administers) and the same edit lands.
  store.seed(WS, "usr_ops", ["sales_ops"]);
  unwrap(await saveRole(ctx("sales_leader", store), {
    code: "sales_leader",
    name: "销售负责人",
    description: "",
    permissions: ROLE_PERMISSIONS.sales_leader.filter((p) => p !== "admin.manage"),
  }));
  // An INACTIVE administrator does not count.
  await store.setMemberStatus(WS, "usr_ops", "inactive");
  const again = await saveRole(ctx("sales_leader", store), {
    code: "sales_ops", name: "销售运营", description: "", permissions: ["planning.read"],
  });
  assert.equal(again.ok === false && again.violations[0]!.code, "last_admin");
});

// --- removing ---------------------------------------------------------------------

test("a role somebody holds cannot be removed; an unheld one can; an unknown one is named", async () => {
  const store = fresh();
  store.seed(WS, "usr_rep", ["sales_rep"]);
  const held = await removeRole(ctx("sales_leader", store), "sales_rep");
  assert.equal(held.ok === false && held.violations[0]!.code, "role_in_use");
  unwrap(await removeRole(ctx("sales_leader", store), "presales"));
  assert.equal((await store.listRoles(WS)).length, 8);
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
  assert.deepEqual((await codes()).slice(0, 2), ["sales_leader", "viewer"]);
  unwrap(await moveRole(ctx("sales_leader", store), { code: "viewer", direction: "bottom" }));
  assert.equal((await codes())[8], "viewer");
  const edge = await moveRole(ctx("sales_leader", store), { code: "viewer", direction: "down" });
  assert.equal(edge.ok === false && edge.violations[0]!.code, "move_at_edge");
  const orders = (await store.listRoles(WS)).map((r) => r.sortOrder);
  assert.deepEqual(orders, [1, 2, 3, 4, 5, 6, 7, 8, 9], "dense after any move");
});

// --- reset ------------------------------------------------------------------------

test("重置预置 restores edited and deleted presets, keeps custom roles, and reports the count", async () => {
  const store = fresh();
  const c = ctx("sales_leader", store);
  unwrap(await saveRole(c, { code: "viewer", name: "观察员", description: "", permissions: ["account.read"] }));
  unwrap(await removeRole(c, "presales"));
  unwrap(await saveRole(c, { code: "channel_manager", name: "渠道经理", description: "", permissions: ["account.read"] }));
  unwrap(await moveRole(c, { code: "channel_manager", direction: "top" }));

  const r = unwrap(await resetPresetRoles(c));
  assert.equal(r.restored, 2, "viewer and presales");
  assert.equal(r.unchanged, 7);
  const rows = unwrap(await listRoles(c));
  assert.deepEqual(rows.map((x) => x.code), [...ROLE_CODES, "channel_manager"], "presets first, in order, custom after");
  assert.ok(rows.filter((x) => x.code !== "channel_manager").every((x) => x.preset));
  assert.equal(rows.find((x) => x.code === "channel_manager")?.name, "渠道经理", "the custom role is untouched");
  // Nothing to restore the second time.
  assert.equal(unwrap(await resetPresetRoles(c)).restored, 0);
});

test("every permission a preset grants is one the catalogue has", () => {
  for (const p of presetRoles()) {
    for (const perm of p.permissions) assert.ok(PERM_CODES.includes(perm), `${p.code}: ${perm}`);
    assert.ok(p.name.length > 0 && p.description.length > 0, `${p.code} has a name and a sentence`);
  }
});
