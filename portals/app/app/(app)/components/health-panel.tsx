"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  Button,
  FactList,
  Icon,
  Section,
  StatusBadge,
  type Fact,
} from "@vxture/design-ui";
import type { HealthResult } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";
import { JudgementNote, type Judgement } from "./judgement-note";

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
// 关系证据合并进来了 (owner, 2026-09-21: 梳理全景图中心区域 - 关系证据应该
// 合并进客户评估). 这张卡原来是"评分卡", 关系证据原来是紧挨着的下一张
// "事实卡" - 两张卡都在回答"这段关系怎么样", 合成一张后不再是两次翻页才能
// 看全。
//
// 只留结果, 不留过程 (owner, 2026-09-21: 更多的分析信息应该在下面几个阵地
// 板块细化, 不要堆积在评估, 评估是结果, 不是过程) - 曾经在这里加过"具体是
// 哪几条承诺、哪几条跟进记录"的明细列表, 撤回了: 那些明细本来就已经在阵地
// 清单的"承诺"/"跟进记录"两个 tab 里完整存在, 想看是哪几条, 去阵地清单点开
// 看, 不是在结果卡里再摆一遍。
//
// 8 张卡片还是太多, 继续合并压缩, 不单列"证据"这个标题 (owner, 2026-09-21)
// - 关系证据原本的 4 个数字(跟进条数/对方错过/我方错过/对方守约率)跟健康
// 因子的 4 个数字合在一起是 8 张, 分两行两张 grid 挂一个"关系证据"小标题
// 隔开还是太堆。现在合成一列, 数字本身也再压两个: 跟进条数折进互动时效
// 自己的理由行(反正都是"最近联系得怎样"这一件事), 对方错过折进对方守约率
// 的理由行(同一个数字的两种口径, 没必要各占一行)。剩 6 项, 没有分组标题。
// 我方错过留着独立一项 - 这是"证据不能只算对方的账"那条原则, 折进别的行里
// 会把它变成脚注。
//
// 卡片样子也简化了, 信息密度太差 (owner, 2026-09-21) - MetricGrid 是逐项
// 起卡(有边框、有语气顶缘色条), 6 项排成卡片阵列本身就占地方; 换成
// FactList("右对齐的若干「键 值」", DS 自己的分工说明: 放进已经有卡壳的
// 容器时用它, 不要卡中卡) - 同样的语气着色, 但每项只是一行文字, 不是一张
// 卡, 密度高很多。
//
// 整张卡可收起, 收起后只剩标题行 (owner, 2026-09-21: 客户评估收起来应该收到
// 一行) - Section 本身的 title+action 那一行已经就是"一行", 收起时只是不
// 渲染 children, 不需要另外拼一条摘要行。

export interface HealthEvidence {
  readonly interactionCount: number;
  readonly theyMissed: number;
  readonly weMissed: number;
  /** Null when nothing of theirs has closed yet - a fresh prospect is not a
   *  perfect record. */
  readonly theirKeptRate: number | null;
}

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
  /** Undefined when the reader holds no account.view (same gate the old
   *  standalone 关系证据卡片 checked before this merge). */
  readonly evidence?: HealthEvidence | null;
}

/** value + its trend folded into one string, since Fact has no separate
 *  trend slot the way MetricGridItem did - "12" and "已 48 天没有接触" (or
 *  "0% · 对方错过 2") read as one fact stated at two grains, not two facts. */
function withTrend(value: string, trend?: string): string {
  return trend ? `${value} · ${trend}` : value;
}

/** 对方守约率, with the raw miss count folded into its own value string instead
 *  of a separate row - the two numbers are the same fact at two grains
 *  (owner, 2026-09-21: 继续合并压缩). Shared by HealthPanel's combined list
 *  and RelationshipEvidenceDetail's standalone one below. */
function keptRateFact(evidence: HealthEvidence, FIELD_TEXT: ReturnType<typeof useMessages>["FIELD_TEXT"]): Fact {
  const rate =
    evidence.theirKeptRate === null
      ? FIELD_TEXT.evidenceNoHistory
      : `${Math.round(evidence.theirKeptRate * 100)}%`;
  return {
    label: FIELD_TEXT.evidenceKeptRate,
    value: withTrend(rate, evidence.theyMissed > 0 ? `${FIELD_TEXT.evidenceTheyMissed} ${evidence.theyMissed}` : undefined),
    tone:
      evidence.theirKeptRate === null
        ? "neutral"
        : evidence.theirKeptRate >= 0.7
          ? "success"
          : "danger",
  };
}

/** The merged-in 关系证据 body, for the one path that has no health-factor
 *  list to fold 跟进条数 into (a read-only member with no `health` at all -
 *  see account/[id]/page.tsx's degraded path). Exported so that path does
 *  not keep its own copy of this in sync by hand. HealthPanel itself builds
 *  its own combined list instead of using this - see its own facts below. */
export function RelationshipEvidenceDetail({ evidence }: { readonly evidence: HealthEvidence }) {
  const { FIELD_TEXT } = useMessages();

  const facts: Fact[] = [
    {
      label: FIELD_TEXT.evidenceInteractions,
      value: String(evidence.interactionCount),
      tone: "neutral",
    },
    {
      // Ours sits beside theirs. A panel that only counted the customer's
      // failures would be a case for the defence, not a diagnosis.
      label: FIELD_TEXT.evidenceWeMissed,
      value: String(evidence.weMissed),
      tone: evidence.weMissed > 0 ? "warning" : "neutral",
    },
    keptRateFact(evidence, FIELD_TEXT),
  ];

  return <FactList facts={facts} />;
}

export function HealthPanel({
  accountId,
  health,
  canRecompute,
  onRecompute,
  statusTag,
  judgement,
  evidence,
}: HealthPanelProps) {
  const { CHAIN_TEXT, FIELD_TEXT, healthReasonText, ACCOUNT_ERROR } = useMessages();

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
  };

  const [current, setCurrent] = useState(health);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  function recompute() {
    setError(null);
    startTransition(() => {
      void onRecompute(accountId).then((r) => {
        if (!r.ok) setError(ACCOUNT_ERROR[r.error ?? "denied"] ?? ACCOUNT_ERROR.denied);
        else if (r.score != null) setCurrent({ ...current, score: r.score });
      });
    });
  }

  const factorFacts: Fact[] = current.contributions.map((c) => {
    const isRecency = c.factor === "recency";
    const value = `${c.points > 0 ? "+" : ""}${c.points}`;
    // 商机/交付/回款三个因子不再带理由 (owner, 2026-09-21: 梳理全景图中心
    // 区域 - 这三行的理由跟阵地清单的商机/交付项目/回款三个 tab 是同一批
    // 数据从两个粒度各说一次, 评估只留分数, 明细去阵地清单看). 互动时效
    // 保留理由, 并把跟进条数也折进来 (owner, 2026-09-21: 继续合并压缩) -
    // "已 48 天没有接触"和"12 条跟进记录"是同一件事(联系频率)的两种口径,
    // 分两行说是多余的重复, 折成一句话。
    if (!isRecency) return { label: FACTOR_LABEL[c.factor] ?? c.factor, value, tone: c.points < 0 ? "danger" : "success" };
    const trend = [healthReasonText(c.reason), evidence ? `${FIELD_TEXT.evidenceInteractions} ${evidence.interactionCount}` : null]
      .filter(Boolean)
      .join(" · ");
    return {
      label: FACTOR_LABEL[c.factor] ?? c.factor,
      // The sign is kept. A contribution of -25 read as "25" would invert the
      // meaning of the panel.
      value: withTrend(value, trend),
      tone: c.points < 0 ? "danger" : "success",
    };
  });

  // 我方错过留独立一行, 对方守约率带上错过次数 (owner, 2026-09-21: 继续
  // 合并压缩, 不单列"证据"这个标题) - 8 项压到 6 项, 跟健康因子拼进同一个
  // FactList, 不再单独起一个"关系证据"分组标题。
  const evidenceFacts: Fact[] = evidence
    ? [
        {
          // Ours sits beside theirs. A panel that only counted the customer's
          // failures would be a case for the defence, not a diagnosis.
          label: FIELD_TEXT.evidenceWeMissed,
          value: String(evidence.weMissed),
          tone: evidence.weMissed > 0 ? "warning" : "neutral",
        },
        keptRateFact(evidence, FIELD_TEXT),
      ]
    : [];

  const facts = [...factorFacts, ...evidenceFacts];

  // tone="raised" - 设计图是全面card化 (owner, 2026-09-20; 理由见
  // org-unit-panel.tsx 同名注释). 没有 description - 去掉所有垃圾说明
  // (owner, 2026-09-20; 理由见 org-unit-panel.tsx 同名注释).
  return (
    <Section
      tone="raised"
      style={CARD_VEIL_STYLE} className={CARD_VEIL_CLASS}
      title={
        <span className="gap-xs flex flex-wrap items-center">
          <span>{CHAIN_TEXT.healthTitle}</span>
          {statusTag}
        </span>
      }
      action={
        <span className="gap-xs flex items-center">
          {canRecompute ? (
            <Button
              variant="outline"
              size="sm"
              onClick={recompute}
              disabled={pending}
            >
              {CHAIN_TEXT.recompute}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={expanded}
            aria-label={expanded ? CHAIN_TEXT.collapse : CHAIN_TEXT.expand}
            title={expanded ? CHAIN_TEXT.collapse : CHAIN_TEXT.expand}
            onClick={() => setExpanded((v) => !v)}
          >
            <Icon name={expanded ? "chevron-up" : "chevron-down"} size="sm" />
          </Button>
        </span>
      }
    >
      {expanded ? (
        <>
          {judgement ? <JudgementNote judgement={judgement} /> : null}

          {/* 卡片正文不再重复分数/首要问题 (owner, 2026-09-20: 设计图严格对齐 -
              mockup 自己删过一次同样的重复, 注释原话"首要问题：1 笔回款逾期"
              删掉了) - header 的健康评估维度(RingGauge)现在就是分数本身, 有首要
              问题时环旁边直接换成问题文字, 这张卡再放一遍分数和首要问题是对同一
              件事说两遍。error 仍然留着 - 那是这次点击"重新评估"才可能出现的新
              事实, header 不会有。 */}
          {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}

          {/* FactList, not MetricGrid (owner, 2026-09-21: 8 张卡片还是太多,
              继续合并压缩, 不单列"证据"这个标题; 卡片样子也简化, 信息密度
              太差) - 关系证据的数字并进了这一份列表, 不再分两个区块、中间
              夹一条"关系证据"小标题; 每项是一行文字, 不是一张带边框的卡,
              6 行占的地方比原来两个 4 卡 grid 小得多。 */}
          <FactList facts={facts} />
        </>
      ) : null}
    </Section>
  );
}
