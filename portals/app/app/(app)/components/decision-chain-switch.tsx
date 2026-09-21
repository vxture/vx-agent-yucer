"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  EmptyState,
  Icon,
  Section,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { PageCrumbs } from "./page-crumbs";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";

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

/** Exported (owner, 2026-09-20: mockup's deal card links to "本商机的决策链")
 *  so account-lifecycle.tsx's DealLifecyclePanel can jump a deal row straight
 *  to its own chain's detail view instead of only 栏1's summary list being
 *  able to open one. */
export function useChainView(): ChainViewState {
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
      <Section tone="raised" icon="graph" style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS} title={CHAIN_TEXT.title}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Section>
    );
  }

  const visible = expanded ? chains : chains.slice(0, CAP);

  return (
    <Section tone="raised" icon="graph" style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS} title={CHAIN_TEXT.title}>
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

/** 面包屑行, 跟 AccountHeaderMenu 共用一行的左半边 (owner, 2026-09-21: 决策链
 *  打开有，顶部有面包屑，增加了一个返回，两个同位置重复。严重设计失误...
 *  只能有一行) - 之前 page.tsx 在栏2 顶部渲染 PageCrumbs("←"+客户管理>客户
 *  名), 打开一条链之后 ChainDetailSlot 又长出自己的一个"← 返回全链条内容",
 *  两行都在同一个位置、都指向"往上一级", 读起来像同一个控件坏成了两份。
 *
 *  拆成独立组件而不是塞进 ChainDetailSlot, 是因为面包屑这一行右边还并排着
 *  "客户总编辑"按钮(page.tsx 建的, 跟决策链是否打开无关) - 这个组件只决定
 *  左半边显示什么, 右边的按钮不受影响、两种状态下都在。
 *
 *  没有打开链时原样输出 PageCrumbs; 打开一条链时换成同一套面包屑样式的
 *  ONE行 - 账户名从"当前页"降级成一段可点的面包屑, 链标题变成新的"当前页",
 *  最左边那个箭头(以及账户名字那一段)点了都是关掉这条链的详情
 *  (setActiveId(null)), 跟 PageCrumbs 自己"←指向紧邻上一级"的规则完全一致,
 *  只是这时"紧邻上一级"从"/account 列表页"变成"这个账户自己的默认视图" -
 *  导航方式也就从页面跳转变成关掉一个本地状态, 不是发明一种新的返回语义。 */
export function ChainCrumbs({
  trail,
  current,
}: {
  /** PageCrumbs 原来直接收的两个 prop, 原样转交 - 没有打开链时这个组件只是
   *  PageCrumbs 的一层透传。 */
  readonly trail: readonly { readonly label: string; readonly href: string }[];
  readonly current: string;
}) {
  const { CHAIN_TEXT } = useMessages();
  const { chains, activeId, setActiveId } = useChainView();
  const active = chains.find((c) => c.id === activeId);
  if (!active) return <PageCrumbs trail={trail} current={current} />;
  return (
    <div className="gap-2xs flex items-center">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={CHAIN_TEXT.detailBack}
        onClick={() => setActiveId(null)}
      >
        <Icon name="arrow-left" size="sm" />
      </Button>
      <Breadcrumb>
        <BreadcrumbList>
          {trail.map((step) => (
            <BreadcrumbItem key={step.href}>
              <BreadcrumbLink asChild>
                <Link href={step.href}>{step.label}</Link>
              </BreadcrumbLink>
              <BreadcrumbSeparator />
            </BreadcrumbItem>
          ))}
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" onClick={() => setActiveId(null)}>
                {current}
              </button>
            </BreadcrumbLink>
            <BreadcrumbSeparator />
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbPage>{active.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

/** 栏2 正文: lifecycle 视图和某一条链的详情视图二选一, 从不同时出现 (owner:
 *  决策链展示时健康拆解也去除 - the chain detail gets the column's full
 *  attention). 不再自己长一个返回按钮 - 那个按钮现在是 ChainCrumbs 那一行
 *  唯一的返回入口, 这里只负责切内容。 */
export function ChainDetailSlot({ lifecycle }: { readonly lifecycle: ReactNode }) {
  const { chains, activeId } = useChainView();
  const active = chains.find((c) => c.id === activeId);
  if (!active) return <>{lifecycle}</>;
  return active.detail;
}
