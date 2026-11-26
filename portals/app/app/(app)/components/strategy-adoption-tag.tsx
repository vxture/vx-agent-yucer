"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
import { Tag } from "./tag";
import { useMessages } from "../lib/i18n/provider";
import type { StrategyAdoptionRead } from "../lib/strategy-adoption-read";
import { strategyAdoptionStatus } from "../../domains/planning/strategy-adoption";
import type { StrategyView } from "../lib/market-strategy";
import styles from "./strategy-charter-card.module.css";

export function StrategyAdoptionTag({ plan, adoption }: { readonly plan: StrategyView; readonly adoption: StrategyAdoptionRead }) {
  const { STRATEGY_CARD_TEXT: T } = useMessages();
  const state = adoption.state === "ready" ? strategyAdoptionStatus(plan, adoption.rows) : adoption.state;
  const rows = adoption.state === "ready" ? adoption.rows.filter(r => r.lineageId === (plan.lineageId ?? plan.id)) : [];
  const pendingTone = ["pending", "previous"].includes(state) ? "warning" : "neutral";
  const tone = state === "accepted" ? "success" : pendingTone;
  return <Tooltip>
    <TooltipTrigger className="inline-flex min-w-0 max-w-full" data-strategy-adoption={state}>
      <Tag tone={tone}>{T.adoption[state]}</Tag>
    </TooltipTrigger>
    <TooltipContent className={styles.adoptionTooltip}>
      <p>{T.adoptionHint[state]}</p>
      {rows.map(r => <p key={`${r.revisionId}:${r.strategyId}`} className="text-body-small">
        {r.year} {T.companyPlan}{r.planVersion ? ` V${r.planVersion}` : ""}{" / "}{T.strategyVersion} V{r.strategyVersion}{" / "}{T.planState[r.state]}
      </p>)}
    </TooltipContent>
  </Tooltip>;
}
