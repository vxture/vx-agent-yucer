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

export function RiskTypes({ risks }: { readonly risks: readonly RiskTypeResult[] }) {
  const { RISK_TEXT, healthReasonText } = useMessages();
  return (
    <div className="flex flex-col gap-2xs">
      <span className="text-muted-foreground text-label-sm font-bold">{RISK_TEXT.title}</span>
      {risks.map((r) => (
        <div key={r.type} className="border-border grid grid-cols-[4rem_auto_1fr] items-start gap-sm border-b py-2xs text-body-sm last:border-b-0">
          <span className="font-bold">{RISK_TEXT.type[r.type]}</span>
          <Tag tone={LEVEL_TONE[r.level]}>{RISK_TEXT.level[r.level]}</Tag>
          <span className="flex flex-col gap-3xs">
            <span className="text-muted-foreground">
              {r.findings.length === 0
                ? RISK_TEXT.noFinding(r.level)
                : r.findings
                    .map((f) => (f.code === "renewal" ? healthReasonText(f.reason) : RISK_TEXT.finding(f)))
                    .join(RISK_TEXT.separator)}
            </span>
            {r.level === "risk" || r.level === "watch" ? (
              <span>{RISK_TEXT.who(RISK_TEXT.role[r.who.role], r.who.name)}</span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
