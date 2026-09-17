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
      // 组织结构 (incr/0051; owner, 2026-09-10). It was PLANNED here for two
      // days, for the reason the comment gave: a department entity is a
      // table, an increment, column locks and a mirror - its own decision.
      // The owner made it: fully customisable, three shipped templates, the
      // middle one (总部-大区-团队) default. Read behind admin.member.view -
      // the organisation is what the member list is organised by.
      { key: "orgUnit", href: "/admin/org", icon: "tree-structure", action: "admin.member.view" },
      { key: "division", href: "/admin/division", icon: "map-pin", action: "planning.territory.view" },
    ],
  },
  {
    // 成员权限 - who is in, and what each of them may do.
    key: "access",
    items: [
      { key: "members", href: "/admin/members", icon: "users", action: "admin.member.view" },
      /* 角色管理 and 权限策略 READ the catalogue rather than editing it, and
         that is the honest shape: the 9 roles and their 117 grants are seeded
         DDL (incr/0021), mirrored in authz/catalog.ts, and changing one means
         changing the seed, the mirror and the catalogue doc together. A page
         that offered a checkbox would be lying about what it can do. */
      // icon: "user-circle", not "role" - TD-027 (docs/60-operations/00-index.md):
      // the DS's own icon table has `role` pointing at the same UsersIcon as
      // `users`, so 组织管理 and 角色管理 drew the identical glyph under two
      // different names. Revert to "role" once the DS gives it a real one.
      { key: "roles", href: "/admin/roles", icon: "user-circle", action: "admin.member.view" },
      { key: "permissions", href: "/admin/permissions", icon: "key", action: "admin.member.view" },
      { key: "scope", href: "/admin/scope", icon: "eye", action: "admin.member.view" },
    ],
  },
  {
    // 业务参数 - the vocabularies the business runs on.
    key: "params",
    items: [
      /* 商机配置 (PR4 of the 商机配置 batch): six items folded into one -
         赢丢原因 (incr/0039), 商机阶段 (incr/0057-0059), 商机类型
         (incr/0060-0061), 预测阈值 (incr/0041), 计价规则 (incr/0044) and
         账龄分档 (incr/0042) each used to be (or, for the first three, briefly
         were, one PR at a time) their own item here. All six are the same
         kind of thing - set once, read by every screen that shows or advances
         a deal - so they join /admin/product's own precedent (三个 section
         已经堆叠在一页) rather than staying six gear icons nobody who is
         setting up a workspace goes looking for one at a time.
         FIRST in the group (owner, 2026-09-14): the busiest of the four. */
      { key: "opportunityConfig", href: "/admin/opportunity", icon: "kanban", action: "pipeline.opportunityconfig.view" },
      /* ONE ITEM, THREE SECTIONS (owner, 2026-09-08): 产品类型 / 产品状态 /
         计价单位. They are one vocabulary - what a product IS, whether it may
         be sold, and what one of it means - and a seller setting up a
         catalogue sets all three in one sitting. It was reachable only from
         /catalog before, which is how a settings page ends up somewhere
         nobody looks for settings. */
      { key: "product", href: "/admin/product", icon: "cube", action: "catalog.product.view" },
      /* 客户分类 (incr/0040, grown to four vocabularies by incr/0071-0072; renamed
         from 行业分类, owner 2026-09-16). 行业/客户类型/客户规模/客户性质 all
         answer the same question - how is a customer filed - which is a D4
         concern rather than a D6 one, and belongs beside the customer list it
         governs rather than the pipeline it does not. Same reasoning that kept
         行业分类 its own item before the other three joined it: bundling is
         right, a second nav entry would fragment four vocabularies that are
         the same kind of fact about the same object. Route unchanged
         (`/admin/industry`) - the label renamed, not the address. */
      { key: "industry", href: "/admin/industry", icon: "buildings", action: "account.view" },
      /* 提醒阈值 (incr/0065-0066). Found by the same systematic pass that
         unified /admin/opportunity: QUIET_DAYS/STALE_DAYS (judgement.ts) and
         CHAIN_WARM_DAYS (account/lib/health.ts) and RENEWAL_WINDOW_DAYS
         (delivery/lib/renewal.ts) were all still build constants with the
         same "a workspace may legitimately disagree" shape as stallDays had
         before incr/0041. NOT folded into opportunityConfig above - these
         three cross account/delivery/the home feed, none of which is
         "opportunity", so a dedicated item keeps both pages' names honest. */
      { key: "reminderThreshold", href: "/admin/reminder", icon: "bell", action: "admin.reminderthreshold.view" },
      // 待迁路由 (owner, 2026-09-11: 盘点所有未在页面体现的路由，做一个临时
      // 域，先挂到里面 - 标记：待迁移) - not a 6th functional domain (that
      // count is test-locked at 5), just a holding page under admin's own
      // menu for whatever page currently has no entry point anywhere else.
      // Gated the same as the plainest admin reads (admin.member.view) - it
      // names no sensitive data, only which routes exist. RELOCATED here
      // (owner, 2026-09-17) from the now-deleted 运行状况 group: 使用分析,
      // that group's other occupant, was rejected outright ("这些是分析吗，
      // 这是统计一下，页面到处都有，还要专门分析") and deleted rather than
      // reworked a third time - see 赋能分析, the (screen) page that replaced
      // its per-user AI-usage question. 待迁路由 is unrelated to either and
      // still points at a real route, so it moved rather than being dropped;
      // 业务参数 is the last remaining general group, a reasonable resting
      // place for an otherwise homeless page.
      { key: "pendingMigration", href: "/admin/migration", icon: "archive", action: "admin.member.view" },
    ],
  },
  {
    // 高级管理 (owner, 2026-09-17: merged from two separate groups into one).
    // Both items answer "is something wrong, and where do I check" rather
    // than day-to-day setup, which is why they are last and together:
    //
    // 安全审计 - configuration changes only, never business data ("记录对配置
    // 的操作。不涉及业务操作...系统被改了，要知道谁改的，什么时间，改了
    // 什么"). Replaces the old placeholder 操作审计 entry (href: null) with a
    // real, browsable, filtered log - see components/audit-roster.tsx and
    // admin/audit/page.tsx.
    //
    // 系统验证 - is our own end of the platform connection actually working
    // (C1/C2/C3), not "who changed what". Built as named sections
    // (diagnostics-panel.tsx) with one today (平台对接), so a second kind of
    // system verification joins as a new SECTION on that page, not a new
    // group here.
    key: "advanced",
    items: [
      { key: "audit", href: "/admin/audit", icon: "clipboard", action: "admin.audit.view" },
      { key: "diagnostics", href: "/admin/diagnostics", icon: "plugs-connected", action: "admin.diagnostics.view" },
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
