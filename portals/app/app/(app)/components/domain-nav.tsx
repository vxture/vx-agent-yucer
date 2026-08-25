"use client";

import Link from "next/link";
import {
  Button,
  Icon,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vxture/design-ui";
import type { ResolvedNavEntry } from "../lib/navigation";
import { DOMAIN_LABEL, NAV_TEXT } from "../lib/messages";

// The eight-domain navigation.
//
// A locked entry is rendered but not navigable, and it says which tier would
// open it. That is the whole reason locked entries exist at all: the entitlement
// gap is the one gap worth advertising, and an upgrade prompt that cannot name
// its target is not a prompt.
//
// Permission gaps never reach this component - resolveNavigation drops them
// before rendering.

export interface DomainNavProps {
  readonly entries: readonly ResolvedNavEntry[];
  readonly activeKey?: string;
  /** Built by the caller from subscribeUrl(); this component never constructs
   * a conversion link itself. */
  readonly upgradeHref?: string;
}

export function DomainNav({ entries, activeKey, upgradeHref }: DomainNavProps) {
  return (
    <nav aria-label={NAV_TEXT.ariaLabel}>
      <ul>
        {entries.map((entry) =>
          entry.state === "visible" ? (
            <li key={entry.key}>
              <Button
                asChild
                variant={entry.key === activeKey ? "secondary" : "ghost"}
                aria-current={entry.key === activeKey ? "page" : undefined}
              >
                <Link href={entry.href}>
                  <Icon name={entry.icon} />
                  {DOMAIN_LABEL[entry.key] ?? entry.key}
                </Link>
              </Button>
            </li>
          ) : (
            <li key={entry.key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="ghost" disabled aria-disabled="true">
                      <Icon name={entry.icon} />
                      {DOMAIN_LABEL[entry.key] ?? entry.key}
                      <StatusBadge tone="neutral">
                        {entry.decision.requiredTier ?? "-"}
                      </StatusBadge>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {entry.decision.requiredTier
                    ? NAV_TEXT.requiresTier(entry.decision.requiredTier)
                    : NAV_TEXT.notSubscribed}
                </TooltipContent>
              </Tooltip>
            </li>
          ),
        )}
      </ul>

      {upgradeHref && entries.some((e) => e.state === "locked") ? (
        <Button asChild variant="outline">
          {/* The single conversion exit, and only ever on an explicit click -
              never an automatic redirect. */}
          <a href={upgradeHref}>{NAV_TEXT.upgradeCta}</a>
        </Button>
      ) : null}
    </nav>
  );
}
