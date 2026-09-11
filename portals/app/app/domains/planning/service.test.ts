import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryPlanningStore, type TargetRecord, type TerritoryRecord } from "./store";
import {
  attainment,
  createTarget,
  listTargets,
  listTerritories,
  retireOrphanedAutoTerritories,
  updateTarget,
  upsertTerritory,
  type PlanningContext,
} from "./service";
import type { TargetScope } from "./lib/target";
import { InMemoryCatalogStore, type CatalogStore } from "../catalog/store";

const WS = "ws_1";

const scope: TargetScope = {
  period: "2026Q3",
  scopeType: "owner",
  territoryId: null,
  ownerSub: "usr_rep",
  metric: "revenue",
};

function target(over: Partial<TargetRecord> = {}): TargetRecord {
  return {
    id: "tgt_1",
    workspaceId: WS,
    ...scope,
    targetValue: { unit: "money" as const, amount: 1_000_000, currency: "CNY" },
    status: "committed",
    planId: null,
    ...over,
  };
}

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryPlanningStore()): PlanningContext & { catalog: CatalogStore } {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
    catalog: new InMemoryCatalogStore(),
  };
}

const closedKey = (s: TargetScope) => [WS, s.period, s.scopeType, s.territoryId ?? "", s.ownerSub ?? ""].join("|");

// --- Gates ------------------------------------------------------------------

test("planning is a pro-tier capability", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target()] });
  assert.equal((await listTargets(ctx("sales_ops", "starter", store))).ok, false);
  assert.equal(unwrap(await listTargets(ctx("sales_ops", "pro", store))).length, 1);
});

test("a rep may not set quota", async () => {
  const r = await createTarget(ctx("sales_rep", "pro"), { scope, amount: 1 });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

// --- The scope tuple is identity -------------------------------------------

test("a second target for the same scope is refused by name", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target()] });
  const r = await createTarget(ctx("sales_ops", "pro", store), { scope, amount: 2_000_000 });
  assert.equal(r.ok === false && r.violations[0].code, "duplicate_scope");
});

test("a different period or metric is a different target", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target()] });
  const c = ctx("sales_ops", "pro", store);
  assert.ok((await createTarget(c, { scope: { ...scope, period: "2026Q4" }, amount: 1 })).ok);
  assert.ok((await createTarget(c, { scope: { ...scope, metric: "new_logo" }, amount: 1 })).ok);
});

test("only the number and the state move", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target({ status: "draft" })] });
  const c = ctx("sales_ops", "pro", store);

  assert.ok((await updateTarget(c, "tgt_1", { amount: 1_500_000 })).ok);
  assert.equal((await store.getTarget(WS, "tgt_1"))?.targetValue.amount, 1_500_000);
  assert.ok((await updateTarget(c, "tgt_1", { status: "committed" })).ok);
});

test("a closed target is frozen", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target({ status: "closed" })] });
  const r = await updateTarget(ctx("sales_ops", "pro", store), "tgt_1", { amount: 1 });
  assert.equal(r.ok === false && r.violations[0].code, "target_closed");
});

test("status only moves forward", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target({ status: "committed" })] });
  const r = await updateTarget(ctx("sales_ops", "pro", store), "tgt_1", { status: "draft" });
  assert.equal(r.ok === false && r.violations[0].code, "status_regression");
});

// --- Attainment reads D6, never recomputes it ------------------------------

test("attainment divides the snapshot's closed amount by the target", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target()], published: { [closedKey(scope)]: { closedAmount: money(750_000), pipelineAmount: money(0), newLogoCount: null } } });
  const rows = unwrap(await attainment(ctx("sales_ops", "pro", store), "2026Q3"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].measurement.kind === "measured" && rows[0].measurement.ratio, 0.75);
  assert.equal(rows[0].measurement.kind, "measured");
});

test("no snapshot yet is NOT reported as 0% attained", async () => {
  // Rendering both as 0% would report an unforecast quarter as a failed one.
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target()] });
  const rows = unwrap(await attainment(ctx("sales_ops", "pro", store), "2026Q3"));

  assert.equal(rows[0].measurement.kind === "not_measurable" && rows[0].measurement.code, "no_snapshot");
});

test("a zero target yields a null ratio, distinct from no snapshot", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({
    targets: [target({ targetValue: { unit: "money", amount: 0, currency: "CNY" } })],
    published: { [closedKey(scope)]: { closedAmount: money(500), pipelineAmount: money(0), newLogoCount: null } },
  });
  const rows = unwrap(await attainment(ctx("sales_ops", "pro", store), "2026Q3"));
  assert.equal(rows[0].measurement.kind, "measured", "a snapshot exists");
  assert.equal(
    rows[0].measurement.kind === "measured" && rows[0].measurement.ratio,
    null,
    "but the ratio is undefined against a zero target",
  );
});

test("attainment is scoped to the period asked for", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target({ id: "q3" }), target({ id: "q4", period: "2026Q4" })] });
  const rows = unwrap(await attainment(ctx("sales_ops", "pro", store), "2026Q3"));
  assert.deepEqual(rows.map((r) => r.target.id), ["q3"]);
});

test("targets never cross a workspace boundary", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target({ id: "mine" }), target({ id: "theirs", workspaceId: "ws_other" })] });
  const rows = unwrap(await listTargets(ctx("sales_ops", "pro", store)));
  assert.deepEqual(rows.map((r) => r.id), ["mine"]);
});

// --- Territories (the verb that was gated but never written) -----------------

test("a VIEWER may read territories and may not write one", async () => {
  // The test that actually pins the gate to the WRITE action. `sales_rep` has
  // no planning access at all, so a rep is refused whichever action the verb
  // names - a counter-proof that swapped upsert for view reddened nothing, and
  // said so. `viewer` holds planning.read and not planning.write, which is the
  // only pair that can tell the two apart.
  const store = new InMemoryPlanningStore();
  const c = ctx("viewer", "pro", store);
  assert.equal((await listTerritories(c)).ok, true, "reading is allowed");

  const r = await upsertTerritory(c, {
    territoryCode: "EAST",
    name: "East China",
    parentId: null,
    ownerSub: null,
    regions: [],
    status: "active",
  });
  assert.equal(r.ok === false && r.violations[0]!.code, "permission_denied");
});

test("a rep cannot maintain territories, a leader can", async () => {
  const store = new InMemoryPlanningStore();
  const denied = await upsertTerritory(ctx("sales_rep", "pro", store), {
    territoryCode: "EAST",
    name: "East China",
    parentId: null,
    ownerSub: null,
    regions: [],
    status: "active",
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.ok === false && denied.violations[0]!.code, "permission_denied");

  const allowed = await upsertTerritory(ctx("sales_leader", "pro", store), {
    territoryCode: "EAST",
    name: "East China",
    parentId: null,
    ownerSub: null,
    regions: [],
    status: "active",
  });
  assert.equal(allowed.ok, true);
});

test("the feature key gates it too - a starter workspace is told about the tier", async () => {
  // planning.territory is sold from PRO up. Before this verb existed, that key
  // unlocked a read of rows nothing could create.
  const r = await upsertTerritory(ctx("sales_leader", "starter", new InMemoryPlanningStore()), {
    territoryCode: "EAST",
    name: "East China",
    parentId: null,
    ownerSub: null,
    regions: [],
    status: "active",
  });
  assert.equal(r.ok === false && r.violations[0]!.code, "feature_not_in_tier");
});

test("the same code UPDATES rather than creating a twin", async () => {
  const store = new InMemoryPlanningStore();
  const c = ctx("sales_leader", "pro", store);
  const first = unwrap(
    await upsertTerritory(c, {
      territoryCode: "EAST",
      name: "East China",
      parentId: null,
      ownerSub: null,
      regions: [],
      status: "active",
    }),
  );
  const again = unwrap(
    await upsertTerritory(c, {
      territoryCode: "EAST",
      name: "East China (renamed)",
      parentId: null,
      ownerSub: "usr_1",
      regions: [],
      status: "active",
    }),
  );
  assert.equal(again.id, first.id, "same row - the code is the identity");
  assert.equal(again.name, "East China (renamed)");
  assert.equal((await store.listTerritories(WS)).length, 1, "and not a second one");
});

test("a retired territory leaves the active list but keeps its code", async () => {
  const store = new InMemoryPlanningStore();
  const c = ctx("sales_leader", "pro", store);
  const base = {
    territoryCode: "NORTH",
    name: "North China",
    parentId: null,
    ownerSub: null,
    regions: [],
  };
  unwrap(await upsertTerritory(c, { ...base, status: "active" }));
  unwrap(await upsertTerritory(c, { ...base, status: "retired" }));

  assert.deepEqual(await store.listTerritories(WS), [], "gone from the scope selector");
  const all = await store.listTerritories(WS, { includeRetired: true });
  assert.equal(all.length, 1, "still on file, still holding NORTH");
  assert.equal(all[0]!.status, "retired");
});

test("the cycle check sees retired ancestors", async () => {
  // A wound-down parent is still a real ancestor. Reading only the active list
  // would let a loop close through a retired row - invisible, and permanent.
  const store = new InMemoryPlanningStore();
  const c = ctx("sales_leader", "pro", store);
  const east = unwrap(
    await upsertTerritory(c, {
      territoryCode: "EAST",
      name: "East",
      parentId: null,
      ownerSub: null,
      regions: [],
      status: "active",
    }),
  );
  const north = unwrap(
    await upsertTerritory(c, {
      territoryCode: "NORTH",
      name: "North",
      parentId: east.id,
      ownerSub: null,
      regions: [],
      status: "retired",
    }),
  );
  const r = await upsertTerritory(c, {
    territoryCode: "EAST",
    name: "East",
    parentId: north.id,
    ownerSub: null,
    regions: [],
    status: "active",
  });
  assert.equal(r.ok === false && r.violations[0]!.code, "parent_cycle");
});

// --- The two links (incr/0052) -------------------------------------------------

test("a territory's coverage is 大区 ids, and its regions are their current names", async () => {
  // The memory store names coverage through the account domain's rows, the
  // way the Prisma adapter joins them; a rename follows, a stale name cannot.
  let divisions = [{ id: "d_east", name: "华东" }, { id: "d_south", name: "华南" }];
  const store = new InMemoryPlanningStore({ divisions: async () => divisions });
  const c = ctx("sales_leader", "pro", store);
  const saved = unwrap(await upsertTerritory(c, {
    territoryCode: "EAST", name: "East", parentId: null, ownerSub: null, status: "active", divisionIds: ["d_east"], unitIds: [],
  }, new Set(["d_east", "d_south"])));
  assert.deepEqual([saved.divisionIds, saved.regions], [["d_east"], ["华东"]]);
  divisions = [{ id: "d_east", name: "华东大区" }, { id: "d_south", name: "华南" }];
  assert.deepEqual(unwrap(await listTerritories(c))[0]!.regions, ["华东大区"]);
});

test("a link to a 大区 or unit outside the workspace is refused by code", async () => {
  const store = new InMemoryPlanningStore();
  const c = ctx("sales_leader", "pro", store);
  const draft = { territoryCode: "EAST", name: "East", parentId: null, ownerSub: null, status: "active" as const };
  const badDivision = await upsertTerritory(c, { ...draft, divisionIds: ["d_nope"] }, new Set(["d_east"]));
  assert.equal(badDivision.ok === false && badDivision.violations[0].code, "division_unknown");
  const badUnit = await upsertTerritory(c, { ...draft, unitIds: ["u_nope"] });
  assert.equal(badUnit.ok === false && badUnit.violations[0].code, "unit_unknown");
  // Without the caller's list the foreign key is the last word: accepted here.
  assert.ok((await upsertTerritory(c, { ...draft, divisionIds: ["d_whatever"] })).ok);
});

test("a fixture seeded in names (pre-0052) resolves to ids through the same rows", async () => {
  const store = new InMemoryPlanningStore({ divisions: async () => [{ id: "d_east", name: "华东" }] });
  store.seed({ territories: [{
    id: "t1", workspaceId: WS, territoryCode: "EAST", name: "East", parentId: null, ownerSub: null,
    regions: ["华东", "不存在的大区"], status: "active",
  }] });
  const [t] = unwrap(await listTerritories(ctx("sales_leader", "pro", store)));
  assert.deepEqual([t!.divisionIds, t!.regions], [["d_east"], ["华东"]]);
});

// --- Orphaned AUTO-<大区代码> territories left by a division-template switch --

function autoTerritory(over: Partial<TerritoryRecord & { id: string }> = {}) {
  return {
    id: `t_${over.territoryCode ?? "AUTO-X"}`,
    workspaceId: WS,
    territoryCode: "AUTO-X",
    name: "X",
    parentId: null,
    ownerSub: null,
    regions: [] as readonly string[],
    status: "active",
    divisionIds: ["d_gone"],
    unitIds: ["u_gone"],
    ...over,
  };
}

test("a territory for a division the new carve dropped is retired and unlinked", async () => {
  // 七分法 -> 五分法: AUTO-CHINA-NORTHEAST is not among the codes the new carve
  // produces, so nothing will ever upsert it again on its own - it has to be
  // swept explicitly, the way applyStartupTemplateAction now does.
  const store = new InMemoryPlanningStore();
  store.seed({ territories: [autoTerritory({ id: "t_ne", territoryCode: "AUTO-CHINA-NORTHEAST", name: "东北大区" })] });
  const c = ctx("sales_leader", "pro", store);

  const result = unwrap(await retireOrphanedAutoTerritories(c, new Set(["AUTO-CHINA-NORTH", "AUTO-CHINA-SOUTH"])));
  assert.equal(result.retired, 1);

  const all = await store.listTerritories(WS, { includeRetired: true });
  assert.equal(all.length, 1, "the row stays on file - retired, not deleted");
  assert.equal(all[0]!.status, "retired");
  assert.deepEqual(all[0]!.divisionIds, [], "no longer points at the deleted division");
  assert.deepEqual(all[0]!.unitIds, [], "no longer points at the deleted unit");
  assert.equal(all[0]!.territoryCode, "AUTO-CHINA-NORTHEAST", "the code is kept - it is the anchor, never rewritten");
});

test("a territory whose code the new carve still produces is left alone", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ territories: [autoTerritory({ id: "t_n", territoryCode: "AUTO-CHINA-NORTH", name: "华北" })] });
  const c = ctx("sales_leader", "pro", store);

  const result = unwrap(await retireOrphanedAutoTerritories(c, new Set(["AUTO-CHINA-NORTH"])));
  assert.equal(result.retired, 0);

  const [t] = await store.listTerritories(WS, { includeRetired: true });
  assert.equal(t!.status, "active", "still current - the day's own upsert loop owns this row");
  assert.deepEqual(t!.divisionIds, ["d_gone"], "untouched, not zeroed");
});

test("a hand-made territory is never swept, no matter its code", async () => {
  // Only the AUTO- prefix marks a row as this feature's own housekeeping - a
  // territory a person built by hand is never a candidate, however stale its
  // links look from here.
  const store = new InMemoryPlanningStore();
  store.seed({ territories: [autoTerritory({ id: "t_hand", territoryCode: "WEST-KEY-ACCOUNTS", name: "West Key Accounts" })] });
  const c = ctx("sales_leader", "pro", store);

  const result = unwrap(await retireOrphanedAutoTerritories(c, new Set()));
  assert.equal(result.retired, 0);
  assert.equal((await store.listTerritories(WS, { includeRetired: true }))[0]!.status, "active");
});

test("a row already retired and unlinked is not re-upserted every run", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({
    territories: [
      autoTerritory({ id: "t_old", territoryCode: "AUTO-CHINA-NORTHWEST", name: "西北大区", status: "retired", divisionIds: [], unitIds: [] }),
    ],
  });
  const c = ctx("sales_leader", "pro", store);

  const result = unwrap(await retireOrphanedAutoTerritories(c, new Set()));
  assert.equal(result.retired, 0, "already retired with nothing attached - nothing left to do");
});

test("only a leader may sweep orphans, and only on a paying tier", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ territories: [autoTerritory({ id: "t_ne", territoryCode: "AUTO-CHINA-NORTHEAST" })] });

  const repDenied = await retireOrphanedAutoTerritories(ctx("sales_rep", "pro", store), new Set());
  assert.equal(repDenied.ok === false && repDenied.violations[0]!.code, "permission_denied");

  const starterDenied = await retireOrphanedAutoTerritories(ctx("sales_leader", "starter", store), new Set());
  assert.equal(starterDenied.ok === false && starterDenied.violations[0]!.code, "feature_not_in_tier");
});
