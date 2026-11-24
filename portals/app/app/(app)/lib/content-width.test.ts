import { test } from "node:test";
import assert from "node:assert/strict";
import { contentWidthCookieName, contentWidthPreference } from "./content-width";

test("unknown display preferences fall back to the standard layout", () => {
  for (const value of [undefined, null, "", "full", "1920", "WIDE"]) {
    assert.equal(contentWidthPreference(value), "standard");
  }
  assert.equal(contentWidthPreference("wide"), "wide");
});

test("display preference cookies cannot collide between signed-in accounts", () => {
  const a = contentWidthCookieName("account/a;b=wide");
  const b = contentWidthCookieName("account%2Fa;b=wide");
  assert.notEqual(a, b);
  assert.doesNotMatch(a, /[;=\s]/);
  assert.notEqual(contentWidthCookieName("member-1"), contentWidthCookieName("member-2"));
});
