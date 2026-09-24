"use client";

import { useState } from "react";
import { Icon } from "@vxture/design-ui";
import { StaleMark } from "./stale-mark";
import { SourceMark } from "./source-mark";
import { CitationList } from "./citation-list";
import type { Citation } from "../../domains/judgement/lib/judgement";
import type { Freshness } from "../../domains/account/lib/evidence-quality";

// 定向自动分析, 可展开收起 (owner, 2026-09-21: 判定信息应该移到客户评估板块，
// 并提供展开收起功能，收起只有一行). 抽成独立文件而不是留在 health-panel.tsx
// 内部, 是因为它有两个消费者: HealthPanel 自己(有 health 时), 以及 page.tsx
// 里"只读成员没有 health"的退化路径(状态标签仍要显示, 判定同理) - 两处需要
// 完全一样的展开/收起行为, 抽出来才不会长成两份互相漂移的实现。
export interface Judgement {
  readonly claim: string;
  readonly rule: string | null;
  /** L2 batch seven - shown beside the claim when its evidence is old. */
  readonly freshness?: Freshness | null;
  /** Rule-computed or model-inferred (YC-021 L5) - always shown. */
  readonly source: "rule" | "model";
  /** 判断到证据跳转 (YC-021 底座) - the rows the claim rests on, opened in place. */
  readonly citations?: readonly Citation[];
}

export function JudgementNote({ judgement }: { readonly judgement: Judgement }) {
  const [open, setOpen] = useState(false);
  const citations = judgement.citations ?? [];
  // The header is the button; the evidence is NOT inside it. A <button> may
  // hold phrasing content only, and a list of quoted notes is not that.
  // ONE SLIM LINE (owner, 2026-09-24: 【规则】独占一行, 排版很差劲). Chevron,
  // source mark, the claim and the stale mark share one row, on a left-edged
  // strip like the risk rows below - not a bordered block. Opened, the rule's
  // trigger condition and the cited rows follow underneath.
  return (
    <div className="border-s-primary bg-primary/5 rounded-e-md border-s-[3px] px-md py-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-sm text-left"
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size="sm" className="text-muted-foreground shrink-0" />
        <span className="shrink-0">
          <SourceMark source={judgement.source} />
        </span>
        <span className={`min-w-0 flex-1 text-body-sm font-medium ${open ? "" : "truncate"}`}>{judgement.claim}</span>
        {judgement.freshness?.stale ? (
          <span className="shrink-0">
            <StaleMark freshness={judgement.freshness} />
          </span>
        ) : null}
      </button>
      {open && judgement.rule ? (
        <p className="text-muted-foreground mt-xs ps-lg text-body-sm">{judgement.rule}</p>
      ) : null}
      {open && citations.length > 0 ? (
        <div className="mt-sm ps-lg">
          <CitationList citations={citations} />
        </div>
      ) : null}
    </div>
  );
}
