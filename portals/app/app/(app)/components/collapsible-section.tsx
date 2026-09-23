"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu, Button, Icon, Section } from "@vxture/design-ui";
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

/**
 * One entry of a panel's own "⋮" menu (owner, 2026-09-23: 每个板块按需一个
 * 按钮集, 在展开按钮左侧; 至少有查看、编辑两项). Exactly one of:
 *   onSelect  - do something here (open a drawer, recompute);
 *   href      - go to the page that owns it;
 *   "expand"  - (view only) open this card if it is folded;
 *   hint      - nowhere to go yet: shown GREYED with the reason, never hidden,
 *               so every panel's menu answers "view/edit" the same way.
 */
export type PanelAction =
  | { readonly onSelect: () => void; readonly href?: never; readonly hint?: never }
  | { readonly href: string; readonly onSelect?: never; readonly hint?: never }
  | { readonly hint: string; readonly onSelect?: never; readonly href?: never };

export interface PanelMenu {
  readonly view: PanelAction | "expand";
  readonly edit: PanelAction;
  /** This panel's own extra actions, after a separator. */
  readonly extra?: ReadonlyArray<{ readonly id: string; readonly label: string } & PanelAction>;
}

export type CollapsibleSectionProps = ComponentProps<typeof Section> & {
  /** This panel's own "⋮" menu, left of the fold toggle. Absent: no menu. */
  readonly menu?: PanelMenu;
  /** One line of what still needs attention while folded. Null/absent: none. */
  readonly summary?: ReactNode;
  /** Actions that only make sense while open (a tab strip, say) - hidden when folded. */
  readonly openAction?: ReactNode;
};

export function CollapsibleSection({
  summary,
  openAction,
  menu,
  action,
  description,
  className,
  children,
  ...rest
}: CollapsibleSectionProps) {
  const { CHAIN_TEXT, PANEL_MENU_TEXT, DS_LABELS } = useMessages();
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);

  const item = (id: string, label: string, a: PanelAction, separatorBefore?: boolean) =>
    a.hint !== undefined
      ? { id, label, disabled: true, hint: a.hint, separatorBefore }
      : { id, label, separatorBefore, onSelect: a.href !== undefined ? () => router.push(a.href) : a.onSelect };
  const menuItems = menu
    ? [
        menu.view === "expand"
          ? { id: "view", label: PANEL_MENU_TEXT.view, onSelect: () => setExpanded(true) }
          : item("view", PANEL_MENU_TEXT.view, menu.view),
        item("edit", PANEL_MENU_TEXT.edit, menu.edit),
        ...(menu.extra ?? []).map((x, i) => item(x.id, x.label, x, i === 0)),
      ]
    : null;

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
          {menuItems ? <ActionMenu label={DS_LABELS.actionMenu} items={menuItems} /> : null}
          {toggle}
        </span>
      }
    >
      {expanded ? children : null}
    </Section>
  );
}
