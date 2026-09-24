"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  StatusBadge,
} from "@vxture/design-ui";
import type { HealthResult } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import type { PeerBenchmark } from "../../domains/account/lib/benchmark";
import type { ChangeAttribution } from "../../domains/account/lib/health-history";
import { RiskTypes } from "./risk-types";
import type { RiskTypeResult } from "../../domains/account/lib/risk-types";
import { JudgementNote, type Judgement } from "./judgement-note";
import { CapBadge, CapFooter, LayerLabel } from "./panorama-annotations";
import { CollapsibleSection } from "./collapsible-section";

// Account health, with its reasons.
//
// The spec says health_score is derived, exists for sorting and alerting, and is
// never the sole basis for a business decision. A panel that showed only the
// number would invite exactly that misuse - so the contributions are rendered
// beside it, and the biggest negative one is called out by name.
//
// "This account is at 34" is not actionable. "No contact for 48 days, one
// overdue instalment, delivery amber" is.
//
// 关系证据不再合并进这张卡 (owner, 2026-09-21: 几轮"太堆/太简"来回之后 -
// 这种细节考虑放到 AI 板块去, 作为智能分析提醒) - 跟进条数/对方错过/我方
// 错过/对方守约率这类过程性证据, 归属是智能助手栏的规则判断("华东零售集团
// 在商务谈判阶段停了 48 天, 对方答应的事没兑现"这条 judgement 本身就是从
// 承诺/接触记录算出来的), 不是评估卡该展示的原始数字。评估卡回到只有健康
// 因子分数的样子。
//
// 整张卡可收起, 收起后只剩标题行 (owner, 2026-09-21: 客户评估收起来应该收到
// 一行) - Section 本身的 title+action 那一行已经就是"一行", 收起时只是不
// 渲染 children, 不需要另外拼一条摘要行。

export interface HealthPanelProps {
  readonly accountId: string;
  readonly health: HealthResult;
  readonly canRecompute: boolean;
  readonly onRecompute: (
    accountId: string,
  ) => Promise<{ ok: boolean; score?: number; error?: string }>;
  /** 活跃/流失等账户状态 (owner, 2026-09-20: 补充 - status tag 是"动态评估",
   *  跟客户级别/健康评估同一类, 不属于纯展示的单位信息卡, 搬来这张卡的
   *  header - 这里已经是内容区第一张卡, 也是"评估类"信息的自然落点). 单位
   *  信息卡(org-unit-panel.tsx)现在头部只剩 icon+title, 不再带这个标签。 */
  readonly statusTag: ReactNode;
  /** 定向自动分析 - the single highest-urgency rule judgement about this
   *  account, if the rules engine fired one (owner, 2026-09-21: 判定信息
   *  移到客户评估板块 - 之前挂在单位信息卡最下方, 跟评估类信息本来就该在
   *  一起, 也是这张卡重新规整时腾出的空间). Collapsible, collapsed to one
   *  line (owner: 提供展开收起功能，收起只有一行) - see judgement-note.tsx
   *  for the shared implementation (this panel is not its only consumer). */
  readonly judgement?: Judgement | null;
  /** 同类对标 (YC-021 L5) - this score among same-industry same-size peers. */
  readonly benchmark?: PeerBenchmark | null;
  /** 变化归因 (YC-021 L5) - what moved since the last different recorded score. */
  readonly change?: ChangeAttribution | null;
  /** 风险分型 (YC-021 L5) - five types, what each rests on, who to go to. */
  readonly risks?: readonly RiskTypeResult[] | null;
}

type FactorTone = "danger" | "neutral" | "success";
const FACTOR_EDGE: Record<FactorTone, string> = {
  danger: "border-t-destructive",
  neutral: "border-t-border",
  success: "border-t-(color:--success-text)",
};
const FACTOR_INK: Record<FactorTone, string> = {
  danger: "text-destructive-text",
  neutral: "text-foreground",
  success: "text-success-text",
};

export function HealthPanel({
  accountId,
  health,
  canRecompute,
  onRecompute,
  statusTag,
  judgement,
  benchmark,
  change,
  risks,
}: HealthPanelProps) {
  const { ACCOUNT_TEXT, CHAIN_TEXT, healthReasonText, ACCOUNT_ERROR, COLLAPSE_TEXT, PANEL_MENU_TEXT } = useMessages();

  // INSIDE the component, not at module scope. It was a module constant, which
  // reads as the cheaper thing to do - build the map once - and is wrong the
  // moment the labels come from a dictionary: a module constant is evaluated
  // when the file is imported, so it would freeze whichever locale happened to
  // load first and hand every later reader that one.
  const FACTOR_LABEL: Record<string, string> = {
    pipeline: CHAIN_TEXT.factorPipeline,
    recency: CHAIN_TEXT.factorRecency,
    delivery: CHAIN_TEXT.factorDelivery,
    collections: CHAIN_TEXT.factorCollections,
    renewal: CHAIN_TEXT.factorRenewal,
  };

  const router = useRouter();
  const [current, setCurrent] = useState(health);
  // The server re-derives on refresh; follow it, so the factors and the top
  // issue move with the score (YC-021 L5 - a recomputed number beside the old
  // breakdown contradicted its own factors).
  useEffect(() => setCurrent(health), [health]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function recompute() {
    setError(null);
    startTransition(() => {
      void onRecompute(accountId).then((r) => {
        if (!r.ok) setError(ACCOUNT_ERROR[r.error ?? "denied"] ?? ACCOUNT_ERROR.denied);
        else {
          if (r.score != null) setCurrent({ ...current, score: r.score });
          router.refresh();
        }
      });
    });
  }

  const items = current.contributions.map((c) => ({
    id: c.factor,
    // The card's own short label: five cards share ~60px of text width, and
    // 互动时效 truncated to 互动... - the other four are two characters too.
    // The full name stays in 依据 / 变化 below.
    label: c.factor === "recency" ? CHAIN_TEXT.factorRecencyShort : (FACTOR_LABEL[c.factor] ?? c.factor),
    // The sign is kept. A contribution of -25 read as "25" would invert the
    // meaning of the panel.
    value: `${c.points > 0 ? "+" : ""}${c.points}`,
    // 商机/交付/回款三个因子不再带理由行 (owner, 2026-09-21: 梳理全景图中心
    // 区域 - 这三行的理由跟阵地清单的商机/交付项目/回款三个 tab 是同一批
    // 数据从两个粒度各说一次, 评分卡只留分数, 明细去阵地清单看). 互动时效
    // 保留理由 - 这一条现在是唯一还在讲联系频率这件事的地方, 不能也删。
    // 续约也带理由行 (L4 批三): 它的依据是合同通知期与续约结果, 阵地清单里
    // 没有哪一个 tab 替它把"为什么扣分"讲出来。0 分时也要有理由 - "没有合同"
    // 和"未进入窗口"是两句不同的话 (业务规则 §5: 不跳过)。
    // The reasons left the cards (polish, 2026-09-24): at five columns the
    // trend pill cut "已 48 天没有接触" off mid-word and a description wrapped
    // over five lines. They are the 依据 row under the grid now.
    tone: (c.points < 0 ? "danger" : c.points === 0 ? "neutral" : "success") as FactorTone,
  }));

  // 依据: the two factors whose number needs its reason - how long the silence
  // is, and what the renewal is waiting on (the other three have their own
  // tabs in the roster).
  const reasons = current.contributions
    .filter((c) => c.factor === "recency" || c.factor === "renewal")
    .map((c) => ({ label: FACTOR_LABEL[c.factor] ?? c.factor, text: healthReasonText(c.reason) }));

  // Folded: the score and, when there is one, the single worst factor.
  const concern = current.primaryConcern;
  const collapsedSummary = [
    COLLAPSE_TEXT.health(current.score),
    concern && concern.points < 0 ? COLLAPSE_TEXT.concern(healthReasonText(concern.reason)) : null,
  ]
    .filter(Boolean)
    .join(COLLAPSE_TEXT.separator);

  // tone="raised" - 设计图是全面card化 (owner, 2026-09-20; 理由见
  // org-unit-panel.tsx 同名注释). 没有 description - 去掉所有垃圾说明
  // (owner, 2026-09-20; 理由见 org-unit-panel.tsx 同名注释).
  return (
    // Folding is the shared CollapsibleSection now (owner, 2026-09-23) - its
    // own toggle used to leave the header divider and an empty band behind.
    <CollapsibleSection
      summary={collapsedSummary}
      // Every panel title carries its icon (owner, 2026-09-23: 客户评估标题
      // 没有 icon) - gauge, because this card IS a score.
      icon="gauge"
      tone="raised"
      style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
      title={
        <span className="gap-xs flex flex-wrap items-center">
          <span>{CHAIN_TEXT.healthTitle}</span>
          <LayerLabel layer="L5" />
          <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge>
          {statusTag}
        </span>
      }
      // This panel's own "⋮" (owner, 2026-09-23): the score is derived, so
      // 编辑 is greyed with the reason, and 重新评估 moved here from the
      // title row.
      menu={{
        view: "expand",
        edit: { hint: PANEL_MENU_TEXT.derived },
        extra: canRecompute
          ? [
              pending
                ? { id: "recompute", label: CHAIN_TEXT.recompute, hint: CHAIN_TEXT.recompute }
                : { id: "recompute", label: CHAIN_TEXT.recompute, onSelect: recompute },
            ]
          : undefined,
      }}
    >
        <>
          {judgement ? <JudgementNote judgement={judgement} /> : null}

          {/* 卡片正文不再重复分数/首要问题 (owner, 2026-09-20: 设计图严格对齐 -
              mockup 自己删过一次同样的重复, 注释原话"首要问题：1 笔回款逾期"
              删掉了) - header 的健康评估维度(RingGauge)现在就是分数本身, 有首要
              问题时环旁边直接换成问题文字, 这张卡再放一遍分数和首要问题是对同一
              件事说两遍。error 仍然留着 - 那是这次点击"重新评估"才可能出现的新
              事实, header 不会有。 */}
          {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

          {/* ONE ROW OF FIVE LIGHT CARDS (owner, 2026-09-24: 太重太浪费空间, 继续
              使用card, 尽量单行略高的card). The DS MetricGrid cards carry a
              title-xl figure, a watermark chart and generous padding - ~90px
              tall for a two-character label and a signed number. Each card
              is now one line: label left, score right, the tone on its top
              edge and in the figure. */}
          <div className="grid grid-cols-5 gap-sm">
            {items.map((it) => (
              <div
                key={it.id}
                className={`flex items-center justify-between gap-xs rounded-md border border-t-2 border-border bg-card/60 px-sm py-sm ${FACTOR_EDGE[it.tone]}`}
              >
                <span className="text-muted-foreground truncate text-body-sm">{it.label}</span>
                <span className={`text-heading-4 ${FACTOR_INK[it.tone]}`}>{it.value}</span>
              </div>
            ))}
          </div>
          {/* 变化 + 对标 as labelled rows, in the same label column as 风险分型
              below - they were two unlabelled grey sentences floating under
              the grid. */}
          {(change && change.moved.length > 0) || benchmark || reasons.length > 0 ? (
            <dl className="grid grid-cols-[4rem_1fr] gap-x-sm gap-y-xs text-body-sm">
              {reasons.length > 0 ? (
                <>
                  <dt className="font-bold">{CHAIN_TEXT.reasonLabel}</dt>
                  <dd className="text-muted-foreground">
                    {reasons.map((r) => CHAIN_TEXT.reasonItem(r.label, r.text)).join(CHAIN_TEXT.changeSeparator)}
                  </dd>
                </>
              ) : null}
              {change && change.moved.length > 0 ? (
                <>
                  <dt className="font-bold">{CHAIN_TEXT.changeLabel}</dt>
                  <dd className="flex flex-wrap items-baseline gap-x-sm gap-y-3xs">
                    {/* 变化归因: "为什么从 58 掉到 34" - biggest move first. */}
                    <span className="text-muted-foreground">
                      {CHAIN_TEXT.changeSince(change.fromScore, change.toScore, change.since.toISOString().slice(0, 10))}
                    </span>
                    {change.moved.map((m) => (
                      <span key={m.factor} className={m.delta < 0 ? "text-destructive-text" : "text-success-text"}>
                        {CHAIN_TEXT.changeFactor(FACTOR_LABEL[m.factor] ?? m.factor, m.delta)}
                      </span>
                    ))}
                  </dd>
                </>
              ) : null}
              {benchmark ? (
                <>
                  <dt className="font-bold">{CHAIN_TEXT.benchmarkLabel}</dt>
                  {/* 同类对标: a number only when the peer group is big enough. */}
                  <dd className="text-muted-foreground">{ACCOUNT_TEXT.benchmark(benchmark)}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {risks && risks.length > 0 ? <RiskTypes risks={risks} /> : null}
          <CapFooter>
            <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capHealthBasic}
            <br />
            <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capHealthPro}
          </CapFooter>
        </>
    </CollapsibleSection>
  );
}
