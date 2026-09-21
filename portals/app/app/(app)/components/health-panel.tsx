"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  Button,
  Icon,
  MetricGrid,
  Section,
  StatusBadge,
  type IconName,
  type MetricGridItem,
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
// 合并进客户评估, 可以展开收起, 要详细信息, 不是几个数字). 这张卡原来是
// "评分卡", 关系证据原来是紧挨着的下一张"事实卡" - 两张卡都在回答"这段关系
// 怎么样", 只是一张给分数一张给计数, 合成一张后不再是两次翻页才能看全。
// 详细信息不是几个数字: 对方错过/我方错过不再只是计数, 挂着具体是哪几条
// 承诺、错在哪天; 跟进条数挂着最近几条的实际内容, 不是空数字。
//
// 整张卡可收起, 收起后只剩标题行 (owner, 2026-09-21: 客户评估收起来应该收到
// 一行) - Section 本身的 title+action 那一行已经就是"一行", 收起时只是不
// 渲染 children, 不需要另外拼一条摘要行。

export interface HealthEvidenceItem {
  readonly id: string;
  readonly statement: string;
  readonly dueAt: Date;
}

export interface HealthEvidenceInteraction {
  readonly id: string;
  readonly occurredAt: Date;
  readonly channel: string;
  readonly rawNote: string;
}

export interface HealthEvidence {
  readonly interactionCount: number;
  /** Most recent first, already capped by the caller - this panel does not
   *  decide how many count as "recent". */
  readonly recentInteractions: readonly HealthEvidenceInteraction[];
  readonly theyMissed: number;
  readonly missedByThem: readonly HealthEvidenceItem[];
  readonly weMissed: number;
  readonly missedByUs: readonly HealthEvidenceItem[];
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

const CHANNEL_ICON: Record<string, IconName> = {
  meeting: "users",
  call: "phone",
  visit: "map-pin",
  email: "mail",
  im: "chat-circle",
  event: "calendar",
  other: "file-text",
};

/** The merged-in 关系证据 body - no title of its own, so it can sit inside
 *  HealthPanel's single card (a `<p>` label is enough there) or, for a
 *  read-only member with no `health` at all, inside its own small Section
 *  in account/[id]/page.tsx's degraded path. Exported so that second caller
 *  does not have to keep its own copy in sync with this one. */
export function RelationshipEvidenceDetail({ evidence }: { readonly evidence: HealthEvidence }) {
  const { FIELD_TEXT, CHANNEL_LABEL } = useMessages();

  const evidenceItems: MetricGridItem[] = [
    {
      id: "interactions",
      label: FIELD_TEXT.evidenceInteractions,
      value: String(evidence.interactionCount),
      tone: "neutral",
    },
    {
      id: "they-missed",
      label: FIELD_TEXT.evidenceTheyMissed,
      value: String(evidence.theyMissed),
      tone: evidence.theyMissed > 0 ? "danger" : "neutral",
    },
    {
      id: "we-missed",
      // Ours sits beside theirs. A panel that only counted the customer's
      // failures would be a case for the defence, not a diagnosis.
      label: FIELD_TEXT.evidenceWeMissed,
      value: String(evidence.weMissed),
      tone: evidence.weMissed > 0 ? "warning" : "neutral",
    },
    {
      id: "kept-rate",
      label: FIELD_TEXT.evidenceKeptRate,
      // Null stays null. A relationship with no history is not a perfect one.
      value:
        evidence.theirKeptRate === null
          ? FIELD_TEXT.evidenceNoHistory
          : `${Math.round(evidence.theirKeptRate * 100)}%`,
      tone:
        evidence.theirKeptRate === null
          ? "neutral"
          : evidence.theirKeptRate >= 0.7
            ? "success"
            : "danger",
    },
  ];

  const dateText = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-sm">
      <MetricGrid items={evidenceItems} columns={2} />

      {/* 详细信息, 不是几个数字 (owner, 2026-09-21) - 错过的具体是哪几条
          承诺、错在哪天, 而不是只有"2"这个数字。最多列 3 条, 其余的去阵地
          清单的"承诺" tab 看全部 - 这里是解释这个数字, 不是复刻那张清单。 */}
      {evidence.missedByThem.length > 0 ? (
        <div className="flex flex-col gap-2xs">
          <span className="text-muted-foreground text-body-sm">{FIELD_TEXT.evidenceTheyMissed}</span>
          {evidence.missedByThem.slice(0, 3).map((c) => (
            <div key={c.id} className="text-body-sm flex items-center gap-xs">
              <Icon name="warning" size="xs" className="text-destructive shrink-0" />
              <span className="min-w-0 truncate">{c.statement}</span>
              <span className="text-muted-foreground shrink-0 whitespace-nowrap tabular-nums">{dateText(c.dueAt)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {evidence.missedByUs.length > 0 ? (
        <div className="flex flex-col gap-2xs">
          <span className="text-muted-foreground text-body-sm">{FIELD_TEXT.evidenceWeMissed}</span>
          {evidence.missedByUs.slice(0, 3).map((c) => (
            <div key={c.id} className="text-body-sm flex items-center gap-xs">
              <Icon name="warning" size="xs" className="text-warning shrink-0" />
              <span className="min-w-0 truncate">{c.statement}</span>
              <span className="text-muted-foreground shrink-0 whitespace-nowrap tabular-nums">{dateText(c.dueAt)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {evidence.recentInteractions.length > 0 ? (
        <div className="flex flex-col gap-2xs">
          <span className="text-muted-foreground text-body-sm">{FIELD_TEXT.evidenceInteractions}</span>
          {evidence.recentInteractions.map((i) => (
            <div key={i.id} className="text-body-sm flex items-start gap-xs">
              <Icon name={CHANNEL_ICON[i.channel] ?? "file-text"} size="xs" className="text-muted-foreground mt-[0.1875rem] shrink-0" />
              <span className="text-muted-foreground shrink-0 whitespace-nowrap tabular-nums">{dateText(i.occurredAt)}</span>
              <span className="min-w-0 truncate">{CHANNEL_LABEL[i.channel] ?? i.channel} · {i.rawNote}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
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

  const items: MetricGridItem[] = current.contributions.map((c) => ({
    id: c.factor,
    label: FACTOR_LABEL[c.factor] ?? c.factor,
    // The sign is kept. A contribution of -25 read as "25" would invert the
    // meaning of the panel.
    value: `${c.points > 0 ? "+" : ""}${c.points}`,
    // 商机/交付/回款三个因子不再带理由行 (owner, 2026-09-21: 梳理全景图中心
    // 区域 - 这三行的理由跟阵地清单的商机/交付项目/回款三个 tab 是同一批
    // 数据从两个粒度各说一次, 评分卡只留分数, 明细去阵地清单看). 互动时效
    // 保留理由 - 关系证据的"最近接触"卡片撤掉了, 这一条现在是唯一还在讲
    // 这件事的地方, 不能也删。
    trend: c.factor === "recency" ? healthReasonText(c.reason) : undefined,
    tone: c.points < 0 ? "danger" : "success",
  }));

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

          {/* columns={4} (owner, 2026-09-20: 设计图严格对齐, mockup 一行四个) -
              之前锁在 2 列的理由(注释见 git 历史)是三栏布局下这一栏只有 768px
              宽度; 现在栏3已经并入栏2、只剩两栏 (owner: 严格按照设计实施 - 栏3
              还有2个), 同一栏拿到的宽度变了, 实测见下方验证记录, 若变窄的场景
              下又被压扁, 需要重新回到 2 列并说明测量数据。 */}
          <MetricGrid items={items} columns={4} />

          {evidence ? (
            <div className="border-border mt-md flex flex-col gap-sm border-t pt-md">
              <p className="text-muted-foreground text-label-md">{FIELD_TEXT.evidenceTitle}</p>
              <RelationshipEvidenceDetail evidence={evidence} />
            </div>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}
