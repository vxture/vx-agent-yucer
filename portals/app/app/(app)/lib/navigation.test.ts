import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import type { AuthzContext } from "../../authz/context";
import {
  ADMIN_NAV_ENTRIES,
  DOMAIN_NAV_ENTRIES,
  WORK_NAV_ENTRIES,
  NAV_ENTRIES,
  defaultLandingHref,
  isFullyLockedOut,
  lockoutReason,
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
  return {
    ...EMPTY_ENTITLEMENT,
    workspace_id: "ws",
    product: "yucer",
    ...over,
  };
}

test("the nav covers all nine partitions, in chain order", () => {
  assert.deepEqual(
    DOMAIN_NAV_ENTRIES.map((e) => e.key),
    [
      "strategy",
      "planning",
      "campaign",
      "account",
      "signal",
      "pipeline",
      "delivery",
      "copilot",
      // D9, appended rather than slotted into the chain: the catalogue is not a
      // step in the sales motion, it is the dimension every step reads.
      "catalog",
    ],
  );
});

test("administration is nav, but it is not a capability domain", () => {
  // Kept in its own list so the eight-domain invariant above stays an assertion
  // about the product rather than degrading into "nine things, one of which is
  // not a domain". Adoption belongs here for the same reason: it is a statement
  // about whether the product is used, which is not a capability the product
  // sells.
  assert.deepEqual(
    ADMIN_NAV_ENTRIES.map((e) => e.key),
    ["admin", "adoption"],
  );
  assert.equal(
    NAV_ENTRIES.length,
    WORK_NAV_ENTRIES.length +
      DOMAIN_NAV_ENTRIES.length +
      ADMIN_NAV_ENTRIES.length,
  );
});

test("the work entries are not domains either, and the copilot stays a domain", () => {
  // The copilot moved in the SHELL - it is grouped with the work rather than
  // listed ninth in a flat menu - but it is still D8 (ADR-001). Demoting it out
  // of the domain inventory to express a layout decision would make the
  // eight-domain assertion above a statement about a sidebar.
  assert.deepEqual(
    WORK_NAV_ENTRIES.map((e) => e.key),
    ["home"],
  );
  assert.ok(DOMAIN_NAV_ENTRIES.some((e) => e.key === "copilot"));
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
  const nav = resolveNavigation(
    ctx("delivery_manager"),
    ent({ tier: "enterprise" }),
  );
  assert.equal(
    nav.some((e) => e.key === "strategy"),
    false,
    "delivery_manager has no strategy.read",
  );
  assert.equal(
    nav.some((e) => e.key === "delivery"),
    true,
  );
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
  // home rides account.view, so a rep who can read accounts can read the
  // judgements drawn from them - and a rep who cannot has nothing to land on.
  // The catalogue joins the free tier because it carries NO FEATURE KEY at all
  // (ADR-017) - not because free buys it. A workspace that has bought anything
  // needs to know what it sells, so this entry is present at every tier and
  // absent only on a permission gap.
  assert.deepEqual(visible.sort(), [
    "account",
    "catalog",
    "copilot",
    "home",
    "pipeline",
  ]);
});

test("an enterprise sales leader sees every domain", () => {
  const nav = resolveNavigation(
    ctx("sales_leader"),
    ent({ tier: "enterprise" }),
  );
  assert.equal(nav.length, NAV_ENTRIES.length);
  assert.equal(
    nav.every((e) => e.state === "visible"),
    true,
  );
});

test("a viewer sees every domain their tier bought, all read-only", () => {
  const nav = resolveNavigation(ctx("viewer"), ent({ tier: "enterprise" }));
  // Every DOMAIN, not every entry: a viewer holds no admin.manage, so the
  // administration entry is a silent permission gap for them.
  assert.equal(
    nav.filter((e) => e.state === "visible").length,
    DOMAIN_NAV_ENTRIES.length + WORK_NAV_ENTRIES.length,
  );
  assert.equal(
    nav.some((e) => e.key === "admin"),
    false,
  );
});

test("no tier at all locks everything, and that is detectable", () => {
  const nav = resolveNavigation(ctx("sales_leader"), ent({ tier: null }));
  assert.equal(isFullyLockedOut(nav), true);
  assert.equal(defaultLandingHref(nav), null);
  assert.equal(
    nav.every((e) => e.decision.reason === "no_product_access"),
    true,
  );
});

test("bundled-only coverage does not light up the product surface", () => {
  // The ui formula is tier != null; bundled coverage keeps data reachable but
  // is not a product subscription.
  const nav = resolveNavigation(
    ctx("sales_leader"),
    ent({ tier: null, bundled: true }),
  );
  assert.equal(isFullyLockedOut(nav), true);
});

test("a member with no roles at all sees nothing rather than an empty shell", () => {
  const nav = resolveNavigation(ctx(), ent({ tier: "enterprise" }));
  assert.deepEqual(nav, [], "every entry is a silent permission gap");
  assert.equal(isFullyLockedOut(nav), true);
});

test("a roleless member is not told to go and subscribe", () => {
  // The workspace has already paid. Offering a checkout page to someone whose
  // problem is a missing role sends them somewhere that cannot help, and the
  // remedy they need - an administrator - is never named.
  const nav = resolveNavigation(ctx(), ent({ tier: "enterprise" }));
  assert.equal(lockoutReason(nav), "no_roles");
});

test("an unsubscribed workspace still gets the subscribe remedy", () => {
  // Including for an administrator: admin.member.view carries feature: null, so
  // no individual feature locks it, but base product access still does. Without
  // that, an admin of an unpaid workspace would land in a shell containing only
  // the members screen and never see the conversion exit.
  const admin = resolveNavigation(ctx("sales_leader"), ent({ tier: null }));
  assert.equal(lockoutReason(admin), "no_entitlement");
  assert.equal(admin.find((e) => e.key === "admin")?.state, "locked");
});

test("both gaps at once is an entitlement problem first", () => {
  // The gates are ordered, so a member with neither is told about the tier.
  // Fixing roles first would leave them exactly as locked out.
  const nav = resolveNavigation(ctx(), ent({ tier: null }));
  assert.equal(lockoutReason(nav), "no_entitlement");
});

test("nothing is reported as a lockout while anything is reachable", () => {
  const nav = resolveNavigation(ctx("sales_rep"), ent({ tier: "free" }));
  assert.equal(lockoutReason(nav), null);
});

test("an administrator of a paid workspace can always reach the members screen", () => {
  // The recovery path. If this entry were ever gated on a feature, a workspace
  // could reach a state with no way to grant anyone a role.
  for (const tier of [
    "free",
    "starter",
    "pro",
    "business",
    "enterprise",
  ] as const) {
    const nav = resolveNavigation(ctx("sales_ops"), ent({ tier }));
    assert.equal(
      nav.find((e) => e.key === "admin")?.state,
      "visible",
      `administration is not reachable at ${tier}`,
    );
  }
});

test("landing goes to the judgement stream, not to a list", () => {
  // It used to be "the first open domain in chain order", which meant everyone
  // arrived at a directory of their own customers - a screen that answers a
  // question they did not ask. Home is first in NAV_ENTRIES now, so both of
  // these land there.
  const rep = resolveNavigation(ctx("sales_rep"), ent({ tier: "free" }));
  assert.equal(defaultLandingHref(rep), "/");

  const delivery = resolveNavigation(
    ctx("delivery_manager"),
    ent({ tier: "starter" }),
  );
  assert.equal(defaultLandingHref(delivery), "/");
});

test("a member who cannot read accounts lands somewhere they can read", () => {
  // home is gated on account.view. Without it there is nothing to land on, and
  // the fallback must still be a real destination rather than a dead href.
  const pm = resolveNavigation(
    ctx("delivery_manager"),
    ent({ tier: "enterprise" }),
  );
  const href = defaultLandingHref(pm);
  assert.ok(href, "somewhere");
  assert.ok(pm.some((e) => e.href === href && e.state === "visible"));
});

test("every nav entry points at a real action and a distinct route", () => {
  assert.equal(
    new Set(NAV_ENTRIES.map((e) => e.href)).size,
    NAV_ENTRIES.length,
  );
  assert.equal(new Set(NAV_ENTRIES.map((e) => e.key)).size, NAV_ENTRIES.length);
  // Lowercase path segments; more than one is allowed (/admin/members).
  // Lowercase segments, or the root itself - home is "/" and that is a real
  // destination rather than a missing path.
  for (const e of NAV_ENTRIES) assert.match(e.href, /^\/$|^(\/[a-z]+)+$/);
});

test("a locked entry carries the tier that would unlock it, so the CTA can be specific", () => {
  const nav = resolveNavigation(ctx("sales_leader"), ent({ tier: "starter" }));
  for (const e of nav.filter((x) => x.state === "locked")) {
    assert.notEqual(
      e.decision.requiredTier,
      null,
      `${e.key} has no upgrade target`,
    );
    assert.equal(e.decision.remedy, "upgrade");
  }
});
