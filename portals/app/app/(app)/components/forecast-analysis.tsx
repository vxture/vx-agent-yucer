"use client";

import { BarChart, Card, Progress } from "@vxture/design-ui";
import { AnalysisTabs } from "./analysis-tabs";
import { useMessages } from "../lib/i18n/provider";
import type { ForecastStats } from "../../domains/pipeline/lib/forecast-stats";
import type { ForecastCategory } from "../../domains/pipeline/lib/forecast";

// 口径分析 - the statistics block above the list (owner, 2026-09-06:
// 统计为主，列表为具体清单), built to the shape collections and delivery use.
//
// THE AGREEMENT RATE IS THE HEADLINE, because it is the only number that says
// whether this page is worth opening today. Twelve disagreements out of two
// hundred deals is a healthy forecast with a few edges; twelve out of twenty
// is a forecast nobody trusts.
//
// AND THE DISAGREEMENTS ARE SPLIT BY DIRECTION, which a single count hides.
// Filed surer than the rule inflates a number somebody will be held to; filed
// less sure hides work that is going well. They are different conversations,
// and the money at stake in each is the number a reviewer wants first.

export function ForecastAnalysis({ stats }: { readonly stats: ForecastStats }) {
  const { FORECAST_RULE_TEXT, FORECAST_LABEL } = useMessages();

  const money = (n: number) => n.toLocaleString();
  const disputed = stats.optimistic.count + stats.conservative.count;
  const rate = stats.total === 0 ? 100 : Math.round((stats.agreed.count / stats.total) * 100);

  const byCategory = stats.byCategory.map((b) => ({
    key: b.key,
    // `byCategory` is keyed by the categories themselves - forecastStats
    // builds it from FORECAST_CATEGORIES - so the narrowing is a fact, not a
    // hope.
    label: FORECAST_LABEL[b.key as ForecastCategory] ?? b.key,
    value: b.amount,
  }));
  const direction = [
    {
      key: "optimistic",
      label: FORECAST_RULE_TEXT.dirOptimistic,
      value: stats.optimistic.amount,
    },
    {
      key: "conservative",
      label: FORECAST_RULE_TEXT.dirConservative,
      value: stats.conservative.amount,
    },
  ].filter((d) => d.value > 0);

  const chart = (
    data: readonly { key: string; label: string; value: number }[],
    why: string,
    empty: string,
  ) => (
    <Card className="flex flex-col gap-sm p-lg">
      <span className="text-muted-foreground text-body-sm">{why}</span>
      {data.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{empty}</p>
      ) : (
        <BarChart data={[...data]} formatValue={money} />
      )}
    </Card>
  );

  return (
    <AnalysisTabs
      id="forecast-analysis"
      title={FORECAST_RULE_TEXT.analysisTitle}
      description={FORECAST_RULE_TEXT.analysisWhy}
      summary={
        <Card className="flex flex-col gap-sm p-lg">
          <div className="flex items-baseline justify-between gap-sm">
            <span className="text-label-md text-foreground">
              {FORECAST_RULE_TEXT.agreementRate}
            </span>
            <span className="text-muted-foreground tabular-nums text-body-sm">
              {FORECAST_RULE_TEXT.agreementOf(stats.agreed.count, stats.total)}
            </span>
          </div>
          <Progress value={rate} />
          <span className="text-muted-foreground text-body-sm">
            {disputed === 0
              ? FORECAST_RULE_TEXT.agreementClear
              : FORECAST_RULE_TEXT.agreementWhy(disputed)}
          </span>
        </Card>
      }
      tabs={[
        {
          key: "category",
          label: FORECAST_RULE_TEXT.byCategoryTitle,
          content: chart(
            byCategory,
            FORECAST_RULE_TEXT.byCategoryWhy,
            FORECAST_RULE_TEXT.analysisEmpty,
          ),
        },
        {
          key: "direction",
          label: FORECAST_RULE_TEXT.directionTitle,
          content: chart(
            direction,
            FORECAST_RULE_TEXT.directionWhy,
            FORECAST_RULE_TEXT.directionNone,
          ),
        },
      ]}
    />
  );
}
