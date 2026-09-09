import type { NavEntry, NavIcon } from "./navigation";
import type { ActionId } from "../../authz/actions";

/**
 * 配置管理 - the management plane's own menu.
 *
 * A SEPARATE PLANE (owner, 2026-09-08), not a corner of the business one. The
 * gear opens it, and inside it the business board and the copilot deck are
 * gone: a deck pushing today's deals beside a permission matrix is noise, and
 * a reader who came to change how the workspace is set up is not mid-deal.
 *
 * ONE ITEM, ONE CONCERN (owner). This list is what /admin/members used to be
 * on its own: members, roles, permissions and data scope were four questions
 * answered by one table, so "what may a 销售经理 actually do?" had no surface
 * at all while the answer sat in authz/catalog.ts and in the seed. Splitting
 * them is the point of the plane, not a side effect of having a menu.
 *
 * GROUPED, in the shape every admin console of this kind uses: who the
 * organisation is, who may do what, the vocabularies the business runs on, and
 * how it is actually going.
 *
 * WHAT IS DELIBERATELY ABSENT: subscription and tier (owner - that is the
 * platform's, not this product's), and workspace identity, for the same
 * reason: `vx_provision.app_instance` is provisioned by the platform, so an
 * edit page here would be this product writing into someone else's record.
 *
 * PLANNED ITEMS carry no href. They render greyed rather than being omitted -
 * the same call the launcher makes (functional-domains.ts): a greyed row
 * answers "does this product do that" with "yes, not yet", and an absent row
 * answers it with "no".
 */
export interface AdminNavItem {
  /** Key into DOMAIN_LABEL; the display text lives in the message catalog. */
  readonly key: string;
  /** null = planned, not built. */
  readonly href: string | null;
  readonly icon: NavIcon;
  /** The gate. null only where there is no page to gate yet. */
  readonly action: ActionId | null;
}

export interface AdminNavGroup {
  /** Key into ADMIN_GROUP_LABEL. */
  readonly key: string;
  readonly items: readonly AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    // 组织架构 - how the company is laid out, before anyone is placed in it.
    key: "org",
    items: [
      // 部门团队. PLANNED, and not built as a placeholder for its own sake:
      // there is no department entity in this product, and inventing one is a
      // table, an increment, column locks and a mirror - its own decision,
      // not a side effect of drawing a menu (owner, 2026-09-08). What carries
      // the reporting line today is the territory tree plus each member's
      // data scope.
      { key: "orgUnit", href: null, icon: "tree-structure", action: null },
      { key: "division", href: "/admin/division", icon: "map-pin", action: "planning.territory.view" },
    ],
  },
  {
    // 成员权限 - who is in, and what each of them may do.
    key: "access",
    items: [
      { key: "members", href: "/admin/members", icon: "users", action: "admin.member.view" },
      /* 角色管理 and 权限管理 READ the catalogue rather than editing it, and
         that is the honest shape: the 9 roles and their 117 grants are seeded
         DDL (incr/0021), mirrored in authz/catalog.ts, and changing one means
         changing the seed, the mirror and the catalogue doc together. A page
         that offered a checkbox would be lying about what it can do. */
      { key: "roles", href: "/admin/roles", icon: "role", action: "admin.member.view" },
      { key: "permissions", href: "/admin/permissions", icon: "key", action: "admin.member.view" },
      { key: "scope", href: "/admin/scope", icon: "eye", action: "admin.member.view" },
    ],
  },
  {
    // 业务参数 - the vocabularies the business runs on.
    key: "params",
    items: [
      /* ONE ITEM, THREE SECTIONS (owner, 2026-09-08): 产品类型 / 产品状态 /
         计价单位. They are one vocabulary - what a product IS, whether it may
         be sold, and what one of it means - and a seller setting up a
         catalogue sets all three in one sitting. It was reachable only from
         /catalog before, which is how a settings page ends up somewhere
         nobody looks for settings. */
      { key: "product", href: "/admin/product", icon: "cube", action: "catalog.product.view" },
      /* 赢丢原因 (incr/0039). A vocabulary like the product one, and here for
         the same reason: it is set once and read by every review afterwards,
         while 赢丢复盘 is where a person works through the reviews themselves. */
      { key: "winLossReason", href: "/admin/winloss", icon: "clock-counter-clockwise", action: "pipeline.winloss.view" },
      /* 行业分类 (incr/0040). The third vocabulary in this group, and the one
         with the widest reach: it decides how customers are filed, which
         decides the market segment, which decides the playbook. */
      { key: "industry", href: "/admin/industry", icon: "buildings", action: "account.view" },
      /* 预测阈值 (incr/0041) and 账龄分档 (incr/0042). Not vocabularies but
         RULE PARAMETERS - the numbers two rules compute with. They are here
         for the same reason the lists are: set once, read by every screen
         afterwards, and the pages they feed are where somebody works through
         the deals and the money rather than deciding the policy. */
      { key: "forecastThreshold", href: "/admin/forecast", icon: "trend-up", action: "pipeline.forecast.view" },
      { key: "ageingPolicy", href: "/admin/ageing", icon: "clock-counter-clockwise", action: "delivery.revenue.view" },
      /* 计价规则 (incr/0044): the currency every line assumes. Rides the price
         book's read gate; its write is the floor-price permission. */
      { key: "pricingPolicy", href: "/admin/pricing", icon: "scales", action: "catalog.pricebook.view" },
    ],
  },
  {
    // 运行状况 - whether the thing is actually being used, and what was done.
    key: "ops",
    items: [
      { key: "adoption", href: "/admin/adoption", icon: "chart-bar", action: "admin.adoption.view" },
      // 操作审计. PLANNED. The trail exists in the data - agent_action carries
      // the copilot's proposals with decided_by_sub, and four tables are
      // append-only by grant - but nothing reads it back as a record of who
      // decided what.
      { key: "audit", href: null, icon: "clipboard", action: null },
    ],
  },
];

/**
 * The flat, gateable list - what resolveNavigation() takes.
 *
 * DERIVED, never restated. The menu above and the gate below disagreeing about
 * which entries exist is exactly the drift this repo has already paid for once
 * (a nav pointing at five routes that did not exist).
 */
export const ADMIN_NAV_ENTRIES: readonly NavEntry[] = ADMIN_NAV_GROUPS.flatMap((g) =>
  g.items
    .filter((i): i is AdminNavItem & { href: string; action: ActionId } =>
      i.href !== null && i.action !== null)
    .map((i) => ({ key: i.key, href: i.href, icon: i.icon, action: i.action })),
);
