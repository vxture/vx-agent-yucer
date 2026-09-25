import { test } from "node:test";
import assert from "node:assert/strict";
import { proposalGroup } from "./proposal-group";

const T = { planCommercial: "C", planRelation: "R", planTechnical: "T" };

test("a proposal is grouped by the capability that made it; unknown or none reads as commercial", () => {
  assert.equal(proposalGroup("deal.stall_risk", T), "C");
  assert.equal(proposalGroup("account.cadence", T), "R");
  assert.equal(proposalGroup("delivery.payment_risk", T), "T");
  assert.equal(proposalGroup(null, T), "C");
  assert.equal(proposalGroup("not.a.capability", T), "C");
});
