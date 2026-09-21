"use client";

import Link from "next/link";
import { DetailList, DetailRow, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_STYLE } from "../lib/card-veil";

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
// PURE DISPLAY ONLY (owner, 2026-09-20: 死死记住设计文件 - 之前这张卡上摆了
// "+关联上级公司"/"+关联下级单位"两个按钮，是错的). mockup 的原话在
// scratchpad/account-detail-v2-wrapped.html 里: "上级公司: shown ONLY when
// one exists...the whole row (and its own change-button) is absent...a
// dossier card states facts, it does not carry an empty-state CTA for every
// fact that could exist" - 下级单位同一条规则, 只在 count > 0 时显示,
// 也没有按钮。编辑上下级关系的入口现在在 org-relations-editor.tsx 里，挂在
// account-header-menu.tsx 的共享"···"菜单里，不在这张只读卡片上。
//
// 销售负责人不在这张卡上 (owner: mockup 把"销售负责人 王涛"放在 header 第二
// 行，跟 ACC-0001 并列，不是单位信息的一个字段) - 见 page.tsx 的 header。
//
// 这张卡的卡头暂时没有 action - mockup 原话是这个位置本该是"收起档案栏"
// (整个栏1的折叠开关, `toggleCol1()`), 不是编辑入口; 那是一个独立的、还没
// 建的功能(折叠整个栏1), 不属于这次 header 修正的范围, 留给下一轮检查。
export function OrgUnitPanel({
  parentId,
  parentName,
  children,
  industry,
  region,
}: {
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly children: readonly { id: string; name: string }[];
  readonly industry: string | null;
  readonly region: string | null;
}) {
  const { ACCOUNT_TEXT, ACCOUNT_PARENT_TEXT } = useMessages();
  // 没有 description (owner, 2026-09-20: 去掉所有垃圾说明) - 这是每天用的
  // 系统, 标题下面常驻一句"这张卡是干什么的"是写给第一次打开的人看的, 不是
  // 写给天天开这个页面的销售看的; mockup 的卡头本来也只有标题。
  return (
    <Section
      tone="raised"
      icon="buildings"
      title={ACCOUNT_TEXT.orgUnitTitle}
      style={CARD_VEIL_STYLE}
    >
      <div className="flex flex-col gap-sm">
        {industry || region || parentName ? (
          <DetailList>
            {industry ? <DetailRow label={ACCOUNT_TEXT.orgUnitIndustry}>{industry}</DetailRow> : null}
            {region ? <DetailRow label={ACCOUNT_TEXT.orgUnitRegion}>{region}</DetailRow> : null}
            {parentName ? (
              <DetailRow label={ACCOUNT_PARENT_TEXT.label}>
                <Link href={`/account/${parentId}`} className="hover:underline">{parentName}</Link>
              </DetailRow>
            ) : null}
          </DetailList>
        ) : null}
        {children.length > 0 ? (
          <div className="flex flex-col gap-2xs">
            <span className="text-muted-foreground text-body-sm">
              {ACCOUNT_TEXT.orgUnitChildren(children.length)}
            </span>
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/account/${c.id}`}
                className="text-body-sm hover:underline"
              >
                {c.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
