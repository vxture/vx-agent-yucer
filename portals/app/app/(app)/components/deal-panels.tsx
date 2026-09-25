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
}: {
  readonly title: string;
  readonly opportunityNo: string;
  readonly badges: ReactNode;
  readonly summary: string;
  readonly facts: readonly Row[];
  readonly more: readonly Row[];
}) {
  const { ACCOUNT_TEXT, PANEL_MENU_TEXT } = useMessages();
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
      }}
      title={
        <span className="flex flex-col">
          <span className="flex min-w-0 items-center gap-xs">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 truncate">{title}</span>
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
        {more.length > 0 ? (
          <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-2xs text-body-sm">
              <Icon name={moreOpen ? "chevron-down" : "chevron-right"} size="xs" />
              {ACCOUNT_TEXT.orgUnitMore}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <dl className="divide-primary/10 dark:divide-primary/20 mt-2xs flex flex-col divide-y divide-dashed">
                {more.map((f) => (
                  <InfoRow key={f.label} label={f.label}>
                    {f.value}
                  </InfoRow>
                ))}
              </dl>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
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
 *  Display only: 编辑 opens the buying-role drawer. How they decide and sign
 *  (决策流程 / 签约流程 slots) arrives with the evidence slots, batch 4. */
export function DealDecisionPanel({
  summary,
  people,
  warning,
}: {
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
          people.map((p) => (
            <ContactCard
              key={p.id}
              contact={{ id: p.id, name: p.name, title: p.role, department: null, email: null, mobile: null, wechat: null, status: "active" }}
              recency={p.recency}
              statusLabels={ACCOUNT_TEXT.contactStatusLabel}
              channelLabels={{ mobile: ACCOUNT_TEXT.contactMobile, email: ACCOUNT_TEXT.contactEmail, wechat: ACCOUNT_TEXT.contactWechat }}
              actions={p.stance ? <Tag tone={p.stance.tone}>{p.stance.label}</Tag> : null}
            />
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}

/** 栏1 · 客户引用 - the customer as this deal needs it, read-only, one link to
 *  the customer page. Nothing about the customer is edited from a deal. */
export function DealCustomerPanel({
  name,
  href,
  summary,
  rows,
  projects,
  accountLevel,
}: {
  readonly name: string;
  readonly href: string;
  readonly summary: string;
  readonly rows: readonly Row[];
  readonly projects: readonly { readonly id: string; readonly name: string; readonly tone: "success" | "warning" | "danger" }[];
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
      title={
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block min-w-0 truncate">{DEAL_PAGE_TEXT.customerTitle(name)}</span>
          </TooltipTrigger>
          <TooltipContent>{name}</TooltipContent>
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
        {projects.length > 0 ? (
          <div className="flex flex-col gap-2xs">
            <span className="text-muted-foreground text-body-sm">{DEAL_PAGE_TEXT.customerProjects}</span>
            <div className="flex flex-wrap gap-xs">
              {projects.map((p) => (
                <Link key={p.id} href="/delivery">
                  <StatusBadge tone={p.tone}>{p.name}</StatusBadge>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        {accountLevel ? (
          <Link href={accountLevel.href} className="text-primary text-body-sm hover:underline">
            {accountLevel.label}
          </Link>
        ) : null}
        {/* Read-only: the "⋮" 编辑 says so; the way out is one link. */}
        <Link href={href} className="text-primary self-end text-body-sm hover:underline" title={DEAL_PAGE_TEXT.customerReadOnly}>
          {DEAL_PAGE_TEXT.customerOpen}
        </Link>
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
    ...(linesHref ? [{ id: "lines", label: OPPORTUNITY_TEXT.linesEdit, onSelect: () => router.push(linesHref) }] : []),
  ];
  if (items.length === 0) return null;
  return <ActionMenu label={DS_LABELS.actionMenu} items={items} />;
}
