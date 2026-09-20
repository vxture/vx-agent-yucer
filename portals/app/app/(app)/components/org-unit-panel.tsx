"use client";

import type { ReactNode } from "react";
import { DetailList, DetailRow, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AccountParentPanel, type AccountParentPanelProps } from "./account-parent-panel";
import { AccountChildPanel } from "./account-child-panel";

// 单位信息 (owner, 2026-09-18: 客户详情页重排; 2026-09-20: 行业/区域从
// header 搬到这里 - 严格按照设计实施, mockup 原话: "行业、位置这些是固有属性，
// 属于栏1的档案，不是header该扛的身份信息"). 上级 + 下级 + 固有属性，同一张
// 图的三部分。
//
// tone="raised" (owner, 2026-09-20: 设计图是全面card化) - Section 的默认
// tone 不带边框/底色, 只靠留白分层 (`绝大多数板块用这个` - Section 自己的
// 文档注释); mockup 把客户详情页的每一块都画成实体卡片 (`.card { border;
// background; border-radius }`), 这一页因此改用 raised, 不是给整个产品的
// 默认值动手 - 别的模块继续用 default 是它们自己的决定, 不受这页影响。
//
// THE PARENT HALF IS NOT NEW. AccountParentPanel has read the fact and written
// it (incr/0025) since batch 6c; this only moves it inside a titled card next
// to its other half instead of floating above the grid on its own row.
//
// THE CHILD HALF NEEDS NO NEW READ. Every other account's parentId is already
// in the same accountRows list AccountParentPanel's own picker excludes a
// subtree from - filtering it by parentId === this account IS "who reports to
// me", so a second query would only duplicate a read the page already makes.
export function OrgUnitPanel({
  children,
  accountId,
  parentId,
  parentName,
  accounts,
  canWrite,
  onSetParent,
  industry,
  region,
  editForm,
}: AccountParentPanelProps & {
  readonly children: readonly { id: string; name: string }[];
  readonly industry: string | null;
  readonly region: string | null;
  /** AccountBasicsForm, built server-side in page.tsx and mounted here as the
   *  card's own action - same "server builds it, client just mounts it"
   *  pattern linkForm has used all along (owner, 2026-09-20: 编辑单位信息 -
   *  this card's own edit trigger, not a header ··· menu - see
   *  designate-account.tsx's own note on why a header button beats a shared
   *  menu here). Optional: absent for a read-only member. */
  readonly editForm?: ReactNode;
}) {
  const { ACCOUNT_TEXT } = useMessages();
  // 没有 description (owner, 2026-09-20: 去掉所有垃圾说明) - 这是每天用的
  // 系统, 标题下面常驻一句"这张卡是干什么的"是写给第一次打开的人看的, 不是
  // 写给天天开这个页面的销售看的; mockup 的卡头本来也只有标题。
  return (
    <Section
      tone="raised"
      icon="buildings"
      title={ACCOUNT_TEXT.orgUnitTitle}
      action={editForm}
    >
      <div className="flex flex-col gap-sm">
        {industry || region ? (
          <DetailList>
            {industry ? <DetailRow label={ACCOUNT_TEXT.orgUnitIndustry}>{industry}</DetailRow> : null}
            {region ? <DetailRow label={ACCOUNT_TEXT.orgUnitRegion}>{region}</DetailRow> : null}
          </DetailList>
        ) : null}
        <AccountParentPanel
          accountId={accountId}
          parentId={parentId}
          parentName={parentName}
          accounts={accounts}
          canWrite={canWrite}
          onSetParent={onSetParent}
        />
        <AccountChildPanel
          accountId={accountId}
          children={children}
          accounts={accounts}
          canWrite={canWrite}
          onSetParent={onSetParent}
        />
      </div>
    </Section>
  );
}
