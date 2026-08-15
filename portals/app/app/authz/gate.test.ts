import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../entitlement/types";
import { entitlementGate, permissionGate, authorize, autopilotAuthorized } from "./gate";
import { ROLE_PERMISSIONS, permissionsForRoles, type PermCode } from "./catalog";

function ent(over: Partial<Entitlement> = {}): Entitlement {
  return { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", ...over };
}

const held = (...roles: Parameters<typeof permissionsForRoles>[0]) => permissionsForRoles(roles);

// --- Gate 1: entitlement ----------------------------------------------------

test("ui surface needs a tier; bundled-only coverage does not open it", () => {
  assert.equal(entitlementGate(ent({ tier: null }), { surface: "ui" }).reason, "no_product_access");
  assert.equal(
    entitlementGate(ent({ tier: null, bundled: true }), { surface: "ui" }).reason,
    "no_product_access",
  );
  assert.equal(entitlementGate(ent({ tier: "free" }), { surface: "ui" }).allowed, true);
});

test("data surface accepts bundled coverage without a tier", () => {
  assert.equal(entitlementGate(ent({ tier: null }), { surface: "data" }).reason, "no_data_access");
  assert.equal(
    entitlementGate(ent({ tier: null, bundled: true }), { surface: "data" }).allowed,
    true,
  );
});

test("a feature key is checked against the tier once coverage passes", () => {
  const pro = ent({ tier: "pro" });
  assert.equal(entitlementGate(pro, { surface: "ui", feature: "pipeline.forecast" }).allowed, true);
  const denied = entitlementGate(pro, { surface: "ui", feature: "strategy.plan" });
  assert.equal(denied.reason, "feature_not_in_tier");
  assert.equal(denied.requiredTier, "business");
  assert.equal(denied.remedy, "upgrade");
});

test("bundled-only coverage can never satisfy a feature key", () => {
  // There is no tier to read the matrix from. Denying is the conservative
  // direction; inventing "bundled means free tier" would be the product
  // re-deriving a commercial decision.
  const d = entitlementGate(ent({ tier: null, bundled: true }), {
    surface: "data",
    feature: "account.manage",
  });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "feature_not_in_tier");
  assert.equal(d.requiredTier, "free");
});

test("a baseline action with no feature key passes on coverage alone", () => {
  assert.equal(entitlementGate(ent({ tier: "free" }), { surface: "ui", feature: null }).allowed, true);
  assert.equal(entitlementGate(ent({ tier: null }), { surface: "ui", feature: null }).allowed, false);
});

// --- Gate 2: permission -----------------------------------------------------

test("permissionGate checks membership in the held set", () => {
  const perms = held("sales_rep");
  assert.equal(permissionGate(perms, "pipeline.write").allowed, true);
  const denied = permissionGate(perms, "pipeline.forecast");
  assert.equal(denied.reason, "permission_denied");
  assert.equal(denied.requiredPerm, "pipeline.forecast");
  assert.equal(denied.remedy, "request_access");
  assert.equal(denied.requiredTier, null, "a permission denial must never suggest an upgrade");
});

test("a null required permission passes", () => {
  assert.equal(permissionGate([], null).allowed, true);
});

test("permissionGate accepts a Set as well as an array", () => {
  const s = new Set<PermCode>(["account.read"]);
  assert.equal(permissionGate(s, "account.read").allowed, true);
  assert.equal(permissionGate(s, "account.write").allowed, false);
});

// --- Composition ------------------------------------------------------------

test("both gates must pass", () => {
  const ok = authorize({
    entitlement: ent({ tier: "pro" }),
    surface: "data",
    feature: "pipeline.forecast",
    permission: "pipeline.forecast",
    held: held("sales_ops"),
  });
  assert.equal(ok.allowed, true);
});

test("entitlement is evaluated FIRST - a double failure reports the entitlement one", () => {
  // sales_rep has neither the pro tier nor pipeline.forecast. The denial must
  // not leak that a permission would have been needed for a feature the
  // workspace never bought.
  const d = authorize({
    entitlement: ent({ tier: "free" }),
    surface: "ui",
    feature: "pipeline.forecast",
    permission: "pipeline.forecast",
    held: held("sales_rep"),
  });
  assert.equal(d.reason, "feature_not_in_tier");
  assert.equal(d.requiredPerm, null);
});

test("entitlement alone is not enough - the classic bug this exists to prevent", () => {
  // Enterprise tier includes copilot.autopilot, but a viewer must still not
  // turn it on. This is the exact case the spec calls out by name.
  const d = authorize({
    entitlement: ent({ tier: "enterprise" }),
    surface: "data",
    feature: "copilot.autopilot",
    permission: "copilot.autopilot",
    held: held("viewer"),
  });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "permission_denied");
});

test("permission alone is not enough either", () => {
  // sales_leader holds every permission, but a free-tier workspace has not
  // bought forecasting.
  const d = authorize({
    entitlement: ent({ tier: "free" }),
    surface: "ui",
    feature: "pipeline.forecast",
    permission: "pipeline.forecast",
    held: held("sales_leader"),
  });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "feature_not_in_tier");
});

test("a denial carries exactly one remedy", () => {
  const cases = [
    authorize({ entitlement: ent({ tier: null }), surface: "ui", held: [] }),
    authorize({
      entitlement: ent({ tier: "free" }),
      surface: "ui",
      feature: "strategy.plan",
      held: [],
    }),
    authorize({
      entitlement: ent({ tier: "free" }),
      surface: "ui",
      permission: "account.write",
      held: held("viewer"),
    }),
  ];
  for (const d of cases) {
    assert.equal(d.allowed, false);
    const suggestsUpgrade = d.remedy === "upgrade";
    assert.equal(suggestsUpgrade, d.requiredPerm == null);
  }
});

// --- Autopilot: the one place the human-machine boundary can move -----------

test("autopilot needs entitlement AND permission AND the workspace opt-in", () => {
  const enterprise = ent({ tier: "enterprise" });
  const leader = held("sales_leader");

  assert.equal(
    autopilotAuthorized({ entitlement: enterprise, held: leader, workspaceOptIn: true }).allowed,
    true,
  );

  // Bought and permitted, but never switched on.
  const off = autopilotAuthorized({ entitlement: enterprise, held: leader, workspaceOptIn: false });
  assert.equal(off.allowed, false);
  assert.equal(off.remedy, "none", "a switch that is off is neither an upgrade nor an access request");

  // Permitted and switched on, but the tier does not include it.
  assert.equal(
    autopilotAuthorized({ entitlement: ent({ tier: "business" }), held: leader, workspaceOptIn: true })
      .reason,
    "feature_not_in_tier",
  );

  // Bought and switched on, but this member may not authorize it.
  assert.equal(
    autopilotAuthorized({ entitlement: enterprise, held: held("sales_ops"), workspaceOptIn: true })
      .reason,
    "permission_denied",
  );
});

test("only sales_leader can pass the autopilot permission gate", () => {
  const enterprise = ent({ tier: "enterprise" });
  for (const role of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
    const allowed = autopilotAuthorized({
      entitlement: enterprise,
      held: held(role),
      workspaceOptIn: true,
    }).allowed;
    assert.equal(allowed, role === "sales_leader", `${role} autopilot expectation`);
  }
});

test("autopilot is checked on the data surface, so it survives bundled-only coverage rules", () => {
  // It is a write path, not a rendered surface. Bundled-only still fails on the
  // feature key, but it must fail there and not on the access formula.
  const d = autopilotAuthorized({
    entitlement: ent({ tier: null, bundled: true }),
    held: held("sales_leader"),
    workspaceOptIn: true,
  });
  assert.equal(d.reason, "feature_not_in_tier");
});
