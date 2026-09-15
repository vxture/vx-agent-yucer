import { test } from "node:test";
import assert from "node:assert/strict";
import { websiteUrl } from "./website-url";

const KEY = "NEXT_PUBLIC_WEBSITE_URL";

function withEnv(value: string | undefined, fn: () => void): void {
  const saved = process.env[KEY];
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  try {
    fn();
  } finally {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  }
}

// Same three-way shape as consoleUrl beside it, and the distinction between
// the two falsy cases is the whole point: unset is "nobody has configured
// this", empty is "somebody configured it to nothing".

test("unset means the default, because a stack that never declares it still links somewhere real", () => {
  withEnv(undefined, () => assert.equal(websiteUrl(), "https://vxture.com"));
});

test("empty means no link at all - that is a decision, not a missing value", () => {
  // The header renders the button only when this returns a string, so this is
  // how a deployment turns the outward link off.
  withEnv("", () => assert.equal(websiteUrl(), null));
});

test("a trailing slash is dropped, so the href never doubles up", () => {
  withEnv("https://example.test/", () => assert.equal(websiteUrl(), "https://example.test"));
  withEnv("https://example.test", () => assert.equal(websiteUrl(), "https://example.test"));
});
