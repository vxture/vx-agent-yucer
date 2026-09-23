"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu, Button, Icon, Section, Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
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
// While collapsed the body holds ONLY the folded line (below), so what is
// removed is the header divider (level-2 callers) and the gap between the
// header and that line is tightened. They target the DS's internal header
// order and must go when Section gains a collapsed/divider option.
const COLLAPSED_CLASS =
  "data-[collapsed=true]:[&>div:first-child]:border-b-0 data-[collapsed=true]:[&>div:first-child]:pb-0 data-[collapsed=true]:gap-2xs";

// TD-034, second half - the header ROW'S ALIGNMENT (owner, 2026-09-23: icon
// 和 title 没有对齐; 没有 subtitle 应该全面对齐, 有 subtitle 时占据两行对齐).
// The DS header is `items-start`, pads its icon down with `mt-2xs` (room for
// a description line under the title) and pins the action slot to the
// BOTTOM (`self-end`). With no description the icon sat below the title.
// Centred instead: icon, title block and buttons share one axis - one line
// when there is only a title, the middle of both lines when the title block
// has two (the org unit's name + number). This is safe now that the folded
// line lives in the body: the header's height no longer changes between
// open and folded, so centring does not make the buttons jump (the reason
// they were once pinned to the top). Same recovery condition as above.
const HEADER_ALIGN_CLASS =
  "[&>div:first-child]:items-center [&>div:first-child>span:first-child]:mt-0 [&>div:first-child>div:last-child]:self-center";

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
  /**
   * THE FOLDED LINE - REQUIRED, ALWAYS (norm, owner 2026-09-23: 收起后统一
   * 一行小字, 警示性, 关键信息提示). Warning first; when nothing warns, the
   * card's single most important fact - never empty, so every folded card
   * reads alike. A string, not a node: null cannot be passed, and a panel
   * that forgets the line does not compile.
   */
  readonly summary: string;
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
  level = 3,
  ...rest
}: CollapsibleSectionProps) {
  const { CHAIN_TEXT, PANEL_MENU_TEXT, DS_LABELS, COLLAPSE_TEXT } = useMessages();
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
    // LEVEL 3 BY DEFAULT (owner, 2026-09-23: 板块标题文字可以适当缩小一些):
    // the DS's own next step down, title-sm (~14px) from title-md (~16px),
    // with its matching icon size - no restyling. Level 3 headers carry no
    // divider in the DS, so the expanded card loses that line too.
    <Section
      {...rest}
      level={level}
      data-collapsed={expanded ? undefined : "true"}
      className={[className, COLLAPSED_CLASS, HEADER_ALIGN_CLASS].filter(Boolean).join(" ")}
      // Only the open card uses the DS description slot. Folded, the line
      // does NOT go there: squeezed beside the buttons under the title it
      // wrapped (owner, 2026-09-23: 按钮和标题拉通一行, 小字单独一行, 太长截断).
      description={expanded ? description : undefined}
      action={
        <span className="flex items-center justify-end gap-xs">
          {expanded ? openAction : null}
          {action}
          {menuItems ? <ActionMenu label={DS_LABELS.actionMenu} items={menuItems} /> : null}
          {toggle}
        </span>
      }
    >
      {expanded ? (
        children
      ) : (
        // THE FOLDED LINE, on its own row under the title row, full width,
        // ONE line - truncated with an ellipsis, the full text on hover.
        // Prefixed with the header's AI icon (`sparkles`, same as the
        // 智能助手 button - owner 2026-09-23: 无论规则还是推理都标 AI, 用图标
        // 不写文字); the icon's own hover names the actual source, so B4's
        // 规则算出 / 模型推断 distinction is kept - today every line is
        // rule-computed.
        // ICON AND TEXT ON ONE AXIS, WITH ROOM (owner, 2026-09-23: ai-star 与
        // 信息没有对齐, 没有留白间距): the icon's holder is a flex box, not an
        // inline span - inline, the svg sat on the text baseline and read low -
        // and the gap is gap-xs, the step every other icon+text pair here uses.
        <div className="text-muted-foreground text-body-sm flex min-w-0 items-center gap-xs">
          <span className="text-primary-text flex shrink-0 items-center" title={COLLAPSE_TEXT.aiHint}>
            <Icon name="sparkles" size="xs" />
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="min-w-0 truncate">{summary}</span>
            </TooltipTrigger>
            <TooltipContent>{summary}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </Section>
  );
}
