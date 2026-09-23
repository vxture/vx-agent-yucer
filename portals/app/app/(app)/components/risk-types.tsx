"use client";

import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import type { RiskLevel, RiskTypeResult } from "../../domains/account/lib/risk-types";

// 风险分型 (YC-021 L5): the five risk types side by side, each with what it
// rests on and who to go to. Inside the assessment card, under the factors -
// the same facts regrouped by who can act on them, not a new card.

const LEVEL_TONE: Record<RiskLevel, "danger" | "warning" | "success" | "neutral"> = {
  risk: "danger",
  watch: "warning",
  clear: "success",
  unknown: "neutral",
};

// The row's left edge carries the level (owner, 2026-09-24: 只带左边线的轻量
// 表格, 信息展开, 松散布局) - the tag says it in words, the edge lets the eye
// run down five rows and see where the trouble is.
const LEVEL_EDGE: Record<RiskLevel, string> = {
  risk: "border-s-destructive-border",
  watch: "border-s-warning-border",
  clear: "border-s-success-border",
  unknown: "border-s-border",
};

export function RiskTypes({ risks }: { readonly risks: readonly RiskTypeResult[] }) {
  const { RISK_TEXT, healthReasonText } = useMessages();
  return (
    <div className="flex flex-col gap-xs">
      <span className="text-muted-foreground text-label-sm font-bold">{RISK_TEXT.title}</span>
      {/* SPREAD ACROSS THE WIDTH (owner, 2026-09-24: 现在堆积在左侧, 右侧全部
          空的). Three columns per row - what and how bad | what it rests on,
          one finding per line | who to go to, right-aligned - so the row
          reads left to right as a sentence and nothing piles up at the left. */}
      {risks.map((r) => {
        const acting = r.level === "risk" || r.level === "watch";
        return (
          <div
            key={r.type}
            className={`grid grid-cols-[7.5rem_1fr_auto] items-center gap-x-lg rounded-e-md border-s-[3px] bg-muted/30 px-md py-sm text-body-sm ${LEVEL_EDGE[r.level]}`}
          >
            <span className="flex items-center gap-sm">
              <span className="font-bold">{RISK_TEXT.type[r.type]}</span>
              <Tag tone={LEVEL_TONE[r.level]}>{RISK_TEXT.level[r.level]}</Tag>
            </span>
            <span className="text-muted-foreground flex min-w-0 flex-col gap-3xs">
              {r.findings.length === 0 ? (
                <span>{RISK_TEXT.noFinding(r.level)}</span>
              ) : (
                r.findings.map((f, i) => (
                  <span key={i}>{f.code === "renewal" ? healthReasonText(f.reason) : RISK_TEXT.finding(f)}</span>
                ))
              )}
            </span>
            <span className="flex flex-col items-end text-right whitespace-nowrap">
              {acting ? (
                <>
                  <span className="text-foreground font-bold">{r.who.name ?? RISK_TEXT.whoUnassigned}</span>
                  <span className="text-muted-foreground text-label-sm">{RISK_TEXT.role[r.who.role]}</span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
