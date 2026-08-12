import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPABILITY_MATRIX, FEATURE_KEYS, canUseFeature, minTierFor } from "./capability";
import { EMPTY_ENTITLEMENT, TIERS, type Entitlement } from "./types";

function ent(over: Partial<Entitlement>): Entitlement {
  return { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", ...over };
}

test("every tier list is a subset of the declared feature-key set", () => {
  const declared = new Set<string>(FEATURE_KEYS);
  for (const tier of TIERS) {
    for (const key of CAPABILITY_MATRIX[tier]) {
      assert.ok(declared.has(key), `${tier} grants undeclared key ${key}`);
    }
  }
});

test("the matrix is cumulative - each tier contains every lower tier's keys", () => {
  for (let i = 1; i < TIERS.length; i++) {
    const lower = CAPABILITY_MATRIX[TIERS[i - 1]];
    const higher = new Set<string>(CAPABILITY_MATRIX[TIERS[i]]);
    for (const key of lower) {
      assert.ok(higher.has(key), `${TIERS[i]} is missing ${key} held by ${TIERS[i - 1]}`);
    }
  }
});

test("no tier lists a duplicate key", () => {
  for (const tier of TIERS) {
    const keys = CAPABILITY_MATRIX[tier];
    assert.equal(new Set(keys).size, keys.length, `${tier} has duplicate keys`);
  }
});

test("every declared key is reachable from some tier", () => {
  for (const key of FEATURE_KEYS) {
    assert.notEqual(minTierFor(key), null, `${key} is granted by no tier`);
  }
});

test("minTierFor returns the lowest granting tier", () => {
  assert.equal(minTierFor("account.manage"), "free");
  assert.equal(minTierFor("signal.inbox"), "starter");
  assert.equal(minTierFor("pipeline.forecast"), "pro");
  assert.equal(minTierFor("strategy.plan"), "business");
  assert.equal(minTierFor("copilot.autopilot"), "enterprise");
});

test("canUseFeature is gated by product access, not just the matrix", () => {
  // tier null = no direct purchase -> no feature, even a free-tier one.
  assert.equal(canUseFeature(ent({ tier: null }), "account.manage"), false);
  // bundled coverage alone does not open the UI gate (hasProductAccess is tier-only).
  assert.equal(canUseFeature(ent({ tier: null, bundled: true }), "account.manage"), false);
  assert.equal(canUseFeature(ent({ tier: "free" }), "account.manage"), true);
  assert.equal(canUseFeature(ent({ tier: "free" }), "copilot.autopilot"), false);
  assert.equal(canUseFeature(ent({ tier: "enterprise" }), "copilot.autopilot"), true);
});
