import { test } from "node:test";
import assert from "node:assert/strict";
import { seedDemoWorkspace, type DemoStores } from "../shared/demo-seed";
import { InMemoryAccountStore, type AccountRecord } from "./store";
import { InMemoryFieldStore } from "./field-store";
import { InMemoryCatalogStore } from "../catalog/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryDeliveryStore } from "../delivery/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryPlanningStore } from "../planning/store";
import { InMemorySignalStore } from "../signal/store";
import { InMemoryStrategyStore } from "../strategy/store";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { accountFootprint, deleteEmptyAccount, type FootprintContext } from "./service";
import { FOOTPRINT_KINDS, isEmptyShell } from "./lib/footprint";

// 只删空壳客户 (owner, 2026-09-23).

const WS = "ws_delete";

function seeded(): DemoStores {
  const s: DemoStores = {
    strategy: new InMemoryStrategyStore(),
    planning: new InMemoryPlanningStore(),
    account: new InMemoryAccountStore(),
    field: new InMemoryFieldStore(),
    signal: new InMemorySignalStore(),
    pipeline: new InMemoryPipelineStore(),
    delivery: new InMemoryDeliveryStore(),
    copilot: new InMemoryCopilotStore(),
    catalog: new InMemoryCatalogStore(),
  };
  seedDemoWorkspace(WS, s);
  return s;
}

const ctx = (s: DemoStores, role: RoleCode = "sales_leader"): FootprintContext => ({
  workspaceId: WS,
  sub: "usr_me",
  holder: { permissions: new Set(permissionsForRoles([role])) },
  entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" },
  store: s.account,
  pipeline: s.pipeline,
  delivery: s.delivery,
  field: s.field,
  signal: s.signal,
});

function shell(): AccountRecord {
  return {
    id: "acc_shell", workspaceId: WS, accountNo: "ACC-9001", name: "建错的客户", industryId: null, industry: null,
    customerTypeId: null, customerType: null, customerSizeId: null, customerSize: null, customerNatureId: null,
    customerNature: null, region: null, province: null, segmentCode: null, ownerSub: "usr_me", healthScore: null,
    status: "prospect", tier: "standard", creditCode: null, website: null, employeeCount: null, parentId: null,
  };
}

test("isEmptyShell: any one kind of record makes a customer history", () => {
  const zero = Object.fromEntries(FOOTPRINT_KINDS.map((k) => [k, 0])) as Record<(typeof FOOTPRINT_KINDS)[number], number>;
  assert.equal(isEmptyShell(zero), true);
  for (const k of FOOTPRINT_KINDS) assert.equal(isEmptyShell({ ...zero, [k]: 1 }), false, k);
});

test("a worked customer is refused, and says what hangs on it", async () => {
  const s = seeded();
  const fp = await accountFootprint(ctx(s), "acc_demo_1");
  assert.ok(fp.ok && fp.value.deals > 0 && fp.value.contracts > 0);
  const r = await deleteEmptyAccount(ctx(s), "acc_demo_1");
  assert.equal(r.ok === false && r.violations[0].code, "account_not_empty");
  assert.ok(await s.account.getAccount(WS, "acc_demo_1"), "still there");
});

test("an empty shell is deleted and no longer read", async () => {
  const s = seeded();
  s.account.seed({ accounts: [shell()] });
  const fp = await accountFootprint(ctx(s), "acc_shell");
  assert.ok(fp.ok && isEmptyShell(fp.value));
  const r = await deleteEmptyAccount(ctx(s), "acc_shell");
  assert.equal(r.ok, true);
  assert.equal(await s.account.getAccount(WS, "acc_shell"), null);
  assert.ok(!(await s.account.listAccounts(WS)).some((a) => a.id === "acc_shell"));
});

test("a parent with a sub-unit is not a shell - deleting it would orphan the child", async () => {
  const s = seeded();
  s.account.seed({ accounts: [shell(), { ...shell(), id: "acc_child", accountNo: "ACC-9002", parentId: "acc_shell" }] });
  const r = await deleteEmptyAccount(ctx(s), "acc_shell");
  assert.equal(r.ok === false && r.violations[0].code, "account_not_empty");
});

test("deleting needs account.upsert; a missing customer is not_found", async () => {
  const s = seeded();
  s.account.seed({ accounts: [shell()] });
  assert.equal((await deleteEmptyAccount(ctx(s, "viewer"), "acc_shell")).ok, false);
  const gone = await deleteEmptyAccount(ctx(s), "acc_nowhere");
  assert.equal(gone.ok === false && gone.violations[0].code, "not_found");
});
