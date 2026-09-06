"use client";

import { AssistantSection, type AssistantItem } from "./assistant";
import { useMessages } from "../lib/i18n/provider";
import { moreOptimistic } from "../../domains/pipeline/lib/forecast-stats";
import type { ForecastCategory } from "../../domains/pipeline/lib/forecast";

// 口径检查 - the forecast page's half of the dock.
//
// THERE IS NO SEPARATE RULE FILE HERE, and that is deliberate rather than a
// gap. Everywhere else the dock needed a rule to turn rows into findings; on
// this page the rule ALREADY produced the finding - `previewCategories`
// returns a verdict per deal, and a disagreeing verdict IS the item. Writing
// an analyse* wrapper would add a layer that only renames what the domain
// already said.
//
// THE ACT IS THE ROW'S ACT: apply the suggestion, gated on
// pipeline.forecast.categorize, which the catalog withholds from the rep who
// owns the deal. So a rep sees the rule disagreeing and cannot quietly make it
// go away - the arrangement a forecast review depends on.

export interface ForecastAdviceItem {
  readonly opportunityId: string;
  readonly opportunityNo: string;
  readonly dealName: string;
  readonly filed: ForecastCategory;
  readonly suggested: ForecastCategory;
}

export function ForecastAdvicePanel({
  items,
  canApply,
  onApply,
}: {
  readonly items: readonly ForecastAdviceItem[];
  readonly canApply: boolean;
  readonly onApply: (input: {
    opportunityId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { FORECAST_RULE_TEXT, FORECAST_RULE_ERROR, FORECAST_LABEL } = useMessages();

  const shown: AssistantItem[] = items.map((i) => {
    const optimistic = moreOptimistic(i.filed, i.suggested);
    return {
      id: `forecast:${i.opportunityId}`,
      text: optimistic
        ? FORECAST_RULE_TEXT.adviceOptimistic(
            i.dealName,
            FORECAST_LABEL[i.filed] ?? i.filed,
            FORECAST_LABEL[i.suggested] ?? i.suggested,
          )
        : FORECAST_RULE_TEXT.adviceConservative(
            i.dealName,
            FORECAST_LABEL[i.filed] ?? i.filed,
            FORECAST_LABEL[i.suggested] ?? i.suggested,
          ),
      evidence: i.opportunityNo,
      tone: optimistic ? "warn" : "info",
      ...(canApply
        ? {
            act: {
              label: FORECAST_RULE_TEXT.apply,
              done: FORECAST_RULE_TEXT.applied,
              errors: FORECAST_RULE_ERROR,
              run: () => onApply({ opportunityId: i.opportunityId }),
            },
          }
        : {}),
      link: { label: FORECAST_RULE_TEXT.adviceOpenDeal, href: `/pipeline/${i.opportunityId}` },
    };
  });

  return (
    <AssistantSection
      section={{
        id: "forecast-advice",
        title: FORECAST_RULE_TEXT.adviceTitle,
        items: shown,
        empty: FORECAST_RULE_TEXT.adviceClear,
      }}
    />
  );
}
