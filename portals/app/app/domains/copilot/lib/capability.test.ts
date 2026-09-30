import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPABILITIES, CAPABILITY_SPEC, isCapability, capabilityLabel } from "./capability";
import { CALL_PROFILES } from "../../../agent/atlas/profiles";

const LABELS: Record<string, string> = { "deal.stall_risk": "stall" };

test("every capability declares a profile and a non-empty evidence scope", () => {
  for (const c of CAPABILITIES) {
    const spec = CAPABILITY_SPEC[c];
    assert.ok(spec, `${c} has no spec`);
      assert.ok(spec.evidence.length > 0, `${c} retrieves nothing, so it cannot reason`);
  }
});

// ADR-015: the operator owns the model, the product owns the profile. A
// capability that named a model would take that back.
test("capabilities name a call profile, never a model", () => {
  for (const c of CAPABILITIES) {
    assert.ok(CALL_PROFILES.includes(CAPABILITY_SPEC[c].profile), `${c}: ${CAPABILITY_SPEC[c].profile} is not a CallProfile`);
  }
  // Bulk scoring must not sit on the reasoning route by accident.
  assert.equal(CAPABILITY_SPEC["signal.triage"].profile, "triage");
});

// The owner's ruling (2026-09-30): exactly these four reason. Reasoning is
// slower and dearer, so a fifth is a decision, not a drift - this test makes
// adding one an explicit edit here.
test("only the four ruled capabilities reason", () => {
  const reasoning = CAPABILITIES.filter((c) => CAPABILITY_SPEC[c].profile === "judgement").sort();
  assert.deepEqual(reasoning, ["account.consistency", "deal.next_action", "deal.plan", "deal.price"]);
});

// The cadence capability is the one whose evidence is an ABSENCE (ADR-013).
test("the cadence capability does not retrieve interactions - there are none", () => {
  assert.ok(!CAPABILITY_SPEC["account.cadence"].evidence.includes("interactions"));
});

test("a discount decision does not pull the customer's meeting notes", () => {
  const ev = CAPABILITY_SPEC["pricing.discount_approval"].evidence;
  assert.ok(!ev.includes("interactions"), "wider retrieval buries the number the decision turns on");
  assert.ok(ev.includes("lines"));
});

test("unlabelled history stays visibly unlabelled rather than guessing", () => {
  assert.equal(capabilityLabel(null, LABELS, "none"), "none");
  assert.equal(capabilityLabel("made.up", LABELS, "none"), "none");
  assert.equal(capabilityLabel("deal.stall_risk", LABELS, "none"), "stall");
  assert.equal(isCapability("deal.stall_risk"), true);
  assert.equal(isCapability("nope"), false);
});
