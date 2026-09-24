import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../../entitlement/types";
import { minTierFor } from "../../../entitlement/capability";
import type { PermCode } from "../../../authz/catalog";
import { CAPABILITIES } from "./capability";
import { advisorFeature, canAdviseOn, canDecideProposal, canRunAdvisor } from "./advisor-gate";

// YC-042 section 03 is the authority for this table. It is restated here so a
// change to either side fails a test instead of silently re-tiering an advisor.
const YC042: Record<string, string> = {
  "deal.stall_risk": "free",
  "deal.competition": "free",
  "pricing.discount_approval": "free",
  "account.chain_map": "free",
  "account.cadence": "free",
  "account.upsell": "free",
  "account.consistency": "free",
  "signal.triage": "starter",
  "campaign.return": "starter",
  "delivery.payment_risk": "starter",
  "strategy.territory_attainment": "pro",
  "strategy.segment_coverage": "business",
};

const ent = (tier: Entitlement["tier"]): Entitlement => ({ ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier, status: tier ? "active" : null });
const holder = (...p: PermCode[]) => ({ permissions: new Set<PermCode>(p) });

test("every capability opens at the tier YC-042 names", () => {
  assert.deepEqual(Object.keys(YC042).sort(), [...CAPABILITIES].sort());
  for (const c of CAPABILITIES) assert.equal(minTierFor(advisorFeature(c)), YC042[c], c);
});

test("no capability is gated on copilot.suggest - that key is the session tool loop's", () => {
  for (const c of CAPABILITIES) assert.notEqual(advisorFeature(c), "copilot.suggest", c);
  assert.equal(advisorFeature(null), "copilot.suggest");
  assert.equal(advisorFeature("not.a.capability"), "copilot.suggest");
});

test("running needs copilot.use, deciding needs copilot.decide, both after the tier", () => {
  const user = holder("copilot.use");
  assert.equal(canRunAdvisor(user, ent("free"), "deal.stall_risk").allowed, true);
  assert.equal(canDecideProposal(user, ent("free"), "deal.stall_risk").reason, "permission_denied");
  assert.equal(canDecideProposal(holder("copilot.decide"), ent("free"), "deal.stall_risk").allowed, true);
  assert.equal(canRunAdvisor(user, ent("free"), "signal.triage").reason, "feature_not_in_tier");
  assert.equal(canRunAdvisor(holder(), ent("free"), "signal.triage").reason, "feature_not_in_tier");
  assert.equal(canRunAdvisor(holder(), ent("free"), "deal.stall_risk").reason, "permission_denied");
});

test("an output with no capability is gated on the feature its caller names", () => {
  assert.equal(canAdviseOn(holder("copilot.use"), ent("free"), "account.manage", "ui").allowed, true);
  assert.equal(canAdviseOn(holder("copilot.use"), ent(null), "account.manage", "ui").reason, "no_product_access");
});
