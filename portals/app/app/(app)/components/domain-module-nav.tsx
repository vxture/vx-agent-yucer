"use client";

import Link from "next/link";
import { Button, Icon } from "@vxture/design-ui";
import { domainOf } from "../lib/functional-domains";
import type { ResolvedNavEntry } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";

// The second-level nav: the modules of the domain you are standing in.
//
// WHY IT EXISTS. The launcher answers "where can I go" once, and then closes.
// Without this strip, arriving at a module tells you nothing about what else
// is beside it - /signal and /campaign are two rows of the same domain in the
// panel and two unrelated pages once you are on them. The strip is what makes
// "being inside a domain" a state the interface actually has, rather than a
// grouping that only exists in a popover.
//
// It is also the answer to how a module click can both "enter the domain" and
// "open the module": there is no separate domain landing page to enter. The
// domain is entered by this strip appearing, and every route in it enters the
// same domain the same way, whether you came by the domain name or the module.
//
// FIRST-LEVEL PAGES ONLY. A detail page has already dropped the board for the
// same reason - you are looking at one object, and a menu of sibling modules
// is a question you are not asking. The shell decides that, not this file.
//
// Buttons rendering links, not a callback nav. SectionNav and SegmentedControl
// are the DS's nav-shaped elements and both are onSelect(key) - a router push,
// which is not a link: no middle-click, no open-in-new-tab, nothing announced
// as a destination. Button + asChild + next/link is the sanctioned way to get
// DS control metrics onto a real anchor, and it is already how this app renders
// its other link-buttons.

export interface DomainModuleNavProps {
  readonly nav: readonly ResolvedNavEntry[];
  readonly activeKey: string;
}

export function DomainModuleNav({ nav, activeKey }: DomainModuleNavProps) {
  const {
    DOMAIN_LABEL,
    DOMAIN_GROUP_LABEL,
    PLANNED_MODULE_LABEL,
    LAUNCHER_TEXT,
  } = useMessages();

  const domain = domainOf(activeKey, nav);
  if (!domain) return null;

  // COUNTS EVERY MODULE, NOT JUST THE REACHABLE ONES.
  //
  // Counting only what is built suppressed the strip on /delivery, whose
  // domain has one page and two planned siblings - and that is precisely a
  // domain worth naming: it tells you the money side is one page today and
  // three when it is finished. What has no navigation to offer is a domain
  // holding nothing but the page you are already on.
  if (domain.modules.length < 2) return null;

  return (
    <nav
      aria-label={DOMAIN_GROUP_LABEL[domain.key] ?? domain.key}
      className="flex flex-wrap items-center gap-xs"
    >
      {/* The domain names itself. Without it this is a row of links that makes
          no statement about where you are, which is a toolbar, not a nav. */}
      <span className="text-muted-foreground flex items-center gap-2xs pr-xs text-xs">
        <Icon name={domain.icon} size="sm" />
        {DOMAIN_GROUP_LABEL[domain.key] ?? domain.key}
      </span>

      {domain.modules.map((m) =>
        m.kind === "planned" ? (
          // Kept, and kept dead. The strip is this domain's whole inventory;
          // dropping what is not built yet would make the domain look complete
          // and quietly shrink as the product grows in the other direction.
          <Button
            key={`planned-${m.key}`}
            variant="ghost"
            size="sm"
            disabled
            className="text-muted-foreground"
          >
            {PLANNED_MODULE_LABEL[m.key] ?? m.key}
            <span className="text-2xs opacity-70">{LAUNCHER_TEXT.planned}</span>
          </Button>
        ) : m.kind === "section" ? (
          <Button key={`section-${m.key}`} asChild size="sm" variant="ghost">
            <Link href={m.href}>
              <Icon name={m.icon} size="sm" />
              {PLANNED_MODULE_LABEL[m.key] ?? m.key}
            </Link>
          </Button>
        ) : m.state === "locked" ? null : ( // locked rows belong in the launcher, where the upgrade path is
          <Button
            key={m.key}
            asChild
            size="sm"
            variant={m.key === activeKey ? "secondary" : "ghost"}
          >
            <Link
              href={m.href}
              aria-current={m.key === activeKey ? "page" : undefined}
            >
              <Icon name={m.icon} size="sm" />
              {DOMAIN_LABEL[m.key] ?? m.key}
            </Link>
          </Button>
        ),
      )}
    </nav>
  );
}
