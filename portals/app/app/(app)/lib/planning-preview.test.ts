import { test } from "node:test";
import assert from "node:assert/strict";
import { previewTargetDelta } from "./planning-preview";
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
