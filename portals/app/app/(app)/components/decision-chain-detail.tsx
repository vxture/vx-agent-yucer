"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SegmentedControl,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import type { ChainCoverage, ChainRecency, ContactNode } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";
import { DecisionChainGraph, ROLE_ORDER } from "./decision-chain-graph";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";

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
        title={CHAIN_TEXT.title}
        action={<span className="text-muted-foreground text-body-sm">{CHAIN_TEXT.coverageCount(coverage.covered.length, ROLE_ORDER.length)}</span>}
      >
        <div className="flex flex-col gap-md">
          <div className="text-body-sm font-bold">{title}</div>

          <div className="flex items-center justify-between gap-sm">
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

            <SegmentedControl
              items={[
                { value: "table", label: CHAIN_TEXT.viewTable },
                { value: "graph", label: CHAIN_TEXT.viewGraph },
              ]}
              value={view}
              onChange={setView}
            />
          </div>

          {view === "table" ? (
            <div className="flex flex-col">
              {rows.map((p) => {
                const detail = recencyLineFor(p.id);
                const reachable = isReachable(p);
                const row = (
                  <div className="gap-sm border-border flex items-center border-b py-sm last:border-b-0">
                    <span
                      className={`flex h-md w-md flex-none items-center justify-center rounded-sm text-label-sm font-bold ${
                        p.decisionRole === "economic"
                          ? "bg-primary-muted text-primary-text"
                          : p.decisionRole === "blocker"
                            ? "bg-destructive-muted text-destructive-text"
                            : "bg-accent text-muted-foreground"
                      }`}
                    >
                      {/* 角色徽标的一个字, 从字典里的角色全名取第一个字符 -
                          不是另建一张硬编码的中文表 (TD-002 containment: 组件
                          文件里不能直接写字面中文, 拼装出来的不算). */}
                      {(DECISION_ROLE_LABEL[p.decisionRole] ?? p.decisionRole).charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-bold">
                        {nameOf(p.id)}
                        {/* 影响力是真实字段 (ContactNode.influence, buying-role-form.tsx
                            可写) - decision-chain.tsx 早就在用同一句式 (`(影响力 N)`),
                            这里只是把它接到详情视图的姓名行, 不是新造一个概念。 */}
                        {titleOf(p.id) || p.influence != null ? (
                          <span className="text-muted-foreground ml-2xs font-normal">
                            {[titleOf(p.id), p.influence != null ? `${CHAIN_TEXT.influence} ${p.influence}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-muted-foreground text-body-sm">{DECISION_ROLE_LABEL[p.decisionRole] ?? p.decisionRole}</div>
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
