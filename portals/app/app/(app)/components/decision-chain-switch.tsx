"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button, EmptyState, Icon, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 决策链主从视图 (owner, 2026-09-20: 设计图严格对齐 - 先做，别再等我确认).
//
// 栏1 只放一行摘要, 点开在栏2 展开详情, 跟 mockup 的"决策链: LIST FORMAT
// now"一致。栏1 和栏2 是 page.tsx 里的两个兄弟 div, 状态得提到共同的父级
// 才能让栏1 的点击改变栏2 的内容 - Context 是这里最小的做法, 不用把
// 两栏本身也拆成一个大组件。
//
// 内容(detail 节点)在服务端就已经渲染好, 通过 props 一路传进来的 - 这个
// 文件本身只决定"现在该显示哪一个", 不重新拿数据、不重新渲染 DecisionChain
// 那一整套, 跟 linkForm 早就在用的"服务端建好元素, 客户端组件只管挂载"是
// 同一个模式。

export interface ChainSummaryItem {
  readonly id: string;
  readonly title: string;
  readonly coveredCount: number;
  readonly totalRoles: number;
  readonly reachable: boolean;
  readonly hasEconomicBuyer: boolean;
  /** 未触达阻碍者的真实人数 - 来自 recency 数据里"这个阻碍者是否在 warm
   *  名单里", 不是编的。0 时摘要行不提阻碍者。 */
  readonly unreachedBlockers: number;
  readonly detail: ReactNode;
}

interface ChainViewState {
  readonly chains: readonly ChainSummaryItem[];
  readonly activeId: string | null;
  readonly setActiveId: (id: string | null) => void;
}

const ChainViewContext = createContext<ChainViewState | null>(null);

export function ChainViewProvider({
  chains,
  children,
}: {
  readonly chains: readonly ChainSummaryItem[];
  readonly children: ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  return (
    <ChainViewContext.Provider value={{ chains, activeId, setActiveId }}>
      {children}
    </ChainViewContext.Provider>
  );
}

function useChainView(): ChainViewState {
  const ctx = useContext(ChainViewContext);
  if (!ctx) throw new Error("useChainView must be used inside ChainViewProvider");
  return ctx;
}

const CAP = 3;

/** 栏1: 摘要列表, 跟 contact-roster.tsx 同一套截断惯例 (cap=3, 查看全部/收起). */
export function ChainSummaryList({
  emptyTitle,
  emptyDescription,
}: {
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}) {
  const { CHAIN_TEXT } = useMessages();
  const { chains, setActiveId } = useChainView();
  const [expanded, setExpanded] = useState(false);

  if (chains.length === 0) {
    return (
      <Section tone="raised" title={CHAIN_TEXT.title}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Section>
    );
  }

  const visible = expanded ? chains : chains.slice(0, CAP);

  return (
    <Section tone="raised" title={CHAIN_TEXT.title}>
      <div className="flex flex-col">
        {visible.map((c) => {
          const reachSummary = c.reachable
            ? CHAIN_TEXT.reachable
            : c.hasEconomicBuyer
              ? CHAIN_TEXT.unreachable
              : CHAIN_TEXT.noEconomicBuyer;
          const suffix = c.unreachedBlockers > 0 ? ` · ${CHAIN_TEXT.blockersUnreached(c.unreachedBlockers)}` : "";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className="gap-sm border-border hover:bg-accent flex items-center border-b py-sm text-left last:border-b-0"
            >
              <span className="bg-primary-muted text-primary-text flex h-lg w-lg flex-none items-center justify-center rounded-full">
                <Icon name="graph" size="sm" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm truncate font-bold">{c.title}</span>
                  <span className="text-muted-foreground text-body-sm whitespace-nowrap">
                    {c.coveredCount}/{c.totalRoles}
                  </span>
                </div>
                <div className="text-muted-foreground truncate text-body-sm">
                  {reachSummary}
                  {suffix}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {chains.length > CAP ? (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((v) => !v)}>
          {expanded ? CHAIN_TEXT.collapseChains : CHAIN_TEXT.showAllChains(chains.length)}
        </Button>
      ) : null}
    </Section>
  );
}

/** 栏2: lifecycle 视图和某一条链的详情视图二选一, 从不同时出现 (owner:
 *  决策链展示时健康拆解也去除 - the chain detail gets the column's full
 *  attention). 返回按钮长在这里, 不在 DecisionChainDetail 里 - 那个按钮要
 *  改 activeId, 只有摸得到 Context 的这一层能做。 */
export function ChainDetailSlot({ lifecycle }: { readonly lifecycle: ReactNode }) {
  const { CHAIN_TEXT } = useMessages();
  const { chains, activeId, setActiveId } = useChainView();
  const active = chains.find((c) => c.id === activeId);
  if (!active) return <>{lifecycle}</>;
  return (
    <div className="flex flex-col gap-lg">
      <Button variant="ghost" size="sm" onClick={() => setActiveId(null)} className="self-start">
        <Icon name="chevron-left" size="sm" />
        {CHAIN_TEXT.detailBack}
      </Button>
      {active.detail}
    </div>
  );
}
