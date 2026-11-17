import { test } from "node:test";
import assert from "node:assert/strict";
import { sameSessionIdentity } from "./session-identity";

test("a changed user, organization or workspace requires discarding previous-user UI", () => {
  const current = { sub: "a", activeOrg: "org", activeWorkspace: "workspace" };
  assert.equal(sameSessionIdentity(current, { ...current }), true);
  for (const other of [{ sub: "b" }, { activeOrg: "other" }, { activeWorkspace: "other" }]) {
    assert.equal(sameSessionIdentity(current, { ...current, ...other }), false);
  }
});
