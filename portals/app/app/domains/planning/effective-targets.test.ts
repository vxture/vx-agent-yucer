import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { changeSalesPlan, type SalesPlanContext } from "./plan-service";
import { emptyContent } from "./plan-model";
import { InMemorySalesPlanStore } from "./plan-store";
import { InMemoryPlanningStore } from "./store";
import { effectiveTargets, withSalesPlanTargets } from "./effective-targets";

async function released() {
  const workspaceId = randomUUID(), store = new InMemorySalesPlanStore();
  const ctx: SalesPlanContext = {
    workspaceId, sub: "ops", scope: { kind: "workspace" }, store,
    holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: workspaceId, product: "yucer", tier: "enterprise" },
  };
  const content = emptyContent(2026, [], "CNY");
  content.targets[0]!.target = "1000";
  content.allocationNote = "Company target; regions will follow";
  let plan = await changeSalesPlan(ctx, { year: 2026, expectedEventNo: 0, requestKey: randomUUID(), command: { kind: "draft", content } });
  plan = await changeSalesPlan(ctx, { year: 2026, expectedEventNo: 1, requestKey: randomUUID(), command: { kind: "release", revisionId: plan.revisions[0]!.id, editToken: 1, reason: "" } });
  return { workspaceId, store, plan };
}

test("projected target identity is a stable workspace/plan/line UUID while adopted IDs remain unchanged", async () => {
  const { plan } = await released();
  const at = new Date().toISOString();
  const rows = effectiveTargets([], [plan], at);
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(effectiveTargets([], [structuredClone(plan)], at), rows);
  const changed = structuredClone(plan);
  changed.revisions[0]!.content.targets[0]!.target = "2000";
  assert.equal(effectiveTargets([], [changed], at)[0]!.id, row.id);
  for (const other of [
    { ...plan, workspaceId: randomUUID() },
    { ...plan, id: randomUUID() },
  ]) assert.notEqual(effectiveTargets([], [other], at)[0]!.id, row.id);
  changed.revisions[0]!.content.targets[0]!.key = randomUUID();
  assert.notEqual(effectiveTargets([], [changed], at)[0]!.id, row.id);
  const legacy = { ...row, id: randomUUID(), managedBySalesPlan: undefined };
  plan.legacy.push({ targetId: legacy.id, revisionId: plan.revisions[0]!.id, snapshot: legacy });
  assert.equal(effectiveTargets([legacy], [plan], at)[0]!.id, legacy.id);
});

test("projected UUIDs stay read-only through the planning store, including direct store calls", async () => {
  const { workspaceId, store, plan } = await released();
  const raw = new InMemoryPlanningStore(), wrapped = withSalesPlanTargets(raw, store);
  const row = (await wrapped.listTargets(workspaceId))[0]!;
  assert.deepEqual(await wrapped.getTarget(workspaceId, row.id), row);
  assert.equal(await wrapped.getTarget(randomUUID(), row.id), null);
  for (const id of [row.id, `plan_${plan.revisions[0]!.content.targets[0]!.key}`]) {
    await assert.rejects(wrapped.updateTarget(workspaceId, id, { status: "closed" }), /managed_by_sales_plan/);
    await assert.rejects(wrapped.removeTarget(workspaceId, id), /managed_by_sales_plan/);
  }
  await assert.rejects(wrapped.createTarget(workspaceId, row), /managed_by_sales_plan/);
  assert.deepEqual(await raw.listTargets(workspaceId), []);
  assert.deepEqual((await store.read(workspaceId, 2026))!.revisions, plan.revisions);
});
