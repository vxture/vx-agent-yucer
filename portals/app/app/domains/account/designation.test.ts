import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionsForRoles } from "../../authz/catalog";
import { scopeAccountStore } from "../../authz/scoped-stores";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { unwrap } from "../shared/result";
import { createAccount, designateAccount, importanceScheme, type AccountContext } from "./service";
import { InMemoryAccountStore, type AccountPlanWrite } from "./store";

const WS = "ws_designation";
const basics = { name: "New account", region: null, province: null, industryId: null, segmentCode: null,
  customerTypeId: null, customerSizeId: null, customerNatureId: null, creditCode: null, website: null, employeeCount: null };
const plan = { period: "Y2026", targetAmount: 500000, contactCadenceDays: 14, execCadenceDays: 60 };
const context = (store = new InMemoryAccountStore()): AccountContext => ({ workspaceId: WS, sub: "operator",
  holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
  entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "pro" }, store });
const error = (r: { ok: boolean; violations?: { code: string }[] }) => r.ok ? null : r.violations![0]!.code;

test("the existing create verb accepts ordinary accounts with or without operating information", async () => {
  const c = context();
  const ordinary = unwrap(await createAccount(c, basics));
  assert.equal(ordinary.tier, "standard");
  assert.equal(await c.store.getAccountPlan(WS, ordinary.id), null);
  const planned = unwrap(await createAccount(c, { ...basics, plan: { ...plan, targetAmount: null } }));
  assert.equal(planned.tier, "standard");
  assert.equal((await c.store.getAccountPlan(WS, planned.id))?.targetAmount, null);
});

test("strategic creation stores the same customer record and its complete plan", async () => {
  const c = context();
  const levels = unwrap(await importanceScheme(c));
  const made = unwrap(await createAccount(c, { ...basics, tier: "strategic", plan }));
  assert.equal(made.tier, "strategic");
  const saved = await c.store.getAccountPlan(WS, made.id);
  assert.equal(saved?.targetAmount, 500000);
  assert.equal(saved?.ownerSub, "operator");
  assert.equal((await c.store.listAccounts(WS)).length, 1);
  // Both representations must resolve to the same medal.
  assert.ok(levels.account.some((l) => l.levelCode === made.tier));
});

test("strategic required fields and invalid numbers fail before any customer is created", async () => {
  const c = context();
  const cases = [
    [undefined, "plan_required"],
    [{ ...plan, targetAmount: null }, "plan_target_required"],
    [{ ...plan, targetAmount: -1 }, "plan_target_invalid"],
    [{ ...plan, targetAmount: Number.NaN }, "plan_target_invalid"],
    [{ ...plan, targetAmount: Infinity }, "plan_target_invalid"],
    [{ ...plan, period: " " }, "period_required"],
    [{ ...plan, period: "x".repeat(17) }, "period_required"],
    [{ ...plan, contactCadenceDays: 0 }, "cadence_positive"],
    [{ ...plan, execCadenceDays: 2.5 }, "cadence_positive"],
  ] as const;
  for (const [input, expected] of cases) assert.equal(error(await createAccount(c, { ...basics, tier: "strategic", plan: input })), expected);
  assert.equal((await c.store.listAccounts(WS)).length, 0);
});

test("linking upgrades the original id and preserves owner and existing operating assignments", async () => {
  const c = context();
  const made = unwrap(await createAccount(c, { ...basics, creditCode: "CODE-1", plan }));
  await c.store.updateAccount(WS, made.id, { ownerSub: "sales_owner" });
  await c.store.upsertAccountPlan(WS, { ...plan, accountId: made.id, ownerSub: "plan_owner", presalesSub: "presales", deliverySub: "delivery", status: "active" });
  unwrap(await designateAccount(c, { accountId: made.id, tier: "strategic", plan: { ...plan, targetAmount: 750000 } }));
  const after = await c.store.getAccount(WS, made.id);
  assert.equal(after?.tier, "strategic");
  assert.equal(after?.ownerSub, "sales_owner");
  assert.equal(after?.creditCode, "CODE-1");
  const saved = await c.store.getAccountPlan(WS, made.id);
  assert.equal(saved?.ownerSub, "plan_owner");
  assert.equal(saved?.presalesSub, "presales");
  assert.equal(saved?.deliverySub, "delivery");
  assert.equal(saved?.targetAmount, 750000);
  assert.equal((await c.store.listAccounts(WS)).length, 1);
  unwrap(await designateAccount(c, { accountId: made.id, tier: "strategic", plan }));
  assert.equal((await c.store.getAccountPlan(WS, made.id))?.targetAmount, plan.targetAmount, "same-tier plan edits are saved");
});

test("ordinary plans are optional and closed plans are not silently reopened by editing", async () => {
  const c = context();
  const made = unwrap(await createAccount(c, basics));
  unwrap(await designateAccount(c, { accountId: made.id, tier: "standard", plan }));
  await c.store.upsertAccountPlan(WS, { ...plan, accountId: made.id, ownerSub: "owner", presalesSub: null, deliverySub: null, status: "closed", closeReason: "paused" });
  unwrap(await designateAccount(c, { accountId: made.id, tier: "standard", plan: { ...plan, targetAmount: null } }));
  const after = await c.store.latestAccountPlan(WS, made.id);
  assert.equal(after?.status, "closed");
  assert.equal(after?.closeReason, "paused");
});

test("permissions, product entitlement and scoped reads guard both entry paths", async () => {
  const c = context();
  const made = unwrap(await createAccount(c, basics));
  const viewer = { ...c, holder: { permissions: new Set(permissionsForRoles(["viewer"])) } };
  const noProduct = { ...c, entitlement: { ...c.entitlement, tier: null, bundled: false } };
  for (const denied of [viewer, noProduct]) {
    assert.equal((await createAccount(denied, { ...basics, tier: "strategic", plan })).ok, false);
    assert.equal((await designateAccount(denied, { accountId: made.id, tier: "strategic", plan })).ok, false);
  }
  assert.equal(error(await designateAccount({ ...c, workspaceId: "other" }, { accountId: made.id, tier: "strategic", plan })), "not_found");
  const scoped = { ...c, store: scopeAccountStore(c.store, { kind: "own", sub: "someone_else", accountIds: [] }) };
  assert.equal(error(await designateAccount(scoped, { accountId: made.id, tier: "strategic", plan })), "not_found");
  assert.equal((await c.store.getAccount(WS, made.id))?.tier, "standard");
});

test("a failed plan write leaves neither an orphaned customer nor a changed tier", async () => {
  class FailingStore extends InMemoryAccountStore {
    override async upsertAccountPlan(_ws: string, _plan: AccountPlanWrite & { accountId: string }): Promise<never> { throw new Error("plan unavailable"); }
  }
  const c = context(new FailingStore());
  await assert.rejects(createAccount(c, { ...basics, tier: "strategic", plan }), /plan unavailable/);
  assert.equal((await c.store.listAccounts(WS)).length, 0);
  const ordinary = unwrap(await createAccount(c, basics));
  await assert.rejects(designateAccount(c, { accountId: ordinary.id, tier: "strategic", plan }), /plan unavailable/);
  assert.equal((await c.store.getAccount(WS, ordinary.id))?.tier, "standard");
});
