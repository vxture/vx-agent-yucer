"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  Button,
  MetricGrid,
  Section,
  StatusBadge,
  type MetricGridItem,
} from "@vxture/design-ui";
import type { HealthResult } from "../../domains/account/lib/health";
import { useMessages } from "../lib/i18n/provider";
import { CARD_VEIL_CLASS, CARD_VEIL_STYLE } from "../lib/card-veil";

// Account health, with its reasons.
//
// The spec says health_score is derived, exists for sorting and alerting, and is
// never the sole basis for a business decision. A panel that showed only the
// number would invite exactly that misuse - so the contributions are rendered
// beside it, and the biggest negative one is called out by name.
//
// "This account is at 34" is not actionable. "No contact for 48 days, one
// overdue instalment, delivery amber" is.

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
}

export function HealthPanel({
  accountId,
  health,
  canRecompute,
  onRecompute,
  statusTag,
}: HealthPanelProps) {
  const { CHAIN_TEXT, healthReasonText, ACCOUNT_ERROR } = useMessages();

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
    trend: healthReasonText(c.reason),
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
        canRecompute ? (
          <Button
            variant="outline"
            size="sm"
            onClick={recompute}
            disabled={pending}
          >
            {CHAIN_TEXT.recompute}
          </Button>
        ) : null
      }
    >
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
    </Section>
  );
}
