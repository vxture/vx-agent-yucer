"use client";

import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
import { Tag } from "./tag";
import { useMessages } from "../lib/i18n/provider";
import type { StrategyAdoptionRead } from "../lib/strategy-adoption-read";
import { strategyAdoptionStatus } from "../../domains/planning/strategy-adoption";
import type { StrategyView } from "../lib/market-strategy";
import styles from "./strategy-charter-card.module.css";
import { planningHref } from "../lib/planning-workspace";
import links from "./business-reference.module.css";

export function StrategyAdoptionTag({ plan, adoption }: { readonly plan: StrategyView; readonly adoption: StrategyAdoptionRead }) {
  const { STRATEGY_CARD_TEXT: T, PLANNING_COMMITMENT_TEXT: C } = useMessages();
  const state = adoption.state === "ready" ? strategyAdoptionStatus(plan, adoption.rows) : adoption.state;
  const rows = adoption.state === "ready" ? adoption.rows.filter(r => r.lineageId === (plan.lineageId ?? plan.id)) : [];
  const pendingTone = ["pending", "previous"].includes(state) ? "warning" : "neutral";
  const tone = state === "accepted" ? "success" : pendingTone;
  const years = [...new Set(rows.filter(r => r.strategyId === plan.id && r.state === "current").map(r => r.year))].sort((a, b) => a - b);
  const extraYears = years.length > 1 ? ` +${years.length - 1}` : "";
  const yearLabel = years.length ? `Y${years[0]}${extraYears} ` : "";
  return <Tooltip>
    <TooltipTrigger className="inline-flex min-w-0 max-w-full" data-strategy-adoption={state}>
      <Tag tone={tone}>{yearLabel}{T.adoption[state]}</Tag>
    </TooltipTrigger>
    <TooltipContent className={styles.adoptionTooltip}>
      <p>{T.adoptionHint[state]}</p>
      {rows.map(r => <p key={`${r.revisionId}:${r.strategyId}`} className="text-body-small">
        <Link className={links.textLink} href={planningHref({year:r.year, revision:r.revisionId})}>Y{r.year} {T.companyPlan}{r.planVersion ? ` V${r.planVersion}` : ""}</Link>{" / "}{T.strategyVersion} V{r.strategyVersion}{" / "}{T.planState[r.state]}{r.objectiveCount !== undefined ? ` / ${r.objectiveCount} ${C.countMetrics}` : ""}
      </p>)}
    </TooltipContent>
  </Tooltip>;
}
