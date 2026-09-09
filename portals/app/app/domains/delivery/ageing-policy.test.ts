import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryDeliveryStore } from "./store";
import { DEFAULT_AGEING_CUTOFFS, planAgeingCutoffs } from "./lib/collection-stats";
import { ageingCutoffs, setAgeingCutoffs, type DeliveryContext } from "./service";

// 账龄分档 - incr/0042, the rule and the two verbs.
//
// The database half (the three CHECKs and the grant) is proved in
// ageing-policy.db.test.ts against a real Postgres; the band arithmetic is in
// collection-stats.test.ts. This file is what the product refuses and who may
// change it.

const WS = "ws_ap";

function ctx(role: RoleCode, store = new InMemoryDeliveryStore()): DeliveryContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" },
    store,
  };
}

test("cutoffs have to rise, because two bands cannot claim one day", () => {
  const flat = planAgeingCutoffs([30, 30]);
  assert.equal(flat.ok === false && flat.violations[0].code, "cutoffs_unordered");
  const backwards = planAgeingCutoffs([60, 30]);
  assert.equal(backwards.ok === false && backwards.violations[0].code, "cutoffs_unordered");
  assert.equal(planAgeingCutoffs([30, 60, 90]).ok, true);
});

test("there is at least one cutoff and at most five", () => {
  const none = planAgeingCutoffs([]);
  assert.equal(none.ok === false && none.violations[0].code, "cutoff_count");
  const many = planAgeingCutoffs([10, 20, 30, 40, 50, 60]);
  assert.equal(many.ok === false && many.violations[0].code, "cutoff_count");
});

test("a cutoff is a whole number of days", () => {
  for (const bad of [[0], [-30], [30.5], [Number.NaN]]) {
    const r = planAgeingCutoffs(bad);
    assert.equal(r.ok === false && r.violations[0].code, "cutoff_range", JSON.stringify(bad));
  }
});

test("a workspace that has set nothing ages at the shipped cutoffs", async () => {
  const store = new InMemoryDeliveryStore();
  assert.deepEqual(unwrap(await ageingCutoffs(ctx("delivery_manager", store))), [
    ...DEFAULT_AGEING_CUTOFFS,
  ]);
});

test("what is saved is what the collections page then cuts by", async () => {
  const store = new InMemoryDeliveryStore();
  const c = ctx("delivery_manager", store);
  unwrap(await setAgeingCutoffs(c, [45, 90]));
  assert.deepEqual(unwrap(await ageingCutoffs(c)), [45, 90]);
});

test("reading the policy is not the same authority as setting it", async () => {
  const store = new InMemoryDeliveryStore();
  assert.equal((await ageingCutoffs(ctx("viewer", store))).ok, true);
  const r = await setAgeingCutoffs(ctx("viewer", store), [45]);
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});
