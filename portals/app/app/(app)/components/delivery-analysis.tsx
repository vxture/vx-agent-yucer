"use client";

import { BarChart, Card } from "@vxture/design-ui";
import { AnalysisTabs } from "./analysis-tabs";
import { useMessages } from "../lib/i18n/provider";
import type { DeliveryStats } from "../../domains/delivery/lib/delivery-stats";

// 交付分析 - the statistics block above the project list, built to the shape
// the collections page settled on (owner, 2026-09-06: 统计为主，列表为具体清单).
//
// TWO CUTS THE LIST CANNOT MAKE. Read row by row the roster tells you what
// each project is; it cannot tell you HOW THE BOOK IS SPREAD ACROSS HEALTH or
// WHERE THE CONTRACT VALUE IS CONCENTRATED. Both are sums over the very rows
// below, computed in delivery-stats.ts from the same array, so the block above
// and the list below cannot disagree.
//
// THE HEALTH CHART READS THE DERIVED HEALTH AND LIVE WORK ONLY. A delivered
// project's health is history; leaving it in would turn a reading of what is
// running into a record of everything that ever happened. And the bars are
// ordered worst first, because a page about delivery risk should not open on
// the healthy one.
//
// THE DOWNGRADE PROPORTION IS NOT HERE. It moved to the dock (owner,
// 2026-09-06): it is not a count of what exists, it is what the check CONCLUDED
// after comparing every report against its facts - an analysis result, and the
// dock is where this product puts those. What stays here are cuts of the book
// itself.

export function DeliveryAnalysis({
  stats,
  currency,
}: {
  readonly stats: DeliveryStats;
  readonly currency: string;
}) {
  const { DELIVERY_TEXT, PROJECT_STATUS_LABEL, HEALTH_LABEL } = useMessages();

  const money = (n: number) => n.toLocaleString();

  const byStage = stats.byStage.map((b) => ({
    key: b.key,
    label: PROJECT_STATUS_LABEL[b.key] ?? b.key,
    value: b.amount,
  }));
  const byHealth = stats.byHealth.map((b) => ({
    key: b.key,
    label: HEALTH_LABEL[b.key] ?? b.key,
    value: b.amount,
  }));
  // Top eight and no more: a bar per project reads as a chart at eight and as
  // a wall at thirty, and the list below is where every project is anyway.
  const byProject = stats.byProject.slice(0, 8).map((p) => ({
    key: p.key,
    label: p.name,
    value: p.amount,
  }));

  const chart = (data: readonly { key: string; label: string; value: number }[], why: string) => (
    <Card className="flex flex-col gap-sm p-lg">
      <span className="text-muted-foreground text-body-sm">{why}</span>
      {data.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.analysisEmpty}</p>
      ) : (
        <BarChart data={[...data]} formatValue={money} />
      )}
    </Card>
  );

  return (
    <AnalysisTabs
      id="delivery-analysis"
      title={DELIVERY_TEXT.analysisTitle}
      description={DELIVERY_TEXT.analysisWhy}
      tabs={[
        {
          key: "stage",
          label: DELIVERY_TEXT.byStageTitle,
          content: chart(byStage, DELIVERY_TEXT.byStageWhy),
        },
        {
          key: "health",
          label: DELIVERY_TEXT.byHealthTitle,
          content: chart(byHealth, DELIVERY_TEXT.byHealthWhy),
        },
        {
          key: "project",
          label: DELIVERY_TEXT.byProjectTitleDelivery,
          content: (
            <Card className="flex flex-col gap-sm p-lg">
              <div className="flex items-baseline justify-between gap-sm">
                <span className="text-muted-foreground text-body-sm">
                  {DELIVERY_TEXT.byProjectWhyDelivery}
                </span>
                <span className="text-muted-foreground tabular-nums text-body-sm">
                  {DELIVERY_TEXT.contractTotal(money(stats.contractTotal), currency)}
                </span>
              </div>
              {byProject.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">
                  {DELIVERY_TEXT.analysisEmpty}
                </p>
              ) : (
                <BarChart data={byProject} formatValue={money} />
              )}
            </Card>
          ),
        },
      ]}
    />
  );
}
