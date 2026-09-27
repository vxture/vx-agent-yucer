import { test } from "node:test";
import assert from "node:assert/strict";
import { compactParts, formatCompactNumber } from "./view-model";

// The deals coin shows the bare figure; the unit and currency move to its
// tooltip (owner, 2026-09-24). The split must not lose either half.
test("the figure and its compact unit come apart, per locale", () => {
  assert.deepEqual(compactParts(2_400_000, "CNY", "zh-CN"), { figure: "240", unit: "万", currency: "CNY" });
  assert.deepEqual(compactParts(2_750_000, "CNY", "zh-CN"), { figure: "275", unit: "万", currency: "CNY" });
  assert.deepEqual(compactParts(2_400_000, "USD", "en-US"), { figure: "2.4", unit: "M", currency: "USD" });
  assert.deepEqual(compactParts(800, "CNY", "zh-CN"), { figure: "800", unit: "", currency: "CNY" });
});

test("formatCompactNumber: a chart-axis figure short enough not to clip, in the reader's locale", () => {
  assert.equal(formatCompactNumber(14_445_023, "zh-CN"), "1440万");
  assert.equal(formatCompactNumber(7_222_511, "zh-CN"), "722万");
  assert.equal(formatCompactNumber(14_445_023, "en-US"), "14.4M");
  assert.equal(formatCompactNumber(0, "zh-CN"), "0");
});
