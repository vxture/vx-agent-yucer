"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Button, Icon, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 可收起的板块 (owner, 2026-09-23: 给所有板块增加展开收起, 收起后彻底收起 +
// 一行重点). The customer page's cards, left and centre, all fold the same way.
//
// COLLAPSED = THE TITLE ROW, NOTHING ELSE (design T4 / Q3.3): title, status
// marks and the card's own actions stay; the body goes. Under the title, in
// the DS's own description slot, one line of what still needs attention while
// the body is hidden - an alert must never be folded away with its card. No
// line when there is nothing to watch.
//
// OPEN BY DEFAULT, NOT REMEMBERED ACROSS VISITS (Q3.3): a card someone folded
// last week must not hide what changed since.
//
// TD-034 (stopgap): the DS Section has no collapsed state. Rendered with no
// body it still draws the header's divider (level 2 always has one, and
// Section does not forward `divider`) and an empty body wrapper spaced by
// gap-md, which left the line and blank band the owner reported under L5.
// The three data-[collapsed] classes below remove exactly those while
// collapsed - they target the DS's internal header/body order and must go
// when Section gains a collapsed/divider option.
const COLLAPSED_CLASS =
  "data-[collapsed=true]:[&>div:first-child]:border-b-0 data-[collapsed=true]:[&>div:first-child]:pb-0 data-[collapsed=true]:[&>div:last-child]:hidden";

export type CollapsibleSectionProps = ComponentProps<typeof Section> & {
  /** One line of what still needs attention while folded. Null/absent: none. */
  readonly summary?: ReactNode;
  /** Actions that only make sense while open (a tab strip, say) - hidden when folded. */
  readonly openAction?: ReactNode;
};

export function CollapsibleSection({
  summary,
  openAction,
  action,
  description,
  className,
  children,
  ...rest
}: CollapsibleSectionProps) {
  const { CHAIN_TEXT } = useMessages();
  const [expanded, setExpanded] = useState(true);

  const toggle = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-expanded={expanded}
      aria-label={expanded ? CHAIN_TEXT.collapse : CHAIN_TEXT.expand}
      title={expanded ? CHAIN_TEXT.collapse : CHAIN_TEXT.expand}
      onClick={() => setExpanded((v) => !v)}
    >
      <Icon name={expanded ? "chevron-up" : "chevron-down"} size="sm" />
    </Button>
  );

  return (
    <Section
      {...rest}
      data-collapsed={expanded ? undefined : "true"}
      className={[className, COLLAPSED_CLASS].filter(Boolean).join(" ")}
      description={expanded ? description : (summary ?? undefined)}
      action={
        <span className="flex items-center justify-end gap-xs">
          {expanded ? openAction : null}
          {action}
          {toggle}
        </span>
      }
    >
      {expanded ? children : null}
    </Section>
  );
}
