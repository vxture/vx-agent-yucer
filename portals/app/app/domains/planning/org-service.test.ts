import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryPlanningStore } from "./store";
import { DEFAULT_ORG_KINDS, ORG_TEMPLATES } from "./lib/org";
import {
  applyOrgTemplate,
  listOrgKinds,
  listOrgMembers,
  listOrgTemplates,
  listOrgUnits,
  moveOrgKind,
  moveOrgUnit,
  removeOrgKind,
  removeOrgUnit,
  saveOrgKind,
  setMemberUnits,
  upsertOrgUnit,
  listTerritories,
  upsertTerritory,
  type PlanningContext,
} from "./service";

/* 组织结构 (incr/0051) through the service, on the memory store. */

const WS = "ws_org";

function ctx(role: RoleCode, store = new InMemoryPlanningStore(), tier: Entitlement["tier"] = "enterprise"): PlanningContext {
  return {
    workspaceId: WS,
    sub: "usr_admin",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}
const code = (r: { ok: boolean; violations?: readonly { code: string }[] }) => (r.ok ? "ok" : r.violations![0]!.code);

// --- First sighting -----------------------------------------------------------

test("the first read materialises the kinds and the default template", async () => {
  const c = ctx("sales_leader");
  const units = unwrap(await listOrgUnits(c));
  const d = ORG_TEMPLATES.find((t) => t.isDefault)!;
  assert.deepEqual(units.map((u) => u.unitCode), d.units.map((u) => u.code));
  assert.deepEqual(units.map((u) => u.depth), d.units.map((u) => (u.kind === "headquarters" ? 0 : u.kind === "region" ? 1 : 2)));
  assert.deepEqual(units.map((u) => u.kind?.code), d.units.map((u) => u.kind));
  assert.deepEqual(unwrap(await listOrgKinds(c)).map((k) => k.kindCode), DEFAULT_ORG_KINDS.map((k) => k.code));
  // And not twice: a second read changes nothing.
  assert.equal(unwrap(await listOrgUnits(c)).length, d.units.length);
});

test("a workspace that deleted everything is not re-seeded behind its back", async () => {
  const c = ctx("sales_leader");
  const units = unwrap(await listOrgUnits(c));
  for (const u of [...units].reverse()) assert.equal(code(await removeOrgUnit(c, u.id)), "ok");
  // The kinds are still there, so this is a touched workspace: empty stays empty.
  assert.equal(unwrap(await listOrgUnits(c)).length, 0);
  assert.equal(unwrap(await listOrgKinds(c)).length, DEFAULT_ORG_KINDS.length);
  // 应用模版 is the way back.
  unwrap(await applyOrgTemplate(c, "national_medium"));
  assert.equal(unwrap(await listOrgUnits(c)).length, 15);
});

// --- Gates --------------------------------------------------------------------

test("reading rides admin.member.view; writing needs admin.manage", async () => {
  const store = new InMemoryPlanningStore();
  await listOrgUnits(ctx("sales_leader", store));
  const rep = ctx("sales_rep", store);
  assert.equal(code(await listOrgUnits(rep)), "permission_denied");
  const viewer = ctx("viewer", store);
  assert.equal(code(await listOrgUnits(viewer)), "permission_denied");
  const kinds = unwrap(await listOrgKinds(ctx("sales_leader", store)));
  assert.equal(code(await upsertOrgUnit(rep, { unitCode: "x", name: "x", parentId: null, kindId: kinds[0]!.id, leaderSub: null })), "permission_denied");
  assert.equal(code(await applyOrgTemplate(rep, "small_team")), "permission_denied");
});

// --- Units --------------------------------------------------------------------

test("a unit is created under a parent, edited by code, moved among its siblings", async () => {
  const c = ctx("sales_leader");
  const units = unwrap(await listOrgUnits(c));
  const hq = units.find((u) => u.unitCode === "hq")!;
  const team = unwrap(await listOrgKinds(c)).find((k) => k.kindCode === "team")!;
  const created = unwrap(await upsertOrgUnit(c, { unitCode: "ka", name: "大客户部", parentId: hq.id, kindId: team.id, leaderSub: "usr_lead" }));
  assert.equal(created.parentId, hq.id);
  // Appended after the seven regions.
  let now = unwrap(await listOrgUnits(c));
  assert.equal(now[now.length - 1]!.unitCode, "ka");
  assert.equal(now.find((u) => u.unitCode === "ka")!.leaderSub, "usr_lead");
  // Same code = edit, never a second row.
  unwrap(await upsertOrgUnit(c, { unitCode: "ka", name: "大客户中心", parentId: hq.id, kindId: team.id, leaderSub: null }));
  now = unwrap(await listOrgUnits(c));
  assert.equal(now.filter((u) => u.unitCode === "ka").length, 1);
  assert.equal(now.find((u) => u.unitCode === "ka")!.name, "大客户中心");
  // To the top of its siblings: first under hq, before 华北大区.
  unwrap(await moveOrgUnit(c, { id: created.id, direction: "top" }));
  now = unwrap(await listOrgUnits(c));
  assert.equal(now[1]!.unitCode, "ka");
  assert.equal(code(await moveOrgUnit(c, { id: created.id, direction: "up" })), "move_at_edge");
  assert.equal(code(await moveOrgUnit(c, { id: "nope", direction: "up" })), "not_found");
});

test("the rule's refusals reach the caller by code", async () => {
  const c = ctx("sales_leader");
  const units = unwrap(await listOrgUnits(c));
  const north = units.find((u) => u.unitCode === "north")!;
  const northTeam = units.find((u) => u.unitCode === "north_team1")!;
  const region = unwrap(await listOrgKinds(c)).find((k) => k.kindCode === "region")!;
  assert.equal(code(await upsertOrgUnit(c, { unitCode: "north", name: "华北", parentId: northTeam.id, kindId: region.id, leaderSub: null })), "parent_cycle");
  assert.equal(code(await upsertOrgUnit(c, { unitCode: "Bad", name: "x", parentId: null, kindId: region.id, leaderSub: null })), "code_shape");
  assert.equal(code(await upsertOrgUnit(c, { unitCode: "ok", name: "x", parentId: null, kindId: "nope", leaderSub: null })), "kind_unknown");
  assert.equal(code(await upsertOrgUnit(c, { unitCode: "ok", name: "x", parentId: "nope", kindId: region.id, leaderSub: null })), "parent_not_found");
  assert.equal(code(await removeOrgUnit(c, north.id)), "unit_has_children");
});

test("removing a unit un-places its members and reports how many", async () => {
  const c = ctx("sales_leader");
  const units = unwrap(await listOrgUnits(c));
  const team = units.find((u) => u.unitCode === "east_team1")!;
  const east = units.find((u) => u.unitCode === "east")!;
  unwrap(await setMemberUnits(c, { sub: "usr_a", unitIds: [team.id] }));
  // usr_b is in the team AND its region (0053): removing the team takes one
  // placement away and leaves the other standing.
  unwrap(await setMemberUnits(c, { sub: "usr_b", unitIds: [team.id, east.id] }));
  assert.equal(unwrap(await listOrgUnits(c)).find((u) => u.id === team.id)!.members, 2);
  assert.deepEqual(unwrap(await removeOrgUnit(c, team.id)), { id: team.id, unplaced: 2, detached: 0 });
  assert.deepEqual([...unwrap(await listOrgMembers(c))], [["usr_b", [east.id]]]);
});

// --- Members ------------------------------------------------------------------

test("a member is in several units (0053); the set replaces; none is allowed; an unknown unit is refused", async () => {
  const c = ctx("sales_leader");
  const units = unwrap(await listOrgUnits(c));
  const [a, b] = [units.find((u) => u.unitCode === "north")!, units.find((u) => u.unitCode === "south")!];
  unwrap(await setMemberUnits(c, { sub: "usr_a", unitIds: [a.id] }));
  // Both at once, given south-first: read back in TREE order, north first.
  unwrap(await setMemberUnits(c, { sub: "usr_a", unitIds: [b.id, a.id, a.id] }));
  assert.deepEqual([...unwrap(await listOrgMembers(c))], [["usr_a", [a.id, b.id]]]);
  // Counted in both.
  const heads = unwrap(await listOrgUnits(c));
  assert.deepEqual([heads.find((u) => u.id === a.id)!.members, heads.find((u) => u.id === b.id)!.members], [1, 1]);
  // The set replaces: south alone.
  unwrap(await setMemberUnits(c, { sub: "usr_a", unitIds: [b.id] }));
  assert.deepEqual([...unwrap(await listOrgMembers(c))], [["usr_a", [b.id]]]);
  unwrap(await setMemberUnits(c, { sub: "usr_a", unitIds: [] }));
  assert.equal(unwrap(await listOrgMembers(c)).size, 0);
  assert.equal(code(await setMemberUnits(c, { sub: "usr_a", unitIds: [a.id, "nope"] })), "unit_unknown");
  // admin.member.scope, not admin.manage: the same id that governs what a member sees.
  assert.equal(code(await setMemberUnits(ctx("sales_rep", c.store as InMemoryPlanningStore), { sub: "usr_a", unitIds: [a.id] })), "permission_denied");
});

// --- Templates ----------------------------------------------------------------

test("applying a template replaces the tree and reports the un-placed", async () => {
  const c = ctx("sales_leader");
  const units = unwrap(await listOrgUnits(c));
  unwrap(await setMemberUnits(c, { sub: "usr_a", unitIds: [units[0]!.id] }));
  assert.equal(unwrap(await listOrgTemplates(c)).length, 3);
  assert.deepEqual(unwrap(await applyOrgTemplate(c, "small_team")), { key: "small_team", units: 4, unplaced: 1, detached: 0 });
  const now = unwrap(await listOrgUnits(c));
  assert.deepEqual(now.map((u) => u.unitCode), ["hq", "sales", "presales", "delivery"]);
  assert.deepEqual(now.map((u) => u.depth), [0, 1, 1, 1]);
  assert.equal(unwrap(await listOrgMembers(c)).size, 0);
  assert.equal(code(await applyOrgTemplate(c, "nope")), "template_unknown");
  // The large one: five levels deep.
  unwrap(await applyOrgTemplate(c, "group_large"));
  assert.equal(Math.max(...unwrap(await listOrgUnits(c)).map((u) => u.depth)), 4);
});

// --- Kinds --------------------------------------------------------------------

test("a kind is added, renamed by code, ordered, and refused while units are of it", async () => {
  const c = ctx("sales_leader");
  await listOrgUnits(c);
  const added = unwrap(await saveOrgKind(c, { kindCode: "center", name: "中心" }));
  assert.equal(unwrap(await listOrgKinds(c)).at(-1)!.id, added.id);
  unwrap(await saveOrgKind(c, { kindCode: "center", name: "共享中心" }));
  const kinds = unwrap(await listOrgKinds(c));
  assert.equal(kinds.filter((k) => k.kindCode === "center").length, 1);
  assert.equal(kinds.at(-1)!.name, "共享中心");
  unwrap(await moveOrgKind(c, { id: added.id, direction: "top" }));
  assert.equal(unwrap(await listOrgKinds(c))[0]!.kindCode, "center");
  assert.equal(code(await saveOrgKind(c, { kindCode: "Center", name: "x" })), "code_shape");
  assert.equal(code(await saveOrgKind(c, { kindCode: "", name: "x" })), "code_required");
  assert.equal(code(await saveOrgKind(c, { kindCode: "x", name: " " })), "name_required");
  const team = kinds.find((k) => k.kindCode === "team")!;
  assert.equal(code(await removeOrgKind(c, team.id)), "kind_in_use");
  assert.equal(code(await removeOrgKind(c, "nope")), "not_found");
  unwrap(await removeOrgKind(c, added.id));
  assert.ok(!unwrap(await listOrgKinds(c)).some((k) => k.kindCode === "center"));
});

// --- The unit side of the joint (incr/0052) ------------------------------------

test("a unit removed, or a tree replaced, detaches the territories that listed it and says how many", async () => {
  const c = ctx("sales_leader");
  const units = unwrap(await listOrgUnits(c));
  const south = units.find((u) => u.unitCode === "south")!;
  const team = units.find((u) => u.unitCode === "south_team1")!;
  const draft = { territoryCode: "SOUTH", name: "South", parentId: null, ownerSub: null, status: "active" as const };
  unwrap(await upsertTerritory(c, { ...draft, unitIds: [south.id, team.id] }));
  unwrap(await upsertTerritory(c, { ...draft, territoryCode: "SOUTH2", name: "South 2", unitIds: [team.id] }));
  assert.deepEqual(unwrap(await removeOrgUnit(c, team.id)), { id: team.id, unplaced: 0, detached: 2 });
  const after = unwrap(await listTerritories(c));
  assert.deepEqual(after.map((t) => t.unitIds), [[south.id], []]);
  const replaced = unwrap(await applyOrgTemplate(c, "small_team"));
  assert.equal(replaced.detached, 1, "only SOUTH still had a unit");
  assert.ok(unwrap(await listTerritories(c)).every((t) => t.unitIds.length === 0));
});
