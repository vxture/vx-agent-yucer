import { test } from "node:test";
import assert from "node:assert/strict";
import { consoleMembersUrl } from "./console-url";

const KEY = "NEXT_PUBLIC_CONSOLE_MEMBERS_URL";

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

test("unset means no button, not a button that goes nowhere", () => {
  // The members page renders the invite control only when this returns a
  // string. A link to "" or to undefined would render a button that looks
  // available and lands nowhere, which is worse than not offering it.
  withEnv(undefined, () => assert.equal(consoleMembersUrl(), null));
  withEnv("", () => assert.equal(consoleMembersUrl(), null));
  withEnv("   ", () => assert.equal(consoleMembersUrl(), null, "whitespace is not a URL"));
});

test("configured means the console decides its own path", () => {
  // Deliberately NOT derived by appending a guess to NEXT_PUBLIC_CONSOLE_URL:
  // the console's URL structure is the console's, and a hardcoded
  // /workspace/members would render a working button onto a 404.
  withEnv("https://console.vxture.com/w/members", () =>
    assert.equal(consoleMembersUrl(), "https://console.vxture.com/w/members"),
  );
});
