import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import type { AuthzContext } from "../../authz/context";
import {
  NAV_ENTRIES,
  defaultLandingHref,
  isFullyLockedOut,
  resolveNavigation,
} from "./navigation";

function ctx(...roles: RoleCode[]): AuthzContext {
  return {
    workspaceId: "ws",
    sub: "usr_1",
    roles,
    permissions: new Set(permissionsForRoles(roles)),
    isWorkspaceOwner: false,
  };
}

function ent(over: Partial<Entitlement> = {}): Entitlement {
  return { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", ...over };
}

test("the nav covers all eight domains, in chain order", () => {
  assert.deepEqual(
    NAV_ENTRIES.map((e) => e.key),
    ["strategy", "planning", "campaign", "account", "signal", "pipeline", "delivery", "copilot"],
  );
});

test("an entitlement gap is advertised, not hidden", () => {
  // A feature nobody can see is a feature nobody buys.
  const nav = resolveNavigation(ctx("sales_leader"), ent({ tier: "free" }));
  const strategy = nav.find((e) => e.key === "strategy");
  assert.equal(strategy?.state, "locked");
  assert.equal(strategy?.decision.reason, "feature_not_in_tier");
  assert.equal(strategy?.decision.requiredTier, "business");
});

test("a permission gap is silent", () => {
  // Teasing someone with a door only their colleague can open is noise they can
  // do nothing about, and it leaks who-can-do-what across the team.
  const nav = resolveNavigation(ctx("delivery_manager"), ent({ tier: "enterprise" }));
  assert.equal(nav.some((e) => e.key === "strategy"), false, "delivery_manager has no strategy.read");
  assert.equal(nav.some((e) => e.key === "delivery"), true);
});

test("the two gaps are never confused with each other", () => {
  // Same member, same workspace: pipeline is bought but not permitted, strategy
  // is permitted but not bought.
  const nav = resolveNavigation(ctx("sales_ops"), ent({ tier: "pro" }));
  const byKey = new Map(nav.map((e) => [e.key, e]));
  assert.equal(byKey.get("planning")?.state, "visible");
  // strategy.plan needs business tier; sales_ops does hold strategy.read.
  assert.equal(byKey.get("strategy")?.state, "locked");
});

test("a free-tier rep sees the core loop and nothing else unlocked", () => {
  const nav = resolveNavigation(ctx("sales_rep"), ent({ tier: "free" }));
  const visible = nav.filter((e) => e.state === "visible").map((e) => e.key);
  assert.deepEqual(visible.sort(), ["account", "copilot", "pipeline"]);
});

test("an enterprise sales leader sees every domain", () => {
  const nav = resolveNavigation(ctx("sales_leader"), ent({ tier: "enterprise" }));
  assert.equal(nav.length, NAV_ENTRIES.length);
  assert.equal(nav.every((e) => e.state === "visible"), true);
});

test("a viewer sees every domain their tier bought, all read-only", () => {
  const nav = resolveNavigation(ctx("viewer"), ent({ tier: "enterprise" }));
  assert.equal(nav.filter((e) => e.state === "visible").length, NAV_ENTRIES.length);
});

test("no tier at all locks everything, and that is detectable", () => {
  const nav = resolveNavigation(ctx("sales_leader"), ent({ tier: null }));
  assert.equal(isFullyLockedOut(nav), true);
  assert.equal(defaultLandingHref(nav), null);
  assert.equal(nav.every((e) => e.decision.reason === "no_product_access"), true);
});

test("bundled-only coverage does not light up the product surface", () => {
  // The ui formula is tier != null; bundled coverage keeps data reachable but
  // is not a product subscription.
  const nav = resolveNavigation(ctx("sales_leader"), ent({ tier: null, bundled: true }));
  assert.equal(isFullyLockedOut(nav), true);
});

test("a member with no roles at all sees nothing rather than an empty shell", () => {
  const nav = resolveNavigation(ctx(), ent({ tier: "enterprise" }));
  assert.deepEqual(nav, [], "every entry is a silent permission gap");
  assert.equal(isFullyLockedOut(nav), true);
});

test("landing goes to the first domain that is actually open", () => {
  const rep = resolveNavigation(ctx("sales_rep"), ent({ tier: "free" }));
  assert.equal(defaultLandingHref(rep), "/account", "account precedes pipeline in chain order");

  const delivery = resolveNavigation(ctx("delivery_manager"), ent({ tier: "starter" }));
  assert.equal(defaultLandingHref(delivery), "/account");
});

test("every nav entry points at a real action and a distinct route", () => {
  assert.equal(new Set(NAV_ENTRIES.map((e) => e.href)).size, NAV_ENTRIES.length);
  assert.equal(new Set(NAV_ENTRIES.map((e) => e.key)).size, NAV_ENTRIES.length);
  for (const e of NAV_ENTRIES) assert.match(e.href, /^\/[a-z]+$/);
});

test("a locked entry carries the tier that would unlock it, so the CTA can be specific", () => {
  const nav = resolveNavigation(ctx("sales_leader"), ent({ tier: "starter" }));
  for (const e of nav.filter((x) => x.state === "locked")) {
    assert.notEqual(e.decision.requiredTier, null, `${e.key} has no upgrade target`);
    assert.equal(e.decision.remedy, "upgrade");
  }
});
