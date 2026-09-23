import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap, type RuleResult } from "../shared/result";
import { InMemoryDeliveryStore } from "./store";
import {
  listContracts,
  removeContractLine,
  upsertContract,
  upsertContractLine,
  type DeliveryContext,
} from "./service";
import type { ContractDraft } from "./lib/contract";

const WS = "ws_1";
const day = (s: string) => new Date(`${s}T00:00:00Z`);

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryDeliveryStore()): DeliveryContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

function draft(over: Partial<ContractDraft> = {}): ContractDraft {
  return {
    contractNo: "HT-1",
    name: "Annual subscription",
    accountId: "acc_1",
    opportunityId: null,
    totalAmount: 100_000,
    currency: "CNY",
    termStart: day("2026-01-01"),
    termEnd: day("2026-12-31"),
    noticeDays: 30,
    status: "active",
    signedAt: null,
    ...over,
  };
}

const firstCode = (r: RuleResult<unknown>) => (r.ok ? null : r.violations[0].code);

test("the acceptance case: a contract with three lines is visible on its account", async () => {
  const c = ctx("delivery_manager", "starter");
  const contract = unwrap(await upsertContract(c, draft()));
  for (const productId of ["p1", "p2", "p3"]) {
    unwrap(await upsertContractLine(c, contract.id, { productId, quantity: 2, unitPrice: 10, termEnd: null }));
  }
  const listed = unwrap(await listContracts(c, { accountId: "acc_1" }));
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0].lines.map((l) => [l.productId, l.amount]), [["p1", 20], ["p2", 20], ["p3", 20]]);
  assert.deepEqual(unwrap(await listContracts(c, { accountId: "acc_2" })), []);
});

test("starter is enough: contracts ride delivery.project, not delivery.revenue", async () => {
  assert.ok((await listContracts(ctx("delivery_manager", "starter"))).ok);
  assert.equal(firstCode(await listContracts(ctx("delivery_manager", "free"))), "feature_not_in_tier");
});

test("a viewer reads contracts but cannot write one", async () => {
  const store = new InMemoryDeliveryStore();
  assert.ok((await listContracts(ctx("viewer", "starter", store))).ok);
  assert.equal(firstCode(await upsertContract(ctx("viewer", "starter", store), draft())), "permission_denied");
});

test("a contract number typed twice is refused, not an edit of the first", async () => {
  const c = ctx("delivery_manager", "starter");
  unwrap(await upsertContract(c, draft()));
  assert.equal(firstCode(await upsertContract(c, draft({ accountId: "acc_2" }))), "contract_no_taken");
});

test("an edit changes the writable fields and nothing else", async () => {
  const c = ctx("delivery_manager", "starter");
  const created = unwrap(await upsertContract(c, draft({ opportunityId: "opp_1" })));
  unwrap(await upsertContract(c, draft({ opportunityId: "opp_1", name: "Renamed", noticeDays: 60 }), created.id));
  const [held] = unwrap(await listContracts(c));
  assert.equal(held.name, "Renamed");
  assert.equal(held.noticeDays, 60);
  assert.equal(firstCode(await upsertContract(c, draft({ opportunityId: "opp_2" }), created.id)), "frozen_field");
  assert.equal(firstCode(await upsertContract(c, draft(), "ct_missing")), "not_found");
});

test("the currency cannot change underneath existing lines", async () => {
  const c = ctx("delivery_manager", "starter");
  const created = unwrap(await upsertContract(c, draft()));
  unwrap(await upsertContractLine(c, created.id, { productId: "p1", quantity: 1, unitPrice: 1, termEnd: null }));
  assert.equal(firstCode(await upsertContract(c, draft({ currency: "USD" }), created.id)), "currency_mismatch");
});

test("editing and removing a line; a terminated contract refuses both", async () => {
  const c = ctx("delivery_manager", "starter");
  const created = unwrap(await upsertContract(c, draft()));
  const line = unwrap(await upsertContractLine(c, created.id, { productId: "p1", quantity: 1, unitPrice: 5, termEnd: null }));
  const edited = unwrap(
    await upsertContractLine(c, created.id, { productId: "p1", quantity: 4, unitPrice: 5, termEnd: null }, line.id),
  );
  assert.equal(edited.amount, 20);
  unwrap(await removeContractLine(c, created.id, line.id));
  assert.equal(unwrap(await listContracts(c))[0].lines.length, 0);
  assert.equal(firstCode(await removeContractLine(c, created.id, line.id)), "not_found");

  const again = unwrap(await upsertContractLine(c, created.id, { productId: "p2", quantity: 1, unitPrice: 5, termEnd: null }));
  unwrap(await upsertContract(c, draft({ status: "terminated" }), created.id));
  assert.equal(firstCode(await removeContractLine(c, created.id, again.id)), "contract_closed");
  assert.equal(
    firstCode(await upsertContractLine(c, created.id, { productId: "p3", quantity: 1, unitPrice: 1, termEnd: null })),
    "contract_closed",
  );
});
