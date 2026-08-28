import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryPlanningStore, type TargetRecord } from "./store";
import {
  attainment,
  createTarget,
  listTargets,
  listTerritories,
  updateTarget,
  upsertTerritory,
  type PlanningContext,
} from "./service";
import type { TargetScope } from "./lib/target";

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

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryPlanningStore()): PlanningContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
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
    status: "active",
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.ok === false && denied.violations[0]!.code, "permission_denied");

  const allowed = await upsertTerritory(ctx("sales_leader", "pro", store), {
    territoryCode: "EAST",
    name: "East China",
    parentId: null,
    ownerSub: null,
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
      status: "active",
    }),
  );
  const again = unwrap(
    await upsertTerritory(c, {
      territoryCode: "EAST",
      name: "East China (renamed)",
      parentId: null,
      ownerSub: "usr_1",
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
      status: "active",
    }),
  );
  const north = unwrap(
    await upsertTerritory(c, {
      territoryCode: "NORTH",
      name: "North",
      parentId: east.id,
      ownerSub: null,
      status: "retired",
    }),
  );
  const r = await upsertTerritory(c, {
    territoryCode: "EAST",
    name: "East",
    parentId: north.id,
    ownerSub: null,
    status: "active",
  });
  assert.equal(r.ok === false && r.violations[0]!.code, "parent_cycle");
});
