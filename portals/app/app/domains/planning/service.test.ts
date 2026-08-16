import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryPlanningStore, type TargetRecord } from "./store";
import { attainment, createTarget, listTargets, updateTarget, type PlanningContext } from "./service";
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
    targetAmount: money(1_000_000),
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
  const r = await createTarget(ctx("sales_rep", "pro"), { scope, targetAmount: money(1) });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

// --- The scope tuple is identity -------------------------------------------

test("a second target for the same scope is refused by name", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target()] });
  const r = await createTarget(ctx("sales_ops", "pro", store), { scope, targetAmount: money(2_000_000) });
  assert.equal(r.ok === false && r.violations[0].code, "duplicate_scope");
});

test("a different period or metric is a different target", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target()] });
  const c = ctx("sales_ops", "pro", store);
  assert.ok((await createTarget(c, { scope: { ...scope, period: "2026Q4" }, targetAmount: money(1) })).ok);
  assert.ok((await createTarget(c, { scope: { ...scope, metric: "new_logo" }, targetAmount: money(1) })).ok);
});

test("only the number and the state move", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target({ status: "draft" })] });
  const c = ctx("sales_ops", "pro", store);

  assert.ok((await updateTarget(c, "tgt_1", { targetAmount: money(1_500_000) })).ok);
  assert.equal((await store.getTarget(WS, "tgt_1"))?.targetAmount.amount, 1_500_000);
  assert.ok((await updateTarget(c, "tgt_1", { status: "committed" })).ok);
});

test("a closed target is frozen", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target({ status: "closed" })] });
  const r = await updateTarget(ctx("sales_ops", "pro", store), "tgt_1", { targetAmount: money(1) });
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
  store.seed({ targets: [target()], closed: { [closedKey(scope)]: money(750_000) } });
  const rows = unwrap(await attainment(ctx("sales_ops", "pro", store), "2026Q3"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ratio, 0.75);
  assert.equal(rows[0].hasSnapshot, true);
});

test("no snapshot yet is NOT reported as 0% attained", async () => {
  // Rendering both as 0% would report an unforecast quarter as a failed one.
  const store = new InMemoryPlanningStore();
  store.seed({ targets: [target()] });
  const rows = unwrap(await attainment(ctx("sales_ops", "pro", store), "2026Q3"));

  assert.equal(rows[0].hasSnapshot, false);
  assert.equal(rows[0].ratio, null);
  assert.equal(rows[0].closed, null);
});

test("a zero target yields a null ratio, distinct from no snapshot", async () => {
  const store = new InMemoryPlanningStore();
  store.seed({
    targets: [target({ targetAmount: money(0) })],
    closed: { [closedKey(scope)]: money(500) },
  });
  const rows = unwrap(await attainment(ctx("sales_ops", "pro", store), "2026Q3"));
  assert.equal(rows[0].hasSnapshot, true, "a snapshot exists");
  assert.equal(rows[0].ratio, null, "but the ratio is undefined against a zero target");
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
