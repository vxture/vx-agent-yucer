import assert from "node:assert/strict";
import { test } from "node:test";
import { HOME_HEADLINE_COUNT, homeHeadlineIndex } from "./home-headline";
import { HOME_OVERVIEW_TEXT } from "./messages";
import { en } from "./messages.en";

test("ten translated headlines stay fixed throughout the same hour", () => {
  assert.equal(HOME_HEADLINE_COUNT, 10);
  assert.equal(new Set(HOME_OVERVIEW_TEXT.headlines).size, 10);
  assert.equal(new Set(en.HOME_OVERVIEW_TEXT.headlines).size, 10);
  const start = Date.parse("2026-11-26T08:00:00Z");
  for (let hour = 0; hour < 24 * 30; hour++) {
    const time = start + hour * 3_600_000, index = homeHeadlineIndex(time);
    assert.ok(index >= 0 && index < 10);
    assert.equal(homeHeadlineIndex(time + 1), index);
    assert.equal(homeHeadlineIndex(time + 3_599_999), index);
  }
  assert.equal(new Set(Array.from({length: 24 * 30}, (_, i) => homeHeadlineIndex(start + i * 3_600_000))).size, 10);
});
