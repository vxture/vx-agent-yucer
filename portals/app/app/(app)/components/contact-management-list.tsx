"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, useToast, type ActionMenuItem } from "@vxture/design-ui";
import { moveItems, RowActions } from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";
import { ContactCard, type ContactRow } from "./contact-roster";
import type { MoveDirection } from "../../domains/shared/ordering";

// 客户联系人 (owner, 2026-09-20: 死死记住设计文件 - mockup 把"查看详情/排序/
// 取消关联"这个行菜单放在"编辑单位信息"里自己的一张只读联系人卡片上, 不是
// 栏1那张常驻卡。mockup 原话:
//   "READ-ONLY here (owner: 联系人显示为只读显示模式，不能这里修改) - 编辑
//   一个人自己的信息去他自己的页面...这里能做的只是管理'这个人跟这个客户的
//   关系' - 查看详情/排序/取消关联，收进每行自己的 ··· 菜单"
// 和编辑页里区分开的理由:
//   "客户联系人(对方的人) vs 销售负责人(我方的人), 不是笼统的'联系人'"
//
// 这里的行外观(avatar+两行+recency+channels)跟栏1的 ContactRoster 完全一样 -
// 直接复用它的 ContactCard, 不重新画一遍; 唯一的区别是这里带 actions, 那边
// 不带。查看详情/排序四元组/取消关联这三个动词也原样从 ContactRoster 搬过来,
// 服务端动词(moveContactAction/unlinkContactAction)完全没变。
export interface ContactManagementListProps {
  readonly accountId: string;
  readonly contacts: readonly ContactRow[];
  readonly canEdit: boolean;
  readonly editHref: string;
  readonly onMove?: (
    accountId: string,
    contactId: string,
    direction: MoveDirection,
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onUnlink?: (
    accountId: string,
    contactId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly recencyText: Readonly<Record<string, { text: string; warm: boolean }>>;
  /** LinkContactDrawer, same "+新增｜关联" pair as the 栏1 card - mockup draws
   *  both header buttons here too (line 1178-1179), not just on 栏1's card. */
  readonly linkForm?: ReactNode;
}

export function ContactManagementList({
  accountId,
  contacts,
  canEdit,
  editHref,
  onMove,
  onUnlink,
  recencyText,
  linkForm,
}: ContactManagementListProps) {
  const { ACCOUNT_TEXT, LINK_CONTACT_TEXT, ROW_OPS, ACCOUNT_ERROR } = useMessages();
  const { toast } = useToast();
  const router = useRouter();
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

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between gap-sm">
        <h4 className="text-body-sm font-bold">{ACCOUNT_TEXT.contactsTitle}</h4>
        {canEdit ? (
          <span className="flex items-center gap-xs">
            <Button asChild variant="ghost" size="sm">
              <a href={editHref}>{ACCOUNT_TEXT.contactAddButton}</a>
            </Button>
            {linkForm}
          </span>
        ) : null}
      </div>

      {contacts.length === 0 ? (
        <EmptyState title={ACCOUNT_TEXT.contactsNone} description={ACCOUNT_TEXT.contactsNoneWhy} />
      ) : (
        <div className="flex flex-col">
          {contacts.map((c, index) => {
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
      )}

      {!canEdit ? (
        <p className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.contactsDenied}</p>
      ) : null}
    </div>
  );
}
