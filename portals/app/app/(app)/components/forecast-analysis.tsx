"use client";

import { BarChart, Card, Progress, Section } from "@vxture/design-ui";
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

  return (
    <Section
      id="forecast-analysis"
      icon="chart-bar"
      title={FORECAST_RULE_TEXT.analysisTitle}
      description={FORECAST_RULE_TEXT.analysisWhy}
    >
      <div className="@container flex flex-col gap-md">
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

        <div className="grid grid-cols-1 gap-md @3xl:grid-cols-2">
          <Card className="flex flex-col gap-sm p-lg">
            <span className="text-label-md text-foreground">
              {FORECAST_RULE_TEXT.byCategoryTitle}
            </span>
            <span className="text-muted-foreground text-body-sm">
              {FORECAST_RULE_TEXT.byCategoryWhy}
            </span>
            {byCategory.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">
                {FORECAST_RULE_TEXT.analysisEmpty}
              </p>
            ) : (
              <BarChart data={byCategory} formatValue={money} />
            )}
          </Card>

          <Card className="flex flex-col gap-sm p-lg">
            <span className="text-label-md text-foreground">
              {FORECAST_RULE_TEXT.directionTitle}
            </span>
            <span className="text-muted-foreground text-body-sm">
              {FORECAST_RULE_TEXT.directionWhy}
            </span>
            {direction.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">
                {FORECAST_RULE_TEXT.directionNone}
              </p>
            ) : (
              <BarChart data={direction} formatValue={money} />
            )}
          </Card>
        </div>
      </div>
    </Section>
  );
}
