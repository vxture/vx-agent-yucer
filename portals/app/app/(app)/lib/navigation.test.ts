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
  MODULE_NAV_ENTRIES,
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
  /* 配置管理 BECAME A PLANE on 2026-09-08 (owner), and this list is what that
     cost: the single "admin" entry was four questions answered by one table -
     who is in, what role they hold, what a role means, and what they may see -
     so it is four entries now, and the two configuration surfaces that were
     hiding in business modules (市场划分, 产品配置) joined them.

     THE ORDER IS THE MENU'S, group by group (admin-nav.ts), because this list
     is derived from it rather than restated. A key that appears here without
     appearing there is impossible by construction; a key that appears in
     neither is the drift this test is watching for. */
  assert.deepEqual(
    ADMIN_NAV_ENTRIES.map((e) => e.key),
    // 赢丢原因 joined 业务参数 on 2026-09-08 (incr/0039): the reasons a
    // review may choose from are the workspace's own list, and configuring
    // them is not the same act as working through the reviews.
    // 行业分类 joined it the same way (incr/0040): what customers are filed
    // under is the workspace's own list, and deciding it is not the same act
    // as working through the customers.
    // 预测阈值 and 账龄分档 joined 业务参数 on 2026-09-08 (incr/0041, 0042).
    // They are rule PARAMETERS rather than vocabularies, which is a difference
    // in what they hold and not in where they belong.
    // 待迁路由 joined 运行状况 on 2026-09-11 (incr/0055's own change): a
    // holding page for whatever route currently has no entry point anywhere
    // else, found by an app-wide reachability sweep.
    ["orgUnit", "division", "members", "roles", "permissions", "scope", "product", "winLossReason", "industry",
     "forecastThreshold", "ageingPolicy", "pricingPolicy", "adoption", "pendingMigration"],
  );
  // The identity that keeps the four lists from silently overlapping. It gained
  // MODULE_NAV_ENTRIES on 2026-08-30: six module pages promoted out of
  // sections, kept OUT of DOMAIN_NAV_ENTRIES so the nine-partition assertion
  // above stays an assertion about the product rather than being widened to
  // make room. A new entry that forgets to join a sublist fails here.
  assert.equal(
    NAV_ENTRIES.length,
    WORK_NAV_ENTRIES.length +
      DOMAIN_NAV_ENTRIES.length +
      MODULE_NAV_ENTRIES.length +
      ADMIN_NAV_ENTRIES.length,
  );
  // And none of the six is a capability partition, which is the whole reason
  // they live in their own list.
  for (const m of MODULE_NAV_ENTRIES) {
    assert.equal(
      DOMAIN_NAV_ENTRIES.some((d) => d.key === m.key),
      false,
      `${m.key} is a module page, not a partition`,
    );
  }
});

test("the work entries are not domains either, and the copilot stays a domain", () => {
  // The copilot moved in the SHELL - it is grouped with the work rather than
  // listed ninth in a flat menu - but it is still D8 (ADR-001). Demoting it out
  // of the domain inventory to express a layout decision would make the
  // eight-domain assertion above a statement about a sidebar.
  /* 2026-09-07: `national` joins the work entries, and the point of this
     assertion is unchanged - it is here to stop anything sliding into the
     DOMAIN inventory. The situation screen owns no object; it is a way of
     looking at what the domains already hold, which is exactly why it belongs
     on this list and not on that one. */
  assert.deepEqual(
    WORK_NAV_ENTRIES.map((e) => e.key),
    ["home", "national"],
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
  // solution and pricebook joined on 2026-08-30 for exactly the same reason as
  // catalog: they were sections of it, they carry its actions, and those
  // actions carry no feature key. Promoting a section to a page must not
  // change who can see it - if it did, the promotion would have moved a gate.
  // attainment joined on 2026-08-31 riding pipeline.view, which is free tier.
  // It shows what a member's OWN visible deals add up to against the period,
  // and each of its three readings is independently gated - the attainment
  // half comes from planning and degrades to "no target" when that gate
  // refuses. So there is no paid capability being handed out here; the page is
  // the arithmetic of what the reader can already see.
  assert.deepEqual(visible.sort(), [
    "account",
    "attainment",
    "catalog",
    "copilot",
    "home",
    /* 行业分类 rides account.view, exactly as the customer list does - it is
       the list customers are filed under, and its ACTIONS carry
       account.upsert. Present at every tier because account.view is, and
       absent only on a permission gap. */
    "industry",
    // /named rides account.view: the roster is a filtered account list, so
    // whoever may read accounts may read which of them are named. The TIER is
    // written under account.upsert on the detail page.
    "namedAccount",
    // 全国态势屏 rides account.view like /home does, and for the same reason as
    // /attainment: it is the arithmetic of rows the reader can already see. It
    // hands out no paid capability - the page itself additionally requires
    // pipeline and delivery, and refuses outright if either is missing.
    "national",
    "pipeline",
    "pricebook",
    /* 计价规则 rides catalog.pricebook.view - no feature key, catalog.read -
       so it is on every tier, exactly as /pricebook is. */
    "pricingPolicy",
    /* 产品配置 rides catalog.product.view, exactly as /catalog does - it edits
       the same three vocabularies the catalogue displays, and its ACTIONS
       carry catalog.product.upsert. It appears at every tier for the same
       reason the catalogue does: those actions carry no feature key. A reader
       who may not edit lands on it and is redirected, which is the courtesy
       gate /catalog/settings already had. */
    "product",
    // /quote rides pipeline.view: a quote is the current state of a deal's
    // lines, so whoever may read the deal may read what it offers. It appears
    // wherever /pipeline does, on every tier.
    "quote",
    "solution",
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
  // Every DOMAIN and every MODULE PAGE: the six promoted on 2026-08-30 all
  // carry a *.view action a viewer holds, so an enterprise viewer reaches
  // them. That is the promotion behaving - a page that appeared but could not
  // be opened would mean the split had invented a gate.
  /* PLUS TWO ITEMS OF 配置管理, and the +2 is the point rather than an
     adjustment to make the number fit. Both are gated on actions a viewer
     holds - 市场划分 on planning.territory.view, 产品配置 on
     catalog.product.view - so a viewer who opens the gear finds those two and
     nothing else: the four 成员权限 items need admin.member.view, which a
     viewer does not hold. Reading is deliberate on both: the carve explains
     every figure grouped by 大区, and the product vocabulary explains every
     line on a quote. Editing either needs an upsert action they lack. */
  // 赢丢原因 rides pipeline.winloss.view, which a viewer holds - so the gear
  // shows a viewer three read-only items now, not two.
  const inPlane = ["division", "product", "winLossReason", "industry",
    // A viewer holds pipeline.read and delivery.read, so both parameter pages
    // are readable; writing them needs permissions a viewer does not hold, and
    // the panels render without their save button.
    "forecastThreshold", "ageingPolicy",
    // 计价规则 rides catalog.read, which every role holds.
    "pricingPolicy"];
  assert.equal(
    nav.filter((e) => e.state === "visible").length,
    DOMAIN_NAV_ENTRIES.length + MODULE_NAV_ENTRIES.length + WORK_NAV_ENTRIES.length
      + inPlane.length,
  );
  for (const key of inPlane) {
    assert.equal(nav.some((e) => e.key === key && e.state === "visible"), true, key);
  }
  assert.equal(
    nav.some((e) => e.key === "members"),
    false,
    "成员管理 needs admin.member.view, which a viewer does not hold",
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
  assert.equal(admin.find((e) => e.key === "members")?.state, "locked");
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
      nav.find((e) => e.key === "members")?.state,
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
