import { test } from "node:test";
import assert from "node:assert/strict";
import { devRole, devSessionEnabled, resolveDevSession, type EnvLike } from "./dev-session";
import { ROLE_PERMISSIONS, permissionsForRoles } from "../../authz/catalog";

// The guard, not the convenience.
//
// This module opens a hole in the authentication path. The tests that matter
// are the ones proving it CANNOT be open where it must not be - a synthetic
// session that reached production would be a total authentication bypass, and
// "the comment says it is dev-only" is not a control.

const ON: EnvLike = { YUCER_DEV_SESSION: "on", NODE_ENV: "development" };

// --- Off unless every condition holds --------------------------------------

test("absent means OFF", () => {
  assert.equal(devSessionEnabled({}), false);
  assert.equal(devSessionEnabled({ NODE_ENV: "development" }), false);
});

test("only the literal \"on\" counts", () => {
  // A truthy-string check would make YUCER_DEV_SESSION=off turn it ON, which is
  // the single most embarrassing way for a switch like this to fail.
  for (const v of ["true", "1", "yes", "ON", "On", "off", "false", ""]) {
    assert.equal(
      devSessionEnabled({ ...ON, YUCER_DEV_SESSION: v }),
      false,
      `YUCER_DEV_SESSION=${JSON.stringify(v)} must not enable it`,
    );
  }
  assert.equal(devSessionEnabled(ON), true);
});

test("a production build refuses whatever the environment says", () => {
  // The condition that has to hold even if someone ships the flag by accident.
  assert.equal(devSessionEnabled({ ...ON, NODE_ENV: "production" }), false);
});

test("a configured database refuses it", () => {
  // Same reason ensureDemoData refuses: a synthetic member must never be
  // pointed at real data.
  assert.equal(
    devSessionEnabled({ ...ON, DATABASE_URL: "postgresql://localhost/real" }),
    false,
  );
});

test("the three conditions are independent - no single mistake opens it", async () => {
  // Each row flips exactly one condition away from the enabled state.
  const breaks: EnvLike[] = [
    { ...ON, NODE_ENV: "production" },
    { ...ON, YUCER_DEV_SESSION: "true" },
    { ...ON, DATABASE_URL: "postgresql://localhost/real" },
  ];
  for (const env of breaks) {
    assert.equal(devSessionEnabled(env), false, JSON.stringify(env));
    assert.equal(await resolveDevSession(env), null, "and no session is produced");
  }
});

test("resolveDevSession returns null rather than a partial session when disabled", async () => {
  // A caller that forgot to check the flag must get nothing usable, not a
  // half-built object it might treat as authenticated.
  assert.equal(await resolveDevSession({}), null);
});

// --- What it produces when it IS on ----------------------------------------

test("the synthetic member carries a REAL role from the catalog", async () => {
  // The gates are not bypassed - only identity is. A fake session with fake
  // permissions would show a product nobody will ever see.
  const s = await resolveDevSession({ ...ON, YUCER_DEV_ROLE: "sales_rep" });
  assert.ok(s);
  assert.deepEqual(s.authz.roles, ["sales_rep"]);
  assert.deepEqual(
    [...s.authz.permissions].sort(),
    [...permissionsForRoles(["sales_rep"])].sort(),
  );
});

test("a role outside the catalog falls back rather than inventing one", async () => {
  // Inventing a permission set would let the local surface show affordances no
  // real role has.
  assert.equal(devRole({ YUCER_DEV_ROLE: "god_mode" }), "sales_leader");
  assert.equal(devRole({}), "sales_leader");

  const s = await resolveDevSession({ ...ON, YUCER_DEV_ROLE: "god_mode" });
  assert.ok(s);
  assert.deepEqual(s.authz.roles, ["sales_leader"]);
  assert.ok(
    [...s.authz.permissions].every((p) => ROLE_PERMISSIONS.sales_leader.includes(p)),
    "every permission must come from the catalog",
  );
});

test("every catalog role can be selected, so the gates can be seen from each side", async () => {
  for (const role of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
    const s = await resolveDevSession({ ...ON, YUCER_DEV_ROLE: role });
    assert.ok(s, `${role} produced no session`);
    assert.deepEqual(s.authz.roles, [role]);
  }
});

test("the entitlement comes from the resolver, not from a literal", async () => {
  // So MOCK_TIER actually moves the entitlement gate. Hardcoding a tier here
  // would make every local page look like enterprise regardless.
  const saved = process.env.MOCK_TIER;
  process.env.MOCK_TIER = "free";
  try {
    const s = await resolveDevSession(ON);
    assert.ok(s);
    assert.equal(s.entitlement.tier, "free");
    assert.equal(s.entitlement.workspace_id, s.workspaceId, "scoped to the same workspace");
  } finally {
    if (saved === undefined) delete process.env.MOCK_TIER;
    else process.env.MOCK_TIER = saved;
  }
});

test("the workspace id is a real uuid shape, because it is the isolation key", async () => {
  // It is written into every seeded row and every gate decision; a placeholder
  // like "dev" would fail at the database boundary in a confusing way.
  const s = await resolveDevSession(ON);
  assert.ok(s);
  assert.match(s.workspaceId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
