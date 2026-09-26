"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@vxture/design-ui";
import { StaleMark } from "./stale-mark";
import { SourceMark } from "./source-mark";
import { CitationList } from "./citation-list";
import type { Citation } from "../../domains/judgement/lib/judgement";
import type { Freshness } from "../../domains/account/lib/evidence-quality";

// 定向自动分析, 可展开收起 (owner, 2026-09-21: 收起只有一行). The customer
// page no longer uses it - its judgements joined the 风险分型 lanes
// (owner, 2026-09-24; see risk-types.tsx). position-brief.tsx still does, and
// `Judgement` is the shape both carry.
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

export function JudgementNote({
  judgement,
  actions,
}: {
  readonly judgement: Judgement;
  /** What can be done with it, at the end of its line (the deal page's
   *  采纳 / 重新分析 / 忽略); absent elsewhere. */
  readonly actions?: ReactNode;
}) {
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
      <div className="flex items-center gap-sm">
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
      {actions ? <span className="flex flex-none items-center gap-2xs">{actions}</span> : null}
      </div>
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
