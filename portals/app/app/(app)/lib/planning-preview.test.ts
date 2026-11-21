import { test } from "node:test";
import assert from "node:assert/strict";
import { planningPipelineCoverage, previewTargetDelta } from "./planning-preview";
import { targetDelta } from "../../domains/planning/plan-state";

test("incomplete draft amounts do not interrupt the editor or loosen domain validation", () => {
  for (const value of [
    "",
    ".",
    "12.",
    "-",
    "1,000",
    "Infinity",
    "1.234",
    "0002",
    "10000000000000",
  ]) {
    assert.equal(previewTargetDelta("100", value), null);
    assert.equal(previewTargetDelta(value, "100"), null);
    assert.throws(() => targetDelta("100", value), /invalid_amount/);
  }
});

test("valid previews retain exact cents and null versus zero semantics", () => {
  assert.deepEqual(previewTargetDelta("0.10", "0.30"), {
    amount: "+0.20",
    percent: "+200.00%",
  });
  assert.deepEqual(previewTargetDelta("0", "1"), {
    amount: "+1.00",
    percent: null,
  });
  assert.equal(previewTargetDelta(null, "1"), null);
  assert.equal(previewTargetDelta("1", null), null);
});

test("pipeline multiples use a formal revenue baseline and leave unknown or zero denominators unset", () => {
  assert.equal(planningPipelineCoverage("3000000", "1000000", "en-US"), "3\u00d7");
  assert.equal(planningPipelineCoverage("0", "1000000", "en-US"), "0\u00d7");
  for (const baseline of [null, "0", "Infinity", "invalid"]) assert.equal(planningPipelineCoverage("300", baseline, "en-US"), null);
  assert.equal(planningPipelineCoverage("invalid", "100", "en-US"), null);
});
