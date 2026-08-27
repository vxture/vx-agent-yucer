import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPABILITIES, CAPABILITY_SPEC, isCapability, capabilityLabel } from "./capability";

const LABELS: Record<string, string> = { "deal.stall_risk": "stall" };

test("every capability declares a task and a non-empty evidence scope", () => {
  for (const c of CAPABILITIES) {
    const spec = CAPABILITY_SPEC[c];
    assert.ok(spec, `${c} has no spec`);
      assert.ok(spec.evidence.length > 0, `${c} retrieves nothing, so it cannot reason`);
  }
});

// ADR-015: the operator owns the model, the product owns the task. A capability
// that named a model would take that back.
test("capabilities name a task, never a model", () => {
  const tasks = new Set(CAPABILITIES.map((c) => CAPABILITY_SPEC[c].task));
  for (const t of tasks) {
    assert.ok(["chat", "propose", "score", "summarize"].includes(t), `${t} is not a CopilotTask`);
  }
  // Bulk scoring must not sit on the reasoning endpoint by accident.
  assert.equal(CAPABILITY_SPEC["signal.triage"].task, "score");
  // A proposal a human signs is worth the stronger model.
  assert.equal(CAPABILITY_SPEC["deal.stall_risk"].task, "propose");
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
