"use client";

import Link from "next/link";
import { ShellSidebarNav } from "@vxture/design-system";
import { ADMIN_NAV_GROUPS } from "../lib/admin-nav";
import type { ResolvedNavEntry } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";

/**
 * 配置管理的左栏.
 *
 * THE DS'S OWN NAV, not a local one. The first version of this file was
 * hand-rolled - group headings and Link rows in Tailwind - and that is exactly
 * what CLAUDE.md forbids: `ShellSidebarNav` (design-system) paired with
 * `ShellSidebarFrame` (design-ui) has shipped this shape all along, with the
 * collapse state machine, the collapsed icon-only mode, per-group open/closed
 * persistence and the tooltips that the hand-rolled version did not have and
 * would have had to grow one by one. The Frame owns width and visibility; the
 * Nav is the content inside it.
 *
 * WHAT THE PRODUCT STILL OWNS: which sections exist and what is in them
 * (admin-nav.ts), and the gate - a refused entry is not rendered at all, the
 * same rule the gear itself follows. Showing a door you cannot open is neither
 * access control nor honesty.
 *
 * PLANNED ITEMS ARE NOT HERE. A `ShellNavItem` is a destination - it carries an
 * href and nothing else - so 部门团队 and 操作审计 live on the plane's home as
 * greyed cards instead. Inventing a disabled nav row the DS deliberately does
 * not have would be the same local build in a smaller disguise.
 */
export function AdminNav({
  nav,
  pathname,
  collapsed,
  onToggleCollapsed,
}: {
  /** The resolved entries, gated - only `visible` ones are drawn. */
  readonly nav: readonly ResolvedNavEntry[];
  readonly pathname: string;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
}) {
  const { ADMIN_GROUP_LABEL, ADMIN_TEXT, DOMAIN_LABEL, SHELL_TEXT } = useMessages();
  const visible = new Map(
    nav.filter((e) => e.state === "visible").map((e) => [e.key, e]),
  );

  const sections = ADMIN_NAV_GROUPS.map((group) => ({
    title: ADMIN_GROUP_LABEL[group.key] ?? group.key,
    items: group.items
      .filter((i) => i.href !== null && visible.has(i.key))
      .map((i) => ({
        href: i.href!,
        label: DOMAIN_LABEL[i.key] ?? i.key,
        icon: i.icon,
      })),
    // 组名就是层级，不再画线：四个分组各自成层，没有要再聚一层的东西。
    brandPosition: "none" as const,
  })).filter((s) => s.items.length > 0);

  /* NO ShellSidebarFrame HERE. ShellViewport already wraps its `sidebar` slot
     in one, and a second frame outside it pinned a width around a component
     that owns its own - which is what put a border and 24px of padding around
     the menu (owner, 2026-09-08). */
  return (
    <ShellSidebarNav
        domainName={ADMIN_TEXT.title}
        sections={sections}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        /* ACTIVE ON THE PREFIX, not on equality: /admin/division/new is still
           市场划分, and a menu that unhighlighted itself the moment you opened
           a form would leave the reader unplaced. */
        isActive={(href) => pathname === href || pathname.startsWith(`${href}/`)}
        storageKeyPrefix="yucer.admin"
        linkComponent={Link}
        labels={{
          expandNav: SHELL_TEXT.expandNav,
          collapseNav: SHELL_TEXT.collapseNav,
          expandAllGroups: SHELL_TEXT.expandAllGroups,
          collapseAllGroups: SHELL_TEXT.collapseAllGroups,
        }}
    />
  );
}
