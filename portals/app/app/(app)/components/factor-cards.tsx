"use client";

import { TruncatedText } from "./truncated-text";

// One row of light factor cards - figure | (name / note). Lifted out of
// health-panel.tsx (owner, 2026-09-24: 尽量单行略高的card) so the deal page's
// 态势判决 renders the same card as the customer page's 客户评估 (owner,
// 2026-09-25: 应该按照card方式，参考客户详情页): the customer page sums all
// deals into a health score, the deal page shows one deal's own numbers.

export type FactorTone = "severe" | "mild" | "none" | "good";

const EDGE: Record<FactorTone, string> = {
  severe: "border-t-destructive",
  mild: "border-t-warning-border",
  none: "border-t-border",
  good: "border-t-(color:--success-text)",
};
const INK: Record<FactorTone, string> = {
  severe: "text-destructive-text",
  mild: "text-(color:--warning-text)",
  none: "text-foreground",
  good: "text-success-text",
};

export interface FactorCardItem {
  readonly id: string;
  readonly label: string;
  /** One line, smallest type, cut with an ellipsis; the whole text on hover. */
  readonly note: string;
  /** The figure, already signed or scaled by the caller. */
  readonly value: string;
  /** A small suffix after the figure ("/20"), muted. */
  readonly unit?: string;
  readonly tone: FactorTone;
}

export function FactorCards({ items }: { readonly items: readonly FactorCardItem[] }) {
  return (
    <div className={`grid gap-sm ${items.length === 4 ? "grid-cols-4" : "grid-cols-5"}`}>
      {items.map((it) => (
        <div
          key={it.id}
          className={`flex min-w-0 items-center gap-sm rounded-md border border-t-2 border-border bg-card/60 px-sm py-xs ${EDGE[it.tone]}`}
        >
          <span className={`text-heading-4 shrink-0 ${INK[it.tone]}`}>
            {it.value}
            {it.unit ? <span className="text-muted-foreground text-[0.6875rem] font-normal">{it.unit}</span> : null}
          </span>
          <span className="flex min-w-0 flex-col">
            <TruncatedText text={it.label} className="text-foreground truncate text-body-sm font-medium" />
            <TruncatedText text={it.note} className="text-muted-foreground truncate text-[0.6875rem] leading-tight" />
          </span>
        </div>
      ))}
    </div>
  );
}
