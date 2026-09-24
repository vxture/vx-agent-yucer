"use client";

import { useState, type ReactNode } from "react";
import {
  Button,
  EmptyState,
  Icon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { CollapsibleSection } from "./collapsible-section";
import { useAccountEdit } from "./account-edit-context";
import { LinkContactDrawer, type LinkContactDrawerProps } from "./link-contact-drawer";

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

/** 手机/邮箱/微信 presence, ICON ONLY, 不显示明码 (owner, 2026-09-21: 这里
 *  不显示电话明码，只显示有没有配置各种联系方式。icon即可) - 覆盖了这张卡
 *  更早一版"手机号明码留着, 因为销售要拿它打电话"的取舍(2026-09-20): 那个
 *  取舍是这张常驻卡自己的历史遗留, 这次 owner 直接推翻 - 三个渠道统一收成
 *  图标, hover 只说"这是哪个渠道"(labels.mobile/email/wechat), 不透出号码
 *  本身。真要看号码/加好友, 去"编辑单位信息"或联系人详情页。 */
function ContactChannels({
  mobile,
  email,
  wechat,
  labels,
}: {
  readonly mobile: string | null;
  readonly email: string | null;
  readonly wechat: string | null;
  readonly labels: { readonly mobile: string; readonly email: string; readonly wechat: string };
}) {
  if (!mobile && !email && !wechat) return null;
  return (
    <span className="gap-2xs inline-flex items-center">
      {mobile ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground inline-flex">
              <Icon name="phone" size="xs" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{labels.mobile}</TooltipContent>
        </Tooltip>
      ) : null}
      {email ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground inline-flex">
              <Icon name="mail" size="xs" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{labels.email}</TooltipContent>
        </Tooltip>
      ) : null}
      {wechat ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground inline-flex">
              <Icon name="wechat" size="xs" />
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
  readonly contacts: readonly ContactRow[];
  readonly canEdit: boolean;
  /** The person form's page, carrying this account - the create/edit form left
   *  the roster on 2026-09-05 (the consolidation ruling). */
  readonly editHref: string;
  /** 联系人和最近跟进合并 (owner, 2026-09-20: mockup - 一个最近跟进天数, 不是
   *  分开的两个事实) - contactId -> {text, warm, tooltip}, from chainRecency()
   *  run over the FULL roster (account/[id]/page.tsx), not just decision-chain
   *  participants. `warm` is carried separately from the already-formatted
   *  text so this component styles the badge without re-parsing the wording.
   *  `text` is now the SHORT form only ("12 天", owner 2026-09-21: tag 显示
   *  只有（nn天），不要啰嗦) - the full sentence ("某某在12天前联系") is
   *  `tooltip`, shown on hover instead of crowding the row. A plain Record,
   *  not a Map: a Map passed as a Server->Client prop is the same class of
   *  bundler risk this page already hit twice with re-exported constants
   *  (dimension-stat.tsx's toneSurfaceClasses note). Absent key = chainRecency
   *  has nothing for that contact yet (gate denied, or the read failed) - row
   *  shows no badge rather than a guessed one. */
  readonly recencyText: Readonly<Record<string, { text: string; warm: boolean; tooltip: string; date?: string }>>;
  /** The 关联 drawer's data and action. 新增｜关联 (owner, 2026-09-20) now
   *  live in this panel's own "⋮" (owner, 2026-09-23), so the panel mounts
   *  the drawer itself and opens it from the menu. Optional: a read-only
   *  member gets neither. */
  readonly link?: Omit<LinkContactDrawerProps, "openSignal">;
}

/* 截断 (owner, 2026-09-20: 联系人截断+排序四元组) - 栏1 只有 18rem 宽, 一张
   全量表格比"还有几位, 点开看"更占地方。CAP 3 与 mockup 一致。 */
const CAP = 3;

/** 卡片行, 不是表格行 (owner, 2026-09-20: 设计图严格对齐 - mockup 的联系人是
 *  avatar+两行卡片, 不是六列表格; decision-chain-switch.tsx 的摘要行本来就
 *  是照着这张卡的样子画的, 现在补回来是同一套样子, 不是新发明一种). 栏1只有
 *  18rem宽, 六列表格挤不下, 卡片行也是 mockup 明确写的理由。
 *
 *  第二轮重新规整 (owner, 2026-09-21: 各联系信息有些拥堵，重新设计一下布局，
 *  行高可以适当调整) - 手机号从第二行的明码文本挪进 ContactChannels 的图标
 *  组(见那个函数自己的注释, 这是对 2026-09-20 那个"手机留明码"决定的推翻,
 *  不是延续), 第二行因此只剩职务, 让给右边的图标组和状态标签足够宽度；
 *  行内边距从 py-sm 提到 py-md, 头像也放大一号 - 少了一整段手机号文本之后
 *  原来的紧凑间距显得局促, 不是拥堵的另一个来源。 */
/** Exported (owner, 2026-09-20: 死死记住设计文件 - mockup 的行菜单只该出现
 *  在"编辑单位信息"里的只读联系人卡片上, 栏1这张常驻卡一个按钮都不该有) -
 *  contact-management-list.tsx 复用同一套行外观, 只是那边带 actions, 这里
 *  不带。`actions` 因此是可选的, 不是每个消费者都要给。 */
export function ContactCard({
  contact,
  recency,
  statusLabels,
  channelLabels,
  actions,
}: {
  readonly contact: ContactRow;
  /** tooltip 可选 (owner: 补充 - tag 显示只有（nn天）...toolip=某某在12天前
   *  联系) - contact-management-list.tsx 复用这张卡时还传的是旧形状
   *  ({text, warm}), 那边没有要求这个改动, 缺了 tooltip 时这张卡就不挂
   *  Tooltip, 纯文本 Tag 照旧。 */
  readonly recency: { text: string; warm: boolean; tooltip?: string; date?: string } | undefined;
  readonly statusLabels: Record<string, string>;
  readonly channelLabels: { readonly mobile: string; readonly email: string; readonly wechat: string };
  readonly actions?: ReactNode;
}) {
  // Icon + text, not a badge (owner, 2026-09-24: badge太重) - the colour
  // still says warm or not, without the chrome. 11px, one step under the
  // name (owner, 2026-09-24: 字号缩小一号): the DS scale stops at 12px
  // (text-body-sm) and text-label-* are 12-14px MEDIUM, so the size is set
  // explicitly - a named custom override, not a token.
  const recencyTag = recency ? (
    <span
      className={`inline-flex flex-none items-center gap-3xs text-[11px] leading-none tabular-nums ${
        recency.warm ? "text-success-text" : "text-muted-foreground"
      }`}
    >
      <Icon name="clock" size="xs" />
      {recency.text}
    </span>
  ) : null;
  return (
    <div className="gap-sm border-border flex items-center border-b py-sm last:border-b-0">
      <span className="bg-accent text-muted-foreground flex h-xl w-xl flex-none items-center justify-center rounded-full text-label-md font-bold">
        {contact.name.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        {/* 第三轮 (owner, 2026-09-24): 联系方式图标和天数缩小一号, 跟姓名同一行
            靠右; 第二行整个留给两件事 - 职务在左, 最后联系日期靠右小字。 */}
        <div className="flex items-center justify-between gap-sm">
          <span className="text-body-sm truncate font-bold">{contact.name}</span>
          <span className="flex flex-none items-center gap-sm">
            <ContactChannels mobile={contact.mobile} email={contact.email} wechat={contact.wechat} labels={channelLabels} />
            {recency?.tooltip ? (
              <Tooltip>
                {/* asChild 需要一个能转发 ref 的子节点 - 用 span 包一层。 */}
                <TooltipTrigger asChild>
                  <span className="inline-flex">{recencyTag}</span>
                </TooltipTrigger>
                <TooltipContent>{recency.tooltip}</TooltipContent>
              </Tooltip>
            ) : (
              recencyTag
            )}
            <ContactStatus status={contact.status} labels={statusLabels} />
            {actions}
          </span>
        </div>
        <div className="mt-2xs flex items-center justify-between gap-sm">
          <span className="text-muted-foreground text-body-sm truncate">{contact.title}</span>
          {recency?.date ? (
            <span className="text-muted-foreground flex-none text-[11px] tabular-nums">{recency.date}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ContactRoster({
  contacts,
  canEdit,
  editHref,
  recencyText,
  link,
}: ContactRosterProps) {
  const { ACCOUNT_TEXT, COLLAPSE_TEXT, PANEL_MENU_TEXT, LINK_CONTACT_TEXT } = useMessages();
  const edit = useAccountEdit();
  const [linkSignal, setLinkSignal] = useState(0);
  // Folded: how many people here nobody has reached recently (not warm).
  const coldCount = contacts.filter((c) => recencyText[c.id] && !recencyText[c.id].warm).length;
  const coldSummary =
    coldCount > 0
      ? COLLAPSE_TEXT.contactsCold(coldCount)
      : contacts.length > 0
        ? COLLAPSE_TEXT.contactsAllWarm(contacts.length)
        : COLLAPSE_TEXT.contactsNone;
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? contacts : contacts.slice(0, CAP);

  // tone="raised" - 设计图是全面card化 (owner, 2026-09-20; 理由见
  // org-unit-panel.tsx 同名注释). 没有 description - 去掉所有垃圾说明
  // (owner, 2026-09-20; 理由见 org-unit-panel.tsx 同名注释).
  //
  // 联系人数量简化成一个数字, 挂在标题后面 (owner, 2026-09-21: 把联系人数量
  // （4位联系人），简化为一个数字，tag 放到标题后面) - 撤掉了原来 FilterBar
  // 那一整行"N 位联系人", 完整的那句话退到 title 属性(无障碍朗读/hover)。
  //
  // "新增｜关联" 两个按钮 (owner: 应该有两个按钮), 这次紧凑+靠右, 颜色也
  // 分主次 (owner: 新增，关联，两个操作按钮间距太大了，紧凑一点点-居右。
  // 颜色关联保持，新建淡化。表面这里事关联为主) - "关联"(LinkContactDrawer
  // 自己的触发按钮)维持原样不动; "新增"从一个跟它同等重量的 Button 降级成
  // 纯文字链接, 视觉上让位给"关联"这个这张卡真正想引导的动作, 两者之间的
  // 间距也从按钮的内边距+gap 变成两段文字自己的 gap, 观感上更紧。
  return (
    <>
    <CollapsibleSection summary={coldSummary}
      tone="raised"
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
      id="contacts"
      icon="users"
      title={
        // No count in the title (owner, 2026-09-24): the list below and its
        // 查看全部（N） already say how many - it was said twice.
        <span className="flex flex-wrap items-center gap-2xs">
          <span>{ACCOUNT_TEXT.contactsTitle}</span>
        </span>
      }
      // 新增 / 关联 moved from the title row into this panel's own "⋮"
      // (owner, 2026-09-23). 编辑 opens 客户总编辑 at 联系人管理 - the one
      // place a contact's order and link are managed.
      menu={{
        view: "expand",
        edit: edit?.canWrite
          ? { onSelect: () => edit.open("basics", "contacts") }
          : { hint: PANEL_MENU_TEXT.noEditRight },
        extra: canEdit
          ? [
              { id: "add", label: ACCOUNT_TEXT.contactAddButton, href: editHref },
              ...(link ? [{ id: "link", label: LINK_CONTACT_TEXT.linkButton, onSelect: () => setLinkSignal((n) => n + 1) }] : []),
            ]
          : undefined,
      }}
    >
      {contacts.length === 0 ? (
        <div className="flex flex-col">
          <EmptyState
            title={ACCOUNT_TEXT.contactsNone}
            description={ACCOUNT_TEXT.contactsNoneWhy}
          />
          {!canEdit ? (
            <p className="text-muted-foreground mt-xs text-body-sm">{ACCOUNT_TEXT.contactsDenied}</p>
          ) : null}
        </div>
      ) : (
        // List and 查看全部 are ONE block (owner, 2026-09-24: 上下留白太多):
        // as siblings in the section body each took the body's gap on top of
        // the row padding and the button's own margin.
        <div className="flex flex-col">
        <div className="flex flex-col">
          {/* NO ROW MENU HERE (owner, 2026-09-20: 死死记住设计文件 - mockup
              原话: 栏1的联系人卡片"职责是列出谁是联系人、多久前联系过", 查看
              详情/排序/取消关联的行菜单只出现在"编辑单位信息"里的只读联系人
              卡片上 - "READ-ONLY here...这里能做的只是管理'这个人跟这个客户
              的关系'"). 之前把这个菜单直接建在这张常驻卡上是错的; 同一套外观
              和动词现在原样搬进 contact-management-list.tsx。 */}
          {visible.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              recency={recencyText[c.id]}
              statusLabels={ACCOUNT_TEXT.contactStatusLabel}
              channelLabels={{ mobile: ACCOUNT_TEXT.contactMobile, email: ACCOUNT_TEXT.contactEmail, wechat: ACCOUNT_TEXT.contactWechat }}
            />
          ))}
        </div>
        {contacts.length > CAP ? (
          <Button
            variant="ghost"
            size="sm"
            // Quiet (owner, 2026-09-24): regular weight, muted colour - a way
            // to see more, not an action competing with the names above.
            className="text-muted-foreground hover:text-foreground h-auto w-full justify-center py-2xs font-normal"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? ACCOUNT_TEXT.contactsCollapse : ACCOUNT_TEXT.contactsShowAll(contacts.length)}
          </Button>
        ) : null}
        {!canEdit ? (
          <p className="text-muted-foreground mt-xs text-body-sm">{ACCOUNT_TEXT.contactsDenied}</p>
        ) : null}
        {/* Inside the same block: the footer's own rule and margin separate
            it; the section's gap on top of that was the empty band. */}
        </div>
      )}
    </CollapsibleSection>
    {/* Outside the card: a folded card unmounts its body, and 关联 must
        still open from the menu. The drawer draws no trigger of its own. */}
    {link ? <LinkContactDrawer {...link} openSignal={linkSignal} /> : null}
    </>
  );
}
