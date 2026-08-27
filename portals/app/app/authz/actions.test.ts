import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, ACTION_IDS, DOMAINS, specFor, type ActionId } from "./actions";
import { isPermCode, ROLE_PERMISSIONS, ROLE_CODES } from "./catalog";
import { FEATURE_KEYS, minTierFor } from "../entitlement/capability";

const FEATURES = new Set<string>(FEATURE_KEYS);

test("every action names a real feature key (or null) and a real permission", () => {
  for (const id of ACTION_IDS) {
    const spec = specFor(id);
    if (spec.feature != null) {
      assert.ok(FEATURES.has(spec.feature), `${id} names unknown feature ${spec.feature}`);
    }
    if (spec.permission != null) {
      assert.ok(isPermCode(spec.permission), `${id} names unknown permission ${spec.permission}`);
    }
  }
});

test("every action is filed under one of the nine partitions or admin", () => {
  const scopes = new Set<string>([...DOMAINS, "admin"]);
  for (const id of ACTION_IDS) {
    assert.ok(scopes.has(specFor(id).domain), `${id} has scope ${specFor(id).domain}`);
  }
});

// The read/write invariant is stated against the viewer role rather than
// against a ".read" suffix, because the copilot domain has no "copilot.read":
// its read-level permission is copilot.use, which the viewer holds precisely so
// a read-only member can still ask questions. Anchoring on the role says what
// the rule actually means - "a read-only member can do every read action, and no
// write action" - instead of on a naming coincidence that holds in seven domains
// out of eight.
const VIEWER = new Set<string>(ROLE_PERMISSIONS.viewer);

// Asking the copilot appends agent_session / agent_message rows, so `writes` is
// true, but the spec deliberately keeps these reachable by a viewer: they
// produce no DOMAIN write. Every other write must be out of a viewer's reach.
const VIEWER_WRITE_EXCEPTIONS = new Set<ActionId>([
  "copilot.session.open",
  "copilot.ask",
  "copilot.suggest",
]);

test("a read-only member can perform every domain read action", () => {
  // Scoped to the eight capability domains. The admin scope is excluded on
  // purpose: reading the role-assignment surface is an administrative read, so
  // it is gated by admin.manage rather than by a domain read permission. A
  // viewer being able to see who holds which role is a different decision from
  // a viewer being able to see the pipeline.
  for (const id of ACTION_IDS) {
    const spec = specFor(id);
    if (spec.writes || spec.permission == null || spec.domain === "admin") continue;
    assert.ok(VIEWER.has(spec.permission), `${id} reads but a viewer lacks ${spec.permission}`);
  }
});

test("every admin-scope action is gated by admin.manage and nothing else", () => {
  const adminActions = ACTION_IDS.filter((id) => specFor(id).domain === "admin");
  assert.ok(adminActions.length > 0);
  for (const id of adminActions) {
    assert.equal(specFor(id).permission, "admin.manage", `${id} escapes admin.manage`);
  }
});

test("a read-only member can perform no write action beyond asking the copilot", () => {
  // The clearest way this table goes wrong is a mutation wired to a read-level
  // permission - invisible until someone edits data they may only view.
  for (const id of ACTION_IDS) {
    const spec = specFor(id);
    if (!spec.writes || spec.permission == null) continue;
    if (VIEWER_WRITE_EXCEPTIONS.has(id)) {
      assert.ok(VIEWER.has(spec.permission), `${id} is a documented exception but unreachable`);
      continue;
    }
    assert.ok(!VIEWER.has(spec.permission), `${id} writes but is reachable by a viewer`);
  }
});

test("every feature key appears in at least one action", () => {
  // A packaged capability nobody can reach is a matrix row that sells nothing.
  const used = new Set(ACTION_IDS.map((id) => specFor(id).feature).filter(Boolean));
  for (const key of FEATURE_KEYS) {
    assert.ok(used.has(key), `feature ${key} is not reachable through any action`);
  }
});

test("every permission except copilot.autopilot is exercised by an action", () => {
  const used = new Set(ACTION_IDS.map((id) => specFor(id).permission).filter(Boolean));
  const missing = [...new Set(ROLE_CODES.flatMap((r) => [...ROLE_PERMISSIONS[r]]))].filter(
    (p) => !used.has(p),
  );
  assert.deepEqual(missing, [], "permissions granted but never required by any action");
});

test("action ids are unique and stable-looking", () => {
  assert.equal(new Set(ACTION_IDS).size, ACTION_IDS.length);
  for (const id of ACTION_IDS) {
    assert.match(id, /^[a-z]+(\.[a-z_]+)+$/, `${id} is not a dotted lowercase id`);
  }
});

// --- The specific pairings the spec argues for by name ----------------------

test("submitting a forecast requires the forecast permission, not pipeline.write", () => {
  assert.equal(specFor("pipeline.forecast.snapshot").permission, "pipeline.forecast");
  assert.equal(specFor("pipeline.opportunity.advance").permission, "pipeline.write");
});

test("converting a lead is gated by the receiving side (pipeline), not the lead's own domain", () => {
  const spec = specFor("signal.lead.convert");
  assert.equal(spec.domain, "pipeline");
  assert.equal(spec.feature, "pipeline.manage");
  assert.equal(spec.permission, "pipeline.write");
});

test("asking the copilot is cheaper than asking it to propose", () => {
  assert.equal(minTierFor(specFor("copilot.ask").feature!), "free");
  assert.equal(minTierFor(specFor("copilot.suggest").feature!), "pro");
  assert.equal(minTierFor(specFor("copilot.autopilot.enable").feature!), "enterprise");
});

test("adjudicating a proposal needs copilot.decide, not merely copilot.use", () => {
  assert.equal(specFor("copilot.action.decide").permission, "copilot.decide");
  assert.equal(specFor("copilot.action.decide_batch").permission, "copilot.decide");
  assert.equal(specFor("copilot.ask").permission, "copilot.use");
});

test("product administration is not tier-gated", () => {
  // A workspace that can use the product at all must be able to say who does
  // what inside it, on any tier.
  for (const id of ["admin.member.view", "admin.member.role.assign", "admin.member.role.revoke"] as ActionId[]) {
    assert.equal(specFor(id).feature, null, `${id} must not be tier-gated`);
    assert.equal(specFor(id).permission, "admin.manage");
  }
});

test("the copilot session and ask actions are writes despite being read-shaped", () => {
  // Opening a session and asking both append rows (agent_session, agent_message),
  // so they are writes even though the user experiences them as reading.
  assert.equal(ACTIONS["copilot.session.open"].writes, true);
  assert.equal(ACTIONS["copilot.ask"].writes, true);
  // copilot.use is the permission a viewer keeps precisely because the spec
  // treats asking as producing no DOMAIN write.
  assert.ok(ROLE_PERMISSIONS.viewer.includes("copilot.use"));
});
