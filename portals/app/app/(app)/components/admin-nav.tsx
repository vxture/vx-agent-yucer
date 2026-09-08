"use client";

import Link from "next/link";
import { Icon, StatusBadge } from "@vxture/design-ui";
import { ADMIN_NAV_GROUPS } from "../lib/admin-nav";
import type { ResolvedNavEntry } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";

/**
 * 配置管理的左栏 - the management plane's own menu.
 *
 * NOT THE BOARD. The business pane answers "how is this domain doing" with a
 * figure per module; configuration has no such figure - a permission matrix
 * does not have a number that goes up - so this pane is a menu and says so by
 * being one. It replaces the board inside the plane rather than sitting
 * beside it: two navigations on one screen is two answers to "where am I".
 *
 * GROUPED, and the groups are the plane's structure rather than decoration -
 * see admin-nav.ts for why these four and what is deliberately not here.
 *
 * A PLANNED ITEM RENDERS, greyed and unclickable. The launcher already made
 * this call: an absent row answers "does this product do that" with "no",
 * which is a different and wrong answer.
 *
 * A REFUSED ITEM DOES NOT RENDER AT ALL. Same rule the gear itself follows:
 * showing a door you cannot open is neither access control nor honesty.
 */
export function AdminNav({
  nav,
  pathname,
}: {
  /** The resolved entries, gated - only `visible` ones are drawn. */
  readonly nav: readonly ResolvedNavEntry[];
  readonly pathname: string;
}) {
  const { ADMIN_GROUP_LABEL, ADMIN_TEXT, DOMAIN_LABEL } = useMessages();
  const visible = new Map(
    nav.filter((e) => e.state === "visible").map((e) => [e.key, e]),
  );

  return (
    <nav className="gap-lg flex flex-col" aria-label={ADMIN_TEXT.title}>
      {ADMIN_NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => i.href === null || visible.has(i.key));
        if (items.length === 0) return null;
        return (
          <div className="gap-2xs flex flex-col" key={group.key}>
            <p className="text-muted-foreground text-body-sm px-sm font-medium tracking-wide">
              {ADMIN_GROUP_LABEL[group.key] ?? group.key}
            </p>
            {items.map((item) => {
              const label = DOMAIN_LABEL[item.key] ?? item.key;
              if (item.href === null) {
                return (
                  <span
                    className="gap-sm text-muted-foreground px-sm py-2xs flex items-center rounded-sm"
                    key={item.key}
                  >
                    <Icon name={item.icon} size="xs" />
                    <span className="text-body-sm grow">{label}</span>
                    {/* Says WHY it cannot be opened. A greyed row with no
                        reason reads as broken rather than as unbuilt. */}
                    <StatusBadge tone="neutral">{ADMIN_TEXT.planned}</StatusBadge>
                  </span>
                );
              }
              /* ACTIVE ON THE PREFIX, not on equality: /admin/division/new is
                 still 区域划分, and a menu that unhighlighted itself the
                 moment you opened a form would leave the reader unplaced. */
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  className={`gap-sm px-sm py-2xs flex items-center rounded-sm no-underline ${
                    active ? "bg-muted text-foreground font-medium" : "text-foreground hover:bg-muted"
                  }`}
                  href={item.href}
                  key={item.key}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon name={item.icon} size="xs" />
                  <span className="text-body-sm">{label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
