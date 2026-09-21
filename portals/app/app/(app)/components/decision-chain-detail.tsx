"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SegmentedControl,
  Section,
  StatusBadge,
  type IconName,
} from "@vxture/design-ui";
import type { ChainCoverage, ChainRecency, ContactNode } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";
import { DecisionChainGraph, ROLE_ORDER } from "./decision-chain-graph";
import { Tag } from "./tag";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";

// 决策角色 -> 图标 (owner, 2026-09-21: 决策角色在名称后用 tag(icon+文字) 体现).
// 全部走中性色(Tag 默认 tone="neutral") - 这一行已经有一个真正带颜色语义的
// StatusBadge(可达/未触达), 角色本身是身份分类, 不是状态, 跟 tag.tsx 文件
// 自己的规则一致("中性 tag 不该被随手上色去抢一个真正状态徽章的注意力")。
const ROLE_ICON: Record<string, IconName> = {
  economic: "wallet",
  technical: "settings",
  user: "user",
  coach: "lightbulb",
  blocker: "shield-warning",
};

// 决策链详情视图 (owner, 2026-09-20: 设计图严格对齐 - 先做，别再等我确认).
//
// account-detail 专用, 不跟 decision-chain.tsx 共用: 那个组件还被 pipeline
// 详情页复用, 这里的表格/图谱切换、角色行、返回按钮是 mockup 给"点开一条
// 决策链摘要"这个交互专门画的一套, 硬塞进共用组件会把 pipeline 页也一起
// 改样子。
//
// 每一行读的是真实数据, 没有编的部分: 联系证据文案(mockup demo 里"12 天前
// 电话联系过, 讨论验收里程碑的付款节点"这种叙事句子)在真实数据模型里没有
// 对应字段 - ContactNode 只有 decisionRole/influence/status, 域模型里也没有
// 一张"谁在哪次跟进里说了什么"的表可以拼出这句话。改用 chainRecency 已经在
// 算的 warm/cold/unrecorded 三态作为每行的展开细节, 是同一件"这个人多久没
// 联系"的事实的诚实版本, 不是接近版本。

export interface DecisionChainDetailProps {
  readonly title: string;
  readonly coverage: ChainCoverage;
  readonly people: readonly ContactNode[];
  readonly contacts: readonly { id: string; name: string; title: string | null }[];
  /** Null when the recency read failed - the table still renders, just
   *  without the per-row "上次联系" line. */
  readonly recency: ChainRecency | null;
  /** Only the first chain on the page carries this - see account/[id]/page.tsx. */
  readonly linkForm?: React.ReactNode;
}

/** 纯内容组件, 没有"返回"按钮 - 那个按钮要改 Context 里的 activeId, 所以
 *  归 decision-chain-switch.tsx 的 ChainDetailSlot 管，这里只管这条链自己
 *  的展示。 */
export function DecisionChainDetail({
  title,
  coverage,
  people,
  contacts,
  recency,
  linkForm,
}: DecisionChainDetailProps) {
  const { CHAIN_TEXT, RECENCY_TEXT, DECISION_ROLE_LABEL } = useMessages();
  const [view, setView] = useState<"table" | "graph">("table");

  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.name ?? id;
  const titleOf = (id: string) => contacts.find((c) => c.id === id)?.title ?? null;

  // 联系证据 - 真实数据: 这个人在 warm/cold/unrecorded 哪一桶里, 不是编的
  // 叙事句子 (见文件头注释)。
  const recencyLineFor = (id: string): string | null => {
    if (!recency) return null;
    if (recency.warm.some((c) => c.id === id)) return RECENCY_TEXT.warm(recency.windowDays);
    if (recency.cold.some((c) => c.id === id)) return RECENCY_TEXT.cold(recency.windowDays);
    if (recency.unrecorded.some((c) => c.id === id)) return RECENCY_TEXT.unrecorded;
    return null;
  };

  const rows = ROLE_ORDER.map((role) => people.find((p) => p.decisionRole === role))
    .filter((p): p is ContactNode => p != null);

  // 可达/未触达标记不止经济决策人有 (owner, 2026-09-20: 设计图严格对齐 -
  // 技术决策人、阻碍者也各自带一个). 内线(coach)不带 - 这个角色本来就是靠
  // "跟我们有联系"才成立的, 再标一次可达是同一件事说两遍。经济决策人继续用
  // coverage.economicBuyerUnreachable (经由内线走到他的路径是否存在, 比"这个
  // 人本身最近有没有联系"更严格的事实); 其余角色用 recency 的 warm/非warm -
  // 同一份 chainRecency 数据, 不是新算的。
  const isReachable = (p: ContactNode): boolean | null => {
    if (p.decisionRole === "coach") return null;
    if (p.decisionRole === "economic") return !coverage.economicBuyerUnreachable;
    if (!recency) return null;
    if (recency.warm.some((c) => c.id === p.id)) return true;
    if (recency.cold.some((c) => c.id === p.id) || recency.unrecorded.some((c) => c.id === p.id)) return false;
    return null;
  };

  return (
    <div className="flex flex-col gap-lg">
      <Section
        tone="raised"
        style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
        // 标题行整合 (owner, 2026-09-21: 决策链展开页面信息应该整合一下 -
        // 标题内容丰富: 决策链 · 商机名 + 两个 tag, 居右切换按钮). 之前
        // "决策链"(卡头) / 商机名(body 里单独一行加粗文字) / 覆盖率(卡头
        // action, 纯文字) / 可达状态(body 里单独一行, 跟切换按钮并排) 是
        // 四处分散的信息, `title` prop 本身早就是 CHAIN_TEXT.forDeal 拼好
        // 的"决策链 · 全国门店数字化"(page.tsx 传进来的), 却只在 body 里
        // 又写了一遍, 卡头自己还留着通用的"决策链"三个字 - 两处都在说同一
        // 件事。现在卡头的 title 就是这条完整的字符串, 两个状态各自收成一个
        // tag 跟在它后面, 不再另起一行。
        title={
          <span className="gap-xs flex flex-wrap items-center">
            <span className="whitespace-nowrap">{title}</span>
            {coverage.economicBuyerUnreachable ? (
              <StatusBadge tone="danger" dot>
                {rows.some((p) => p.decisionRole === "economic")
                  ? CHAIN_TEXT.unreachable
                  : CHAIN_TEXT.noEconomicBuyer}
              </StatusBadge>
            ) : (
              <StatusBadge tone="success" dot>
                {CHAIN_TEXT.reachable}
              </StatusBadge>
            )}
            <Tag>{CHAIN_TEXT.coverageCount(coverage.covered.length, ROLE_ORDER.length)}</Tag>
          </span>
        }
        // 表格/图谱切换挪到卡头右侧的 action 位, 不再跟可达状态挤在 body 的
        // 同一行 - 这也是 health-panel.tsx"重新评估"按钮已经在用的位置。
        action={
          <SegmentedControl
            items={[
              { value: "table", label: CHAIN_TEXT.viewTable },
              { value: "graph", label: CHAIN_TEXT.viewGraph },
            ]}
            value={view}
            onChange={setView}
          />
        }
      >
        <div className="flex flex-col gap-md">
          {view === "table" ? (
            <div className="flex flex-col">
              {rows.map((p) => {
                const detail = recencyLineFor(p.id);
                const reachable = isReachable(p);
                const row = (
                  <div className="gap-sm border-border flex items-center border-b py-sm last:border-b-0">
                    {/* 徽标表示人，不是角色 (owner, 2026-09-21) - 跟 sidebar
                        联系人卡片(contact-roster.tsx 的 ContactCard)同一个
                        "姓氏圆圈"惯例, 不是角色首字。这一行本来就是照那张卡
                        画的("卡片行, 不是表格行" - 文件头注释), 头像语义
                        也该跟那张卡一致。 */}
                    <span className="bg-accent text-muted-foreground flex h-xl w-xl flex-none items-center justify-center rounded-full text-label-md font-bold">
                      {nameOf(p.id).charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* 姓名放大 + 决策角色紧跟其后的 tag(icon+文字) + 重要度
                          (owner, 2026-09-21: 姓名标题文字放大；决策角色在
                          名称后用tag体现，后面跟重要度) - 角色不再单独占一
                          整行文字, 跟姓名同一行更紧凑, 也不再跟徽标重复说
                          同一件事。 */}
                      <div className="gap-xs flex flex-wrap items-center">
                        <span className="text-body-md font-bold">{nameOf(p.id)}</span>
                        <Tag icon={ROLE_ICON[p.decisionRole]}>{DECISION_ROLE_LABEL[p.decisionRole] ?? p.decisionRole}</Tag>
                        {/* 影响力是真实字段 (ContactNode.influence,
                            buying-role-form.tsx 可写) - decision-chain.tsx
                            早就在用同一句式(`(影响力 N)`), 这里只是把它接到
                            角色 tag 后面, 不是新造一个概念。 */}
                        {p.influence != null ? (
                          <span className="text-muted-foreground text-body-sm">
                            {CHAIN_TEXT.influence} {p.influence}
                          </span>
                        ) : null}
                      </div>
                      {/* 职务放到第二行 (owner, 2026-09-21) - 跟姓名分开,
                          不再挤在同一行的括号里。 */}
                      {titleOf(p.id) ? (
                        <div className="text-muted-foreground text-body-sm">{titleOf(p.id)}</div>
                      ) : null}
                    </div>
                    {reachable != null ? (
                      <StatusBadge tone={reachable ? "success" : "danger"}>
                        {reachable ? CHAIN_TEXT.reachFlagYes : CHAIN_TEXT.reachFlagNo}
                      </StatusBadge>
                    ) : null}
                  </div>
                );
                if (!detail) return <div key={p.id}>{row}</div>;
                return (
                  <Collapsible key={p.id}>
                    <CollapsibleTrigger asChild>
                      <button type="button" className="w-full text-left">
                        {row}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <p className="text-muted-foreground bg-accent rounded-sm px-sm py-2xs text-body-sm">{detail}</p>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          ) : (
            <DecisionChainGraph coverage={coverage} people={people} contacts={contacts} />
          )}
        </div>
      </Section>

      {linkForm}
    </div>
  );
}
