"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DetailList, DetailRow, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";

// 单位信息 (owner, 2026-09-18: 客户详情页重排; 2026-09-20 三轮调整):
//
// 第一轮 - 行业/区域从 header 搬到这里 (严格按照设计实施, mockup 原话:
// "行业、位置这些是固有属性，属于栏1的档案，不是header该扛的身份信息")。
//
// 第二轮 - PURE DISPLAY ONLY (死死记住设计文件 - 之前这张卡上摆了"+关联
// 上级公司"/"+关联下级单位"两个按钮，是错的). mockup 的原话在
// scratchpad/account-detail-v2-wrapped.html 里: "上级公司: shown ONLY when
// one exists...the whole row (and its own change-button) is absent...a
// dossier card states facts, it does not carry an empty-state CTA for every
// fact that could exist" - 下级单位同一条规则。编辑上下级关系的入口在
// account-header-menu.tsx 的共享"···"菜单里，不在这张只读卡片上。
//
// 第三轮 - 整张"客户信息卡"并入这里 (owner: 把中部第一块-客户信息卡，整合
// 进sidebar-第一板块=单位信息), 随后 owner 又纠正了一版细节 (补充意见):
//   - 卡头只留 icon + title 两项 - 状态标签是"动态评估", 跟客户级别/健康
//     评估同一类, 搬去内容区(客户评估卡自己的卡头), 不留在这张纯静态事实
//     的卡上。
//   - "···"菜单(定级/计划、编辑单位信息)以及销售负责人自己的编辑按钮,
//     一起被 owner 叫停 - "你是否还没理解展示/编辑拆解的意图?" - 三个分散
//     的编辑入口合并成一个"客户总编辑", 挪到侧栏顶部的功能条(返回、收起/
//     展开、客户总编辑), 这张卡因此彻底没有任何编辑触发器, 纯展示。
//   - "定向自动分析"判断题横幅原样搬进这张卡的最下方, ACC-0001+销售负责人
//     的纯文本事实(不带编辑按钮了)搬进卡身。
// 这几块都还是 page.tsx 建好的 ReactNode 原样传进来 - 跟 editForm/linkForm
// 一直以来的"服务端建好, 客户端只管挂载"是同一个模式, 数据和动词完全没变,
// 只是把它们在 DOM 里的落点换成了这张卡(或者侧栏顶部的功能条)。
//
// 卡片标题现在是"客户简称", 不是"单位信息"这个通用词 (owner: 把客户简称
// 直接作为卡片标题). account 表目前没有 shortName 这一列 - 早先
// account-basics-form.tsx 就把"客户简称"记在"智能采集"跳过清单里, 不是这次
// 布局调整能补的缺口 - 暂时退回显示 account.name, 真正加这一列是另一件事
// (DDL 增量), 不在这次范围内。
//
// tone="raised" (owner, 2026-09-20: 设计图是全面card化) - Section 的默认
// tone 不带边框/底色, 只靠留白分层; mockup 把客户详情页的每一块都画成实体
// 卡片, 这一页因此改用 raised。
export interface OrgUnitPanelProps {
  /** account.shortName ?? account.name - see the file-level note on why the
   *  fallback exists (no shortName column yet). */
  readonly title: string;
  /** ACC-0001 · 销售负责人 {name} - PLAIN TEXT now, no edit trigger (owner:
   *  展示/编辑拆解 - 三个分散的编辑入口合并进侧栏顶部的"客户总编辑", 这张
   *  卡不再有任何编辑触发器). Relocated content, unchanged data. */
  readonly ownerRow: ReactNode;
  /** 开放商机 / 客户级别 / 健康评估, stacked - unchanged content, relocated
   *  from ViewHeader's action slot. No more flex-wrap/max-width juggling
   *  needed here: this card is always sidebar-narrow now, never sharing a
   *  row with a title fighting it for space. */
  readonly dimensions: ReactNode;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly children: readonly { id: string; name: string }[];
  readonly industry: string | null;
  readonly region: string | null;
  /** account.customerNatureId resolved to a name - the id/vocab read already
   *  existed for the edit form's dropdown, this is the first time it is
   *  shown as a read fact (owner: 补充 - 性质). */
  readonly customerNatureName: string | null;
  /** Same story as customerNatureName, for account.customerTypeId (owner:
   *  补充 - 类型). */
  readonly customerTypeName: string | null;
  /** account.province only (owner: 补充 - 地址需要显示到省级-市级) - there is
   *  no city column on this table yet, so this shows only what the schema
   *  actually has. Absent when unset, same "no empty-state fact" rule as
   *  industry/region. */
  readonly province: string | null;
  /** 定向自动分析 - the single highest-urgency rule judgement about this
   *  account, if the rules engine fired one. Relocated here from its own
   *  banner between the old header and content (owner: 判断题放sidebar). */
  readonly judgement?: { readonly claim: string; readonly rule: string | null } | null;
}

export function OrgUnitPanel({
  title,
  ownerRow,
  dimensions,
  parentId,
  parentName,
  children,
  industry,
  region,
  customerNatureName,
  customerTypeName,
  province,
  judgement,
}: OrgUnitPanelProps) {
  const { ACCOUNT_TEXT, ACCOUNT_PARENT_TEXT } = useMessages();
  return (
    <Section
      tone="raised"
      icon="buildings"
      title={title}
      style={CARD_VEIL_STYLE}
      className={CARD_VEIL_CLASS}
    >
      <div className="flex flex-col gap-md">
        {ownerRow}
        {dimensions}
        {industry || region || customerNatureName || customerTypeName || province || parentName ? (
          <DetailList>
            {customerNatureName ? <DetailRow label={ACCOUNT_TEXT.orgUnitNature}>{customerNatureName}</DetailRow> : null}
            {region ? <DetailRow label={ACCOUNT_TEXT.orgUnitRegion}>{region}</DetailRow> : null}
            {customerTypeName ? <DetailRow label={ACCOUNT_TEXT.orgUnitType}>{customerTypeName}</DetailRow> : null}
            {industry ? <DetailRow label={ACCOUNT_TEXT.orgUnitIndustry}>{industry}</DetailRow> : null}
            {province ? <DetailRow label={ACCOUNT_TEXT.orgUnitAddress}>{province}</DetailRow> : null}
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
        {judgement ? (
          <div className="border-primary/30 bg-primary/5 flex items-start gap-sm rounded-lg border p-md">
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium">{judgement.claim}</p>
              {judgement.rule ? (
                <p className="text-muted-foreground mt-2xs text-body-sm">{judgement.rule}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
