import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { InMemoryAccountStore, nextAccountNo } from "./store";
import { createAccount, type AccountContext } from "./service";

// 新建客户 (owner, 2026-09-23). Before this the product could not create a
// customer at all.

const WS = "ws_create";

function ctx(role: RoleCode = "sales_leader", tier: Entitlement["tier"] = "business", store = new InMemoryAccountStore()): AccountContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

const blank = {
  region: null, province: null, industryId: null, segmentCode: null, customerTypeId: null,
  customerSizeId: null, customerNatureId: null, creditCode: null, website: null, employeeCount: null,
};

test("nextAccountNo follows the highest ACC number in use and ignores numbers of another shape", () => {
  assert.equal(nextAccountNo([]), "ACC-0001");
  assert.equal(nextAccountNo(["ACC-0001", "ACC-0007", "ACC-0003"]), "ACC-0008");
  assert.equal(nextAccountNo(["IMPORT-99", "ACC-0002"]), "ACC-0003");
  assert.equal(nextAccountNo(["ACC-9999"]), "ACC-10000");
});

test("createAccount: the creator owns it, the number is assigned, the tier is D1's default", async () => {
  const store = new InMemoryAccountStore();
  const r = await createAccount(ctx("sales_leader", "business", store), { ...blank, name: "  新客户甲  ", province: "浙江省" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.name, "新客户甲");
  assert.equal(r.value.ownerSub, "usr_me");
  assert.equal(r.value.accountNo, "ACC-0001");
  assert.equal(r.value.tier, "standard");
  assert.equal((await store.getAccount(WS, r.value.id))?.province, "浙江省");

  const second = await createAccount(ctx("sales_leader", "business", store), { ...blank, name: "乙" });
  assert.equal(second.ok && second.value.accountNo, "ACC-0002");
});

test("createAccount: refuses a blank name, a made-up province, and a negative headcount", async () => {
  const c = ctx();
  const code = (r: Awaited<ReturnType<typeof createAccount>>) => (r.ok ? null : r.violations[0].code);
  assert.equal(code(await createAccount(c, { ...blank, name: "   " })), "name_required");
  assert.equal(code(await createAccount(c, { ...blank, name: "x", province: "火星" })), "province_unknown");
  assert.equal(code(await createAccount(c, { ...blank, name: "x", employeeCount: -1 })), "employee_count_invalid");
});

test("createAccount: one company, one record - a credit code already in use is refused by name", async () => {
  const store = new InMemoryAccountStore();
  const c = ctx("sales_leader", "business", store);
  assert.equal((await createAccount(c, { ...blank, name: "甲", creditCode: "91330000X" })).ok, true);
  const dup = await createAccount(c, { ...blank, name: "甲（重复）", creditCode: "91330000X" });
  assert.equal(dup.ok === false && dup.violations[0].code, "credit_code_taken");
});

test("createAccount: needs account.upsert", async () => {
  const r = await createAccount(ctx("viewer"), { ...blank, name: "x" });
  assert.equal(r.ok, false);
});
