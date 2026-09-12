import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore } from "./store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { DEFAULT_PRICING_POLICY, planPricingPolicy } from "./lib/pricing-policy";
import { priceLine } from "./lib/pricing";
import { pricingPolicy, setPricingPolicy, type CatalogContext } from "./service";
import { createOpportunity } from "../pipeline/service";

// 计价规则 - incr/0044, the rule and the two verbs, and the one thing that
// matters more than either: that a deal created after the policy changes is
// priced in the new currency without anybody typing it.

const WS = "ws_pp";

function ctx(role: RoleCode, store = new InMemoryCatalogStore()): CatalogContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" as Entitlement["tier"] },
    store,
  };
}

test("a currency is one of the four shipped codes, and is stored as such however it was typed", () => {
  assert.deepEqual(unwrap(planPricingPolicy({ defaultCurrency: " usd " })), { defaultCurrency: "USD" });
  // Three valid-SHAPED capitals is not enough on its own (owner, 2026-09-12:
  // 换成封闭下拉，只能在候选列表里选) - EUR is a real ISO 4217 code the old
  // regex-only check would have passed; it is not one of the four this
  // workspace is offered.
  for (const bad of ["CN", "CNYY", "cn1", "", "EUR", "GBP"]) {
    const r = planPricingPolicy({ defaultCurrency: bad });
    assert.equal(r.ok === false && r.violations[0].code, "currency_invalid", bad);
  }
});

test("a workspace that has set nothing prices in the shipped default", async () => {
  assert.deepEqual(unwrap(await pricingPolicy(ctx("sales_rep"))), DEFAULT_PRICING_POLICY);
});

test("reading the policy is every role's; setting it is the floor-price permission", async () => {
  const store = new InMemoryCatalogStore();
  assert.equal((await pricingPolicy(ctx("viewer", store))).ok, true);
  const rep = await setPricingPolicy(ctx("sales_rep", store), { defaultCurrency: "USD" });
  assert.equal(rep.ok === false && rep.violations[0].code, "permission_denied");
  assert.deepEqual(unwrap(await setPricingPolicy(ctx("sales_leader", store), { defaultCurrency: "usd" })), {
    defaultCurrency: "USD",
  });
});

test("a line priced with no currency anywhere takes the workspace's, not the build's", () => {
  const l = priceLine({ productId: "p", quantity: 1, unitPrice: 10 }, null, "USD");
  assert.equal(l.currency, "USD");
  // The book's currency still wins over the default: a priced product is
  // priced in something, and that something is not a policy.
  const entry = { id: "e", workspaceId: WS, productId: "p", currency: "HKD", listPrice: 10, floorPrice: 5, effectiveAt: new Date(), supersedesId: null };
  assert.equal(priceLine({ productId: "p", quantity: 1, unitPrice: 10 }, entry, "USD").currency, "HKD");
});

test("a deal created after the policy changed is in the new currency, untyped", async () => {
  /* THE POINT OF THE WHOLE ROW. Nothing on the deal says a currency; the
     pipeline asks the catalogue what this workspace prices in. */
  const catalog = new InMemoryCatalogStore();
  const pipeline = new InMemoryPipelineStore();
  await setPricingPolicy(ctx("sales_leader", catalog), { defaultCurrency: "USD" });
  const made = unwrap(await createOpportunity(
    {
      workspaceId: WS,
      sub: "usr_me",
      holder: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
      entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" },
      store: pipeline,
      catalog,
    },
    { name: "Deal", accountId: "acc_1", territoryId: null, ownerSub: null, requirement: "wants a thing", amount: null, expectedCloseAt: null },
  ));
  assert.equal(made.currency, "USD");
});
