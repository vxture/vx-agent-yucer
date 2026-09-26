"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ActionMenu,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type IconName,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection, type PanelAction } from "./collapsible-section";
import { ContactCard } from "./contact-roster";
import { InfoRow } from "./info-row";
import { Tag } from "./tag";
import { useDealEdit, type DealEditor } from "./deal-edit-context";

// 商机详情页的板块 (deal batch 2, 2026-09-25; owner: 参考客户详情页样式, 这两个
// 是同一级别的). Every panel is the customer page's panel: a CollapsibleSection
// with a mandatory folded line, its own "⋮" with 查看 / 编辑, raised and
// veiled (panel-fold norm, design_yucer_120 附录). The page is a server
// component, so the one thing it cannot hand over - "编辑 opens that drawer" -
// is resolved here from the editor's NAME through the shared deal-edit context.

type Row = { readonly label: string; readonly value: ReactNode };

export interface DealPanelProps {
  readonly id: string;
  readonly icon: IconName;
  readonly title: ReactNode;
  readonly summary: string;
  /** Status marks beside the title (a stage, a pending count). */
  readonly tags?: ReactNode;
  /** 查看: another page, or just unfold this one. */
  readonly viewHref?: string;
  /** 编辑: one of this page's editors, a page, or nowhere (greyed, with why). */
  readonly editor?: DealEditor;
  readonly editHref?: string;
  readonly editHint?: string;
  /** A title-row button that opens one of this page's editors (推进阶段). */
  readonly primary?: { readonly label: string; readonly editor: DealEditor };
  readonly children: ReactNode;
}

/** One 栏2 panel of the deal page - the customer page's CollapsibleSection. */
export function DealPanel({
  id,
  icon,
  title,
  summary,
  tags,
  viewHref,
  editor,
  editHref,
  editHint,
  primary,
  children,
}: DealPanelProps) {
  const { PANEL_MENU_TEXT } = useMessages();
  const edit = useDealEdit();
  const editItem: PanelAction =
    editor && edit?.can[editor]
      ? { onSelect: () => edit.open(editor) }
      : editHref
        ? { href: editHref }
        : { hint: editor ? PANEL_MENU_TEXT.noEditRight : (editHint ?? PANEL_MENU_TEXT.noEntryHere) };
  return (
    <CollapsibleSection
      id={id}
      tone="raised"
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
      icon={icon}
      title={
        <span className="flex flex-wrap items-center gap-xs">
          <span>{title}</span>
          {tags}
        </span>
      }
      summary={summary}
      action={
        primary && edit?.can[primary.editor] ? (
          <Button size="sm" onClick={() => edit.open(primary.editor)}>
            {primary.label}
          </Button>
        ) : undefined
      }
      menu={{ view: viewHref ? { href: viewHref } : "expand", edit: editItem }}
    >
      {children}
    </CollapsibleSection>
  );
}

/** A small heading inside a panel (the prototype's `.sec`). */
export function PanelSub({ children, action }: { readonly children: ReactNode; readonly action?: ReactNode }) {
  return (
    <div className="text-muted-foreground mt-sm flex items-center gap-sm text-body-sm font-medium first:mt-0">
      <span>{children}</span>
      {action ? <span className="ml-auto">{action}</span> : null}
    </div>
  );
}

/** 栏1 · 交易档案 - the deal's OrgUnitPanel: name + number, 徽章区, the five
 *  facts out front, the rest under 更多资料. No stage and no close date: those
 *  live in 推进进程 (YC-069, one fact one place). */
export function DealDossierPanel({
  title,
  opportunityNo,
  badges,
  summary,
  facts,
  more,
  open,
}: {
  /** Open deals are given up from here; closed ones reopened (YC-069 §04). */
  readonly open: boolean;
  readonly title: string;
  readonly opportunityNo: string;
  readonly badges: ReactNode;
  readonly summary: string;
  readonly facts: readonly Row[];
  readonly more: readonly Row[];
}) {
  const { ACCOUNT_TEXT, PANEL_MENU_TEXT, OPPORTUNITY_TEXT, DEAL_PAGE_TEXT } = useMessages();
  const edit = useDealEdit();
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <CollapsibleSection
      id="deal-dossier"
      tone="raised"
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
      icon="folder"
      summary={summary}
      menu={{
        view: "expand",
        edit: edit?.can.terms ? { onSelect: () => edit.open("terms") } : { hint: PANEL_MENU_TEXT.noEditRight },
        // 放弃 / 重开 open the stage drawer, where both already live.
        extra: [
          ...(edit?.can.importance
            ? [{ id: "importance", label: DEAL_PAGE_TEXT.importanceEdit, onSelect: () => edit.open("importance") }]
            : []),
          ...(edit?.can.stage
            ? [
                {
                  id: "stage",
                  label: open ? OPPORTUNITY_TEXT.abandonOpen : OPPORTUNITY_TEXT.advanceReopen,
                  onSelect: () => edit.open("stage"),
                },
              ]
            : []),
        ],
      }}
      title={
        <span className="flex flex-col">
          <span className="flex min-w-0 items-center gap-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Up to two lines, then cut (owner 2026-09-26): a deal's name
                    is its identity - truncating it after six characters hid
                    the half that told two deals apart. */}
                <span className="line-clamp-2 min-w-0 break-words">{title}</span>
              </TooltipTrigger>
              <TooltipContent>{title}</TooltipContent>
            </Tooltip>
          </span>
          <span className="text-muted-foreground text-body-sm font-normal">{opportunityNo}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-md">
        {badges}
        <div className="border-primary/10 dark:border-primary/20 border-t" />
        <dl className="divide-primary/10 dark:divide-primary/20 flex flex-col divide-y divide-dashed">
          {facts.map((f) => (
            <InfoRow key={f.label} label={f.label}>
              {f.value}
            </InfoRow>
          ))}
        </dl>
        {/* 更多资料 like 待动手的事 (owner 2026-09-26): the extra rows open
            UNDER the facts, one list, and the toggle stays at the bottom -
            it used to sit between the two and split the information. */}
        {more.length > 0 && moreOpen ? (
          <dl className="divide-primary/10 dark:divide-primary/20 -mt-md flex flex-col divide-y divide-dashed border-t border-dashed border-primary/10 dark:border-primary/20">
            {more.map((f) => (
              <InfoRow key={f.label} label={f.label}>
                {f.value}
              </InfoRow>
            ))}
          </dl>
        ) : null}
        {more.length > 0 ? (
          <Button size="xs" variant="ghost" className="self-start" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
            {/* One name in both states (owner 2026-09-26: 都是"更多XX"，不是"收起"
                这种无意义名词) - the chevron says open or shut. */}
            {ACCOUNT_TEXT.orgUnitMore}
            <Icon name={moreOpen ? "chevron-up" : "chevron-down"} size="xs" />
          </Button>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

export interface DealSolutionRow {
  readonly id: string;
  readonly product: string;
  /** Quantity with its unit, already formatted ("16 人天"). */
  readonly quantity: string;
  /** Standard or add-on in the source solution; null when the line is not
   *  from one (a custom combination, or a product added beyond it). */
  readonly optional: boolean | null;
  readonly customNote: string | null;
}

/** 栏1 · 产品方案 (YC-069 §04b) - WHAT is sold: the combination and this
 *  deal's own customisation. No prices: 报价与审批 prices the same lines, and
 *  a line said twice in two places is how they come to disagree. Editing the
 *  combination stays on /pipeline/<id>/lines. */
export function DealSolutionPanel({
  source,
  scenario,
  rows,
  summary,
  editHref,
  editHint,
}: {
  /** The catalogue solution the lines came from; null = a custom combination. */
  readonly source: string | null;
  readonly scenario: string | null;
  readonly rows: readonly DealSolutionRow[];
  readonly summary: string;
  readonly editHref: string | null;
  readonly editHint: string;
}) {
  const { DEAL_PAGE_TEXT } = useMessages();
  const customised = rows.filter((r) => r.customNote);
  return (
    <CollapsibleSection
      id="deal-solution"
      tone="raised"
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
      icon="stack"
      title={DEAL_PAGE_TEXT.solutionTitle}
      summary={summary}
      menu={{ view: "expand", edit: editHref ? { href: editHref } : { hint: editHint } }}
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{DEAL_PAGE_TEXT.solutionNone}</p>
      ) : (
        <div className="flex flex-col gap-sm">
          <div className="text-muted-foreground text-body-sm">
            {source ? DEAL_PAGE_TEXT.solutionFrom(source) : DEAL_PAGE_TEXT.solutionCustom}
            {scenario ? <span className="block">{DEAL_PAGE_TEXT.solutionScenario(scenario)}</span> : null}
          </div>
          <div className="divide-primary/10 dark:divide-primary/20 flex flex-col divide-y divide-dashed">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-sm py-2xs text-body-sm">
                <span className="min-w-0 flex-1 truncate" title={r.product}>
                  {r.product}
                </span>
                <span className="text-muted-foreground flex-none tabular-nums">{r.quantity}</span>
                {r.optional === null ? null : (
                  <Tag tone={r.optional ? "warning" : "neutral"}>
                    {r.optional ? DEAL_PAGE_TEXT.solutionOptional : DEAL_PAGE_TEXT.solutionStandard}
                  </Tag>
                )}
              </div>
            ))}
          </div>
          {customised.length > 0 ? (
            <div className="flex flex-col gap-2xs">
              <span className="text-muted-foreground text-body-sm font-medium">{DEAL_PAGE_TEXT.solutionCustomisations}</span>
              {customised.map((r) => (
                <p key={r.id} className="text-body-sm">
                  {r.customNote}
                  <span className="text-muted-foreground"> · {DEAL_PAGE_TEXT.customOn(r.product)}</span>
                </p>
              ))}
            </div>
          ) : null}
          <span className="text-muted-foreground text-body-sm">{DEAL_PAGE_TEXT.solutionPriceElsewhere}</span>
        </div>
      )}
    </CollapsibleSection>
  );
}

export interface DealPerson {
  readonly id: string;
  readonly name: string;
  /** Job title and the role on THIS deal, already joined. */
  readonly role: string;
  readonly stance: { readonly label: string; readonly tone: "success" | "warning" | "danger" | "neutral" } | null;
  readonly recency: { text: string; warm: boolean; tooltip: string; date?: string } | undefined;
}

/** 栏1 · 决策流程 - who is who on THIS deal (决策链 promoted, YC-069). The
 *  customer page's contact card, one row per person, stance on the right.
 *  编辑 opens the buying-role drawer. The lower half - how they decide and
 *  sign (购买证据槽, incr/0085) - is the page's evidence rows, handed in. */
export function DealDecisionPanel({
  summary,
  people,
  warning,
  process,
  findings,
}: {
  /** 怎么决策、怎么签: the 决策流程 / 签约流程 slots (YC-069 §04c). */
  readonly process?: ReactNode;
  /** 证据抽取's role / stance proposals, decided in place (batch 4c). */
  readonly findings?: ReactNode;
  readonly summary: string;
  readonly people: readonly DealPerson[];
  /** Reachability, when it is the problem - said above the people. */
  readonly warning: string | null;
}) {
  const { ACCOUNT_TEXT, DEAL_PAGE_TEXT, PANEL_MENU_TEXT } = useMessages();
  const edit = useDealEdit();
  return (
    <CollapsibleSection
      id="buying-roles-panel"
      tone="raised"
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
      icon="users"
      title={DEAL_PAGE_TEXT.decisionTitle}
      summary={summary}
      menu={{
        view: "expand",
        edit: edit?.can.roles ? { onSelect: () => edit.open("roles") } : { hint: PANEL_MENU_TEXT.noEditRight },
      }}
    >
      <div className="flex flex-col">
        {warning ? (
          <span className="mb-xs">
            <StatusBadge tone="danger" dot>
              {warning}
            </StatusBadge>
          </span>
        ) : null}
        {people.length === 0 ? (
          <p className="text-muted-foreground text-body-sm">{DEAL_PAGE_TEXT.decisionEmpty}</p>
        ) : (
          <div className="flex flex-col">
          {people.map((p) => (
            <ContactCard
              key={p.id}
              contact={{ id: p.id, name: p.name, title: p.role, department: null, email: null, mobile: null, wechat: null, status: "active" }}
              recency={p.recency}
              statusLabels={ACCOUNT_TEXT.contactStatusLabel}
              channelLabels={{ mobile: ACCOUNT_TEXT.contactMobile, email: ACCOUNT_TEXT.contactEmail, wechat: ACCOUNT_TEXT.contactWechat }}
              actions={p.stance ? <Tag tone={p.stance.tone}>{p.stance.label}</Tag> : null}
            />
          ))}
          </div>
        )}
        {findings ? <div className="mt-xs">{findings}</div> : null}
        {process ? (
          <>
            <PanelSub>{DEAL_PAGE_TEXT.processTitle}</PanelSub>
            {process}
          </>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

/** 怎么决策、怎么签 - 决策流程 / 签约流程, one row each with 展开详情 on the
 *  right (owner 2026-09-25: 不是做成文字链子，各一行). The detail is the
 *  host's, opened in place. */
export function ProcessTitles({
  rows,
}: {
  readonly rows: readonly {
    readonly slot: string;
    readonly label: string;
    readonly detail: ReactNode;
    /** 商机评估's verdict on this slot, when it has one. */
    readonly mark?: { readonly tone: "good" | "warn" | "bad" | "unknown"; readonly verdict: string; readonly work: string | null };
  }[];
}) {
  const { DEAL_PAGE_TEXT } = useMessages();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (slot: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(slot)) n.delete(slot);
      else n.add(slot);
      return n;
    });
  return (
    <ul className="divide-primary/10 dark:divide-primary/20 flex flex-col divide-y divide-dashed">
      {rows.map((r) => (
        <li key={r.slot} className="flex flex-col gap-xs py-xs">
          <div className="flex items-center justify-between gap-sm">
            <span className="flex min-w-0 items-center gap-xs">
              {r.mark ? <span className={`size-2 flex-none rounded-full ${CHECK_DOT[r.mark.tone]}`} title={r.mark.verdict} /> : null}
              <span className="text-foreground text-body-sm font-bold">{r.label}</span>
              {r.mark?.work ? <span className={`truncate text-[12px] ${CHECK_INK[r.mark.tone]}`}>{r.mark.work}</span> : null}
            </span>
            <Button size="xs" variant="outline" aria-expanded={open.has(r.slot)} onClick={() => toggle(r.slot)}>
              {open.has(r.slot) ? DEAL_PAGE_TEXT.processCollapse : DEAL_PAGE_TEXT.processExpand}
              <Icon name={open.has(r.slot) ? "chevron-up" : "chevron-down"} size="xs" />
            </Button>
          </div>
          {open.has(r.slot) ? <div>{r.detail}</div> : null}
        </li>
      ))}
    </ul>
  );
}

/** 栏1 · 客户引用 - the customer as this deal needs it, read-only, one link to
 *  the customer page. Nothing about the customer is edited from a deal. */
export function DealCustomerPanel({
  name,
  href,
  summary,
  rows,
  accountLevel,
}: {
  readonly name: string;
  readonly href: string;
  readonly summary: string;
  readonly rows: readonly Row[];
  readonly accountLevel: { readonly label: string; readonly href: string } | null;
}) {
  const { DEAL_PAGE_TEXT } = useMessages();
  return (
    <CollapsibleSection
      id="deal-customer"
      tone="raised"
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
      icon="buildings"
      // 客户信息 (owner 2026-09-25): the title IS the way to the customer
      // page - underlined on hover, the tooltip says where it goes.
      title={
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={href} className="block min-w-0 truncate hover:text-primary hover:underline">
              {DEAL_PAGE_TEXT.customerInfoTitle}
            </Link>
          </TooltipTrigger>
          <TooltipContent>{DEAL_PAGE_TEXT.customerTitleHint(name)}</TooltipContent>
        </Tooltip>
      }
      summary={summary}
      menu={{ view: { href }, edit: { hint: DEAL_PAGE_TEXT.customerReadOnly } }}
    >
      <div className="flex flex-col gap-sm">
        <dl className="divide-primary/10 dark:divide-primary/20 flex flex-col divide-y divide-dashed">
          {rows.map((f) => (
            <InfoRow key={f.label} label={f.label}>
              {f.value}
            </InfoRow>
          ))}
        </dl>
        {accountLevel ? (
          <Link href={accountLevel.href} className="text-primary text-body-sm hover:underline">
            {accountLevel.label}
          </Link>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

/** The crumbs row's "⋮" - every editor of this page in one place, the
 *  customer page's 客户总编辑 (account-header-menu.tsx). The panels' own
 *  menus open the same editors. */
export function DealHeaderMenu({ linesHref }: { readonly linesHref: string | null }) {
  const { DS_LABELS, DEAL_PAGE_TEXT, OPPORTUNITY_TEXT } = useMessages();
  const edit = useDealEdit();
  const router = useRouter();
  if (!edit) return null;
  const items = [
    ...(edit.can.terms ? [{ id: "terms", label: DEAL_PAGE_TEXT.editTerms, onSelect: () => edit.open("terms") }] : []),
    ...(edit.can.stage ? [{ id: "stage", label: OPPORTUNITY_TEXT.advanceTitle, onSelect: () => edit.open("stage") }] : []),
    ...(edit.can.roles ? [{ id: "roles", label: DEAL_PAGE_TEXT.editRoles, onSelect: () => edit.open("roles") }] : []),
    ...(edit.can.importance
      ? [{ id: "importance", label: DEAL_PAGE_TEXT.importanceEdit, onSelect: () => edit.open("importance") }]
      : []),
    ...(linesHref ? [{ id: "lines", label: OPPORTUNITY_TEXT.linesEdit, onSelect: () => router.push(linesHref) }] : []),
  ];
  if (items.length === 0) return null;
  return <ActionMenu label={DS_LABELS.actionMenu} items={items} />;
}

/** 商机评估's indicators for one dimension, at the head of its panel (owner
 *  2026-09-26: 栏2 下方的板块按五个维度构建，名称、顺序与上面一致): each
 *  indicator, its verdict, and the work when it is not 稳 - the card above
 *  says the worst one, this says all of them. */
export function DimensionChecks({
  rows,
}: {
  readonly rows: readonly {
    readonly key: string;
    readonly label: string;
    readonly tone: "good" | "warn" | "bad" | "unknown";
    readonly verdict: string;
    readonly work: string | null;
  }[];
}) {
  const dot = CHECK_DOT;
  const ink = CHECK_INK;
  return (
    <ul className="divide-primary/10 dark:divide-primary/20 grid grid-cols-1 gap-x-lg divide-y divide-dashed sm:grid-cols-2 sm:divide-y-0">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[0.5rem_5.5rem_2.5rem_minmax(0,1fr)] items-center gap-xs py-2xs text-body-sm">
          <span className={`size-2 rounded-full ${dot[r.tone]}`} aria-hidden />
          <span className="text-foreground truncate font-medium">{r.label}</span>
          <span className={`text-[11.5px] font-bold ${ink[r.tone]}`}>{r.verdict}</span>
          <span className="text-muted-foreground truncate text-[12px]" title={r.work ?? undefined}>
            {r.work ?? ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

const CHECK_DOT = {
  good: "bg-(color:--success-text)",
  warn: "bg-(color:--warning-text)",
  bad: "bg-destructive",
  unknown: "border border-dashed border-muted-foreground",
};
const CHECK_INK = {
  good: "text-(color:--success-text)",
  warn: "text-(color:--warning-text)",
  bad: "text-destructive-text",
  unknown: "text-muted-foreground",
};

/** The first `visible` items, the rest behind one 展开其余 N 条 (owner
 *  2026-09-26: 待动手的事较长时折叠). The order is the caller's - worst first -
 *  so what is folded is what matters least. */
export function FoldedList({
  items,
  visible = 5,
}: {
  readonly items: readonly ReactNode[];
  readonly visible?: number;
}) {
  const { DEAL_PAGE_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  const rest = items.length - visible;
  return (
    <>
      {open || rest <= 0 ? items : items.slice(0, visible)}
      {rest > 0 ? (
        <Button size="xs" variant="ghost" className="self-start" onClick={() => setOpen(!open)}>
          {/* The same name open or shut; the chevron says which. */}
          {DEAL_PAGE_TEXT.foldMore(rest)}
          <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
        </Button>
      ) : null}
    </>
  );
}
