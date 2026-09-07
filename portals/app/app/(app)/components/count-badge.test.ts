import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cappedCount } from "./count-badge";

// 最多两位，超过显示 99 (owner, 2026-09-07).
//
// Worth a test rather than a comment because the live fixtures cannot reach
// it: the header shows 3 and 9, so every path above two digits is unexercised
// by simply looking at the page. The rule was ruled once and would break
// silently.

test("one and two digits are shown as they are", () => {
  assert.equal(cappedCount(1), "1");
  assert.equal(cappedCount(9), "9");
  assert.equal(cappedCount(10), "10");
  assert.equal(cappedCount(99), "99");
});

test("past ninety-nine it shows 99, not 99+ and not the real figure", () => {
  assert.equal(cappedCount(100), "99");
  assert.equal(cappedCount(4321), "99");
  // The point of the ruling: the badge never grows a third glyph, so the
  // pill's width is bounded by two digits no matter what the count does.
  assert.equal(cappedCount(Number.MAX_SAFE_INTEGER).length, 2);
});
