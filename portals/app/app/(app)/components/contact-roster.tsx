"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  FilterBar,
  Icon,
  Section,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useToast,
  type ActionMenuItem,
} from "@vxture/design-ui";
import { moveItems, RowActions } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import type { MoveDirection } from "../../domains/shared/ordering";

// The people inside a customer.
//
// `account.contact.upsert` was in the action catalogue from batch 1 with no
// verb behind it (TD-016), and this was the sharpest case: `linkContacts` is
// implemented and has a surface, so a member could draw relations between
// contacts while having no way to create one. The board's headline
// "N 决策人未触达" is computed from decision_role, so it could only ever
// describe seed data.
//
// OUTSIDE the decision-chain block on purpose. The chain is gated by
// `account.graph`, a PRO capability; adding a contact rides the free
// `account.manage`. Nesting this inside the chain would make a starter
// workspace unable to record who it is talking to.
//
// ID IS THE IDENTITY, so "who am I editing" is an explicit control rather than
// a guess: two people at one customer can share a name, and matching on one
// would merge colleagues.

function ContactStatus({
  status,
  labels,
}: {
  readonly status: string;
  readonly labels: Record<string, string>;
}) {
  // Nothing for the ordinary case: a column of "active" badges is noise that
  // hides the two rows where the status is the point.
  if (status === "active") return null;
  return <Tag>{labels[status] ?? status}</Tag>;
}

/** 邮箱/微信 presence, icon only (owner, 2026-09-20: 设计图严格对齐 - 数据
 *  一直都在 ContactRow 上, 只是这张表从没画出来过). 手机号仍然是明码文本列
 *  (ACCOUNT_TEXT.contactMobile 那一列) 而不是同款图标 - mockup 把它也收成
 *  纯图标是因为那是一张纯展示卡, 真实产品里销售要拿这个号码去打电话, 收成
 *  图标会让这张表没法做它自己的事, 所以只在这里跟进 mockup 的一半: 补上
 *  从没显示过的两个渠道, 留着已经在用的手机号明码不动。 */
function ContactChannels({
  email,
  wechat,
  labels,
}: {
  readonly email: string | null;
  readonly wechat: string | null;
  readonly labels: { readonly email: string; readonly wechat: string };
}) {
  if (!email && !wechat) return null;
  return (
    <span className="gap-2xs inline-flex items-center">
      {email ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground inline-flex">
              <Icon name="mail" size="sm" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{labels.email}</TooltipContent>
        </Tooltip>
      ) : null}
      {wechat ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground inline-flex">
              <Icon name="wechat" size="sm" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{labels.wechat}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

export interface ContactRow {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly department: string | null;
  /** incr/0024 - how to reach this person. */
  readonly email: string | null;
  readonly mobile: string | null;
  readonly wechat: string | null;
  readonly status: string;
}

export interface ContactRosterProps {
  readonly accountId: string;
  readonly contacts: readonly ContactRow[];
  readonly canEdit: boolean;
  /** The person form's page, carrying this account - the create/edit form left
   *  the roster on 2026-09-05 (the consolidation ruling). */
  readonly editHref: string;
  /** 排序四元组 (incr/0073) - persisted, unlike the 姓名 column's click-sort
   *  below. Takes `accountId` itself, same shape as HealthPanel's
   *  `onRecompute` - the component supplies its own id rather than the
   *  caller binding one in. Optional so a caller with no write path yet
   *  degrades to the read-only roster rather than a crash. */
  readonly onMove?: (
    accountId: string,
    contactId: string,
    direction: MoveDirection,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** 联系人和最近跟进合并 (owner, 2026-09-20: mockup - 一个最近跟进天数, 不是
   *  分开的两个事实) - contactId -> {text, warm}, from chainRecency() run
   *  over the FULL roster (account/[id]/page.tsx), not just decision-chain
   *  participants. `warm` is carried separately from the already-formatted
   *  text so this component styles the badge without re-parsing
   *  RECENCY_TEXT's own wording. A plain Record, not a Map: a Map passed as a
   *  Server->Client prop is the same class of bundler risk this page already
   *  hit twice with re-exported constants (dimension-stat.tsx's
   *  toneSurfaceClasses note). Absent key = chainRecency has nothing for that
   *  contact yet (gate denied, or the read failed) - row shows no badge
   *  rather than a guessed one. */
  readonly recencyText: Readonly<Record<string, { text: string; warm: boolean }>>;
  /** LinkContactDrawer, built server-side in page.tsx and mounted here as
   *  the card's second header action, next to "+新增" - the mockup's own
   *  两个按钮 (owner, 2026-09-20: 应该有 新增｜关联 两个按钮). Optional: a
   *  read-only member gets neither. */
  readonly linkForm?: ReactNode;
  /** 取消关联 (owner, 2026-09-20: mockup 行菜单) - ends this person's CURRENT
   *  affiliation; the person and their evidence survive. Optional, same
   *  degrade-to-read-only-roster shape as `onMove`. */
  readonly onUnlink?: (
    accountId: string,
    contactId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

/* 截断 (owner, 2026-09-20: 联系人截断+排序四元组) - 栏1 只有 18rem 宽, 一张
   全量表格比"还有几位, 点开看"更占地方。CAP 3 与 mockup 一致。 */
const CAP = 3;

/** 卡片行, 不是表格行 (owner, 2026-09-20: 设计图严格对齐 - mockup 的联系人是
 *  avatar+两行卡片, 不是六列表格; decision-chain-switch.tsx 的摘要行本来就
 *  是照着这张卡的样子画的, 现在补回来是同一套样子, 不是新发明一种). 栏1只有
 *  18rem宽, 六列表格挤不下, 卡片行也是 mockup 明确写的理由。手机号仍然明码
 *  显示在第二行 (不是同款图标) - 这是这页早先就做过的、有意的取舍: mockup
 *  把手机也收成图标是因为那是一张纯展示卡, 真实产品里销售要拿这个号码去
 *  打电话, 收成图标这张卡就做不成它自己的事了。 */
function ContactCard({
  contact,
  recency,
  statusLabels,
  channelLabels,
  actions,
}: {
  readonly contact: ContactRow;
  readonly recency: { text: string; warm: boolean } | undefined;
  readonly statusLabels: Record<string, string>;
  readonly channelLabels: { readonly email: string; readonly wechat: string };
  readonly actions: ReactNode;
}) {
  const secondLine = [contact.title, contact.mobile].filter(Boolean).join(" · ");
  return (
    <div className="gap-sm border-border flex items-center border-b py-sm last:border-b-0">
      <span className="bg-accent text-muted-foreground flex h-lg w-lg flex-none items-center justify-center rounded-full text-label-sm font-bold">
        {contact.name.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-sm">
          <span className="text-body-sm truncate font-bold">{contact.name}</span>
          {recency ? <Tag tone={recency.warm ? "success" : "neutral"}>{recency.text}</Tag> : null}
        </div>
        <div className="flex items-center justify-between gap-sm">
          <span className="text-muted-foreground text-body-sm truncate">{secondLine}</span>
          <span className="flex flex-none items-center gap-xs">
            <ContactChannels email={contact.email} wechat={contact.wechat} labels={channelLabels} />
            <ContactStatus status={contact.status} labels={statusLabels} />
            {actions}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ContactRoster({
  accountId,
  contacts,
  canEdit,
  editHref,
  onMove,
  recencyText,
  linkForm,
  onUnlink,
}: ContactRosterProps) {
  const { ACCOUNT_TEXT, LINK_CONTACT_TEXT, ROW_OPS, ACCOUNT_ERROR } = useMessages();
  const { toast } = useToast();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function move(id: string, direction: MoveDirection) {
    if (!onMove) return;
    startTransition(async () => {
      const r = await onMove(accountId, id, direction);
      if (!r.ok) toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? r.error ?? "" });
      else router.refresh();
    });
  }

  function unlink(id: string) {
    if (!onUnlink) return;
    startTransition(async () => {
      const r = await onUnlink(accountId, id);
      if (!r.ok) toast({ tone: "danger", title: ACCOUNT_ERROR[r.error ?? "denied"] ?? r.error ?? "" });
      else router.refresh();
    });
  }

  const visible = expanded ? contacts : contacts.slice(0, CAP);

  // tone="raised" - 设计图是全面card化 (owner, 2026-09-20; 理由见
  // org-unit-panel.tsx 同名注释). 没有 description - 去掉所有垃圾说明
  // (owner, 2026-09-20; 理由见 org-unit-panel.tsx 同名注释). action 里
  // "+新增｜关联" 两个按钮 (owner: 应该有两个按钮) - 之前"+新增"单独落在卡片
  // 底部一个 "保存联系人" 链接, 现在跟"关联"并排挪进卡头, 是同一个入口的
  // 两条路而不是三条 - 卡头讲清楚"能做什么", 底部不再重复。
  return (
    <Section
      tone="raised"
      id="contacts"
      icon="users"
      title={ACCOUNT_TEXT.contactsTitle}
      action={
        canEdit ? (
          <span className="flex items-center gap-xs">
            <Button asChild variant="ghost" size="sm">
              <a href={editHref}>{ACCOUNT_TEXT.contactAddButton}</a>
            </Button>
            {linkForm}
          </span>
        ) : undefined
      }
    >
      {contacts.length === 0 ? (
        <EmptyState
          title={ACCOUNT_TEXT.contactsNone}
          description={ACCOUNT_TEXT.contactsNoneWhy}
        />
      ) : (
        <>
        {/* 按需 - COUNT ONLY (owner's 按需添加, 2026-09-07). This is the roster
            of ONE customer's people, not a directory: the whole list is on
            screen, and a keyword box for finding something already visible is
            a control that does nothing. The count answers a question the
            heading cannot - how many people we actually know inside this
            account, which is the coverage question this section exists for. */}
        <FilterBar count={ACCOUNT_TEXT.contactCount(contacts.length)} />

        <div className="flex flex-col">
          {visible.map((c) => {
            // rowIndex/count against the TRUE server order (contacts, not the
            // possibly-truncated visible slice) - moving a row acts on the
            // persisted roster, not on whatever the collapsed cap happens to
            // show.
            const index = contacts.findIndex((row) => row.id === c.id);
            // 查看详情 / 排序四元组 / 取消关联 - 归集到一个"···"菜单 (owner,
            // 2026-09-20: mockup 行菜单 - 查看详细｜排序｜取消关联). 查看详情
            // 直接带上这个人的 id, PersonForm 自己已经会照着它把这一行的
            // 字段选出来编辑 - 不是一个新页面, 是 /contact/new 那张表单本来
            // 就有的"编辑现有联系人"入口, 只是这里第一次替它接上一个具体的人。
            // canEdit gates the WHOLE menu, not just the write items inside
            // it - 查看详情 opens a form gated on the same permission
            // (account.contact.upsert), and offering it to a reader who would
            // only be redirected straight back is a dead end, not a view.
            const items: ActionMenuItem[] = !canEdit
              ? []
              : [
                  { id: "detail", label: ACCOUNT_TEXT.contactViewDetail, onSelect: () => router.push(`${editHref}&edit=${c.id}`) },
                ];
            if (canEdit && onMove) {
              items.push(...moveItems(ROW_OPS, index, contacts.length, (d) => move(c.id, d)));
            }
            if (canEdit && onUnlink) {
              items.push({
                id: "unlink",
                label: LINK_CONTACT_TEXT.unlink,
                danger: true,
                separatorBefore: true,
                confirm: {
                  verb: LINK_CONTACT_TEXT.unlinkVerb,
                  target: c.name,
                  consequence: LINK_CONTACT_TEXT.unlinkConsequence,
                  cancelLabel: LINK_CONTACT_TEXT.cancel,
                  onConfirm: () => unlink(c.id),
                },
              });
            }
            return (
              <ContactCard
                key={c.id}
                contact={c}
                recency={recencyText[c.id]}
                statusLabels={ACCOUNT_TEXT.contactStatusLabel}
                channelLabels={{ email: ACCOUNT_TEXT.contactEmail, wechat: ACCOUNT_TEXT.contactWechat }}
                actions={<RowActions disabled={pending} items={items} />}
              />
            );
          })}
        </div>
        {contacts.length > CAP ? (
          <Button variant="ghost" size="sm" className="mt-xs w-full justify-center" onClick={() => setExpanded((v) => !v)}>
            {expanded ? ACCOUNT_TEXT.contactsCollapse : ACCOUNT_TEXT.contactsShowAll(contacts.length)}
          </Button>
        ) : null}
        </>
      )}

      {!canEdit ? (
        <p className="text-muted-foreground mt-sm text-body-sm">{ACCOUNT_TEXT.contactsDenied}</p>
      ) : null}
    </Section>
  );
}
