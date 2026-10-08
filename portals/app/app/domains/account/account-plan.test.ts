import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { unwrap } from "../shared/result";
import { InMemoryAccountStore, type AccountPlanRecord, type AccountRecord } from "./store";
import { accountPlanState, closeAccountPlan, reopenAccountPlan, type AccountContext } from "./service";

// A customer plan can be closed and reopened; the reason is optional (owner,
// 2026-10-02). Closing acts on the LIVE plan; reopening needs no live plan.

const WS = "ws_plan";

function account(): AccountRecord {
  return {
    id: "acc_1", workspaceId: WS, accountNo: "ACC-1", name: "Acme", industryId: null, industry: null,
    customerTypeId: null, customerType: null, customerSizeId: null, customerSize: null, customerNatureId: null,
    customerNature: null, region: null, province: null, segmentCode: null, ownerSub: "usr_me", healthScore: null,
    status: "active", tier: "strategic", creditCode: null, website: null, employeeCount: null, parentId: null,
  };
}

function plan(over: Partial<AccountPlanRecord> = {}): AccountPlanRecord {
  return {
    id: "apl_1", workspaceId: WS, accountId: "acc_1", period: "2026Q4", targetAmount: 100, contactCadenceDays: 30,
    execCadenceDays: 90, ownerSub: "usr_me", presalesSub: null, deliverySub: null, status: "active", ...over,
  };
}

function ctx(store: InMemoryAccountStore, role: RoleCode = "sales_leader"): AccountContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" },
    store,
  } as AccountContext;
}

const code = (r: { ok: boolean; violations?: { code: string }[] }) => (r.ok ? null : r.violations![0]!.code);

test("a live plan is closed with an optional reason, and reopened with the reason cleared", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()], plans: [plan()] });
  const c = ctx(store);

  unwrap(await closeAccountPlan(c, "acc_1", "  customer froze its budget  "));
  const closed = unwrap(await accountPlanState(c, "acc_1"))!;
  assert.equal(closed.status, "closed");
  assert.equal(closed.closeReason, "customer froze its budget", "trimmed and kept");
  assert.equal(await store.getAccountPlan(WS, "acc_1"), null, "a closed plan is no longer the live one");

  unwrap(await reopenAccountPlan(c, "acc_1"));
  const back = unwrap(await accountPlanState(c, "acc_1"))!;
  assert.equal(back.status, "active");
  assert.equal(back.closeReason, null, "reopening clears the reason");
});

test("the reason may be left out, and is bounded when given", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()], plans: [plan()] });
  const c = ctx(store);
  assert.equal(code(await closeAccountPlan(c, "acc_1", "x".repeat(501))), "plan_reason_too_long");
  assert.equal((await accountPlanState(c, "acc_1")) && unwrap(await accountPlanState(c, "acc_1"))!.status, "active", "a refused close changed nothing");
  unwrap(await closeAccountPlan(c, "acc_1"));
  assert.equal(unwrap(await accountPlanState(c, "acc_1"))!.closeReason, null);
});

test("refusals: no plan, already closed, already live, no right, unknown customer", async () => {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account()] });
  const c = ctx(store);
  assert.equal(code(await closeAccountPlan(c, "acc_1")), "plan_none");
  assert.equal(code(await reopenAccountPlan(c, "acc_1")), "plan_none");

  store.setAccountPlan(plan({ status: "closed", closeReason: null }));
  assert.equal(code(await closeAccountPlan(c, "acc_1")), "plan_already_closed");

  store.setAccountPlan(plan({ status: "active" }));
  assert.equal(code(await reopenAccountPlan(c, "acc_1")), "plan_already_active");

  assert.equal(code(await closeAccountPlan(ctx(store, "viewer"), "acc_1")), "permission_denied");
  assert.equal(code(await closeAccountPlan(c, "acc_zz")), "not_found");
});
