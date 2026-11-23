import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionIdentityKey } from "./session-identity";
import { sessionProbeDecision } from "./session-probe";
const identity = { sub: "member", activeOrg: "org", activeWorkspace: "workspace", roles: [] };
const identityKey = sessionIdentityKey(identity);
const reply = { authenticated: true, user: identity, productAccess: "ready", accessRevision: "r1" };
test("probe distinguishes unknown, ended, revoked and same-identity recovery", () => {
  assert.equal(sessionProbeDecision(identityKey, "ready", "r1", reply), "ready");
  assert.equal(sessionProbeDecision(identityKey, "ready", "r1", reply, false), "unavailable");
  assert.equal(sessionProbeDecision(identityKey, "ready", "r1", { authenticated: false }), "ended");
  for (const body of [null, {}, { ...reply, authenticated: null }, { ...reply, productAccess: "unavailable" }, { ...reply, productAccess: undefined }, { ...reply, user: { ...identity, roles: "owner" } }]) assert.equal(sessionProbeDecision(identityKey, "ready", "r1", body), "unavailable");
  assert.equal(sessionProbeDecision(identityKey, "ready", "r1", { ...reply, productAccess: "unassigned" }), "reloading");
  assert.equal(sessionProbeDecision(identityKey, "ready", "r1", { ...reply, accessRevision: "r2" }), "reloading");
});
test("new account or tenant clears old private surface even when new access failed", () => {
  for (const user of [{ ...identity, sub: "other" }, { ...identity, activeOrg: "other" }, { ...identity, activeWorkspace: "other" }]) assert.equal(sessionProbeDecision(identityKey, "ready", "r1", { ...reply, user, productAccess: "unavailable" }), "reloading");
});
