"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { ROW_EDGE, SOURCE_CHIP, SOURCE_CHIP_MODEL, type RowTone } from "./deal-tone";
import type { BriefTone } from "../../domains/pipeline/lib/brief";

// One item of 研判与行动 (owner 2026-09-26: 待动手的事和分析与判断合并为一个 -
// 有结论，有分析，有智能化提供的操作引导；按钮轻量化，保留一个 primary，其他淡化).
//
//   line 1  source chip · the CONCLUSION · where it sits (维度 · 指标)   [buttons]
//   line 2  the ANALYSIS - the fact or the judgement behind it; 依据 opens
//           the rows it rests on
//
// Pure presentation: the card that uses it binds its own server action and
// error dictionary (reachable-codes.test.ts pairs at file granularity). The
// buttons are the caller's - one primary, the rest light (see LightButton).

const EDGE: Record<BriefTone, RowTone> = { bad: "bad", warn: "warn", good: "good" };

export function ActionCard({
  severity,
  title,
  reason,
  source = "rule",
  meta,
  evidence,
  children,
}: {
  readonly severity: BriefTone;
  /** The conclusion - what to do. */
  readonly title: string;
  /** The analysis - why, in facts. The reason is not optional: a
   *  recommendation without it is an order. */
  readonly reason: string;
  /** Who is speaking; null for an entry that is nobody's finding. */
  readonly source?: "rule" | "model" | null;
  /** Where it sits: 维度 · 指标. */
  readonly meta?: string;
  /** The rows the analysis rests on, opened in place. */
  readonly evidence?: ReactNode;
  /** One primary button, the rest light. */
  readonly children?: ReactNode;
}) {
  const { RISK_TEXT, JUDGEMENT_ACTION_TEXT } = useMessages();
  const [open, setOpen] = useState(false);
  return (
    <div className={`bg-muted/30 rounded-e-md border-s-[3px] px-md py-xs ${ROW_EDGE[EDGE[severity]]}`}>
      <div className="flex flex-wrap items-center gap-x-sm gap-y-2xs">
        {source ? (
          <span className={source === "model" ? SOURCE_CHIP_MODEL : SOURCE_CHIP}>{RISK_TEXT.source[source]}</span>
        ) : null}
        <span className="text-foreground min-w-0 text-[13px] font-bold">{title}</span>
        {meta ? <span className="text-muted-foreground text-[11px]">{meta}</span> : null}
        {children ? <span className="ml-auto flex flex-none items-center gap-2xs">{children}</span> : null}
      </div>
      <p className="text-muted-foreground mt-3xs text-[12px] leading-relaxed">
        {reason}
        {evidence ? (
          <button
            type="button"
            className="text-primary ml-xs inline-flex items-center gap-3xs hover:underline"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {JUDGEMENT_ACTION_TEXT.evidence}
            <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
          </button>
        ) : null}
      </p>
      {open && evidence ? <div className="mt-xs">{evidence}</div> : null}
    </div>
  );
}

/** A secondary action beside the primary: text only, muted, no frame. */
export const LIGHT_BUTTON = "text-muted-foreground hover:text-foreground h-auto px-xs py-0 font-normal";
