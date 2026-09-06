"use client";

import { BarChart, Card, Progress, Section } from "@vxture/design-ui";
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
// THE DOWNGRADE BAR IS THE HEADLINE NUMBER. It is the proportion of live work
// whose report was rosier than the facts - the thing this domain exists to
// surface, and a number that means nothing as a row in a table.

export function DeliveryAnalysis({
  stats,
  liveCount,
  currency,
}: {
  readonly stats: DeliveryStats;
  readonly liveCount: number;
  readonly currency: string;
}) {
  const { DELIVERY_TEXT, PROJECT_STATUS_LABEL, HEALTH_LABEL } = useMessages();

  const money = (n: number) => n.toLocaleString();
  const rate = liveCount === 0 ? 0 : Math.round((stats.downgraded / liveCount) * 100);

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

  return (
    <Section
      id="delivery-analysis"
      icon="chart-bar"
      title={DELIVERY_TEXT.analysisTitle}
      description={DELIVERY_TEXT.analysisWhy}
    >
      <div className="@container flex flex-col gap-md">
        <Card className="flex flex-col gap-sm p-lg">
          <div className="flex items-baseline justify-between gap-sm">
            <span className="text-label-md text-foreground">
              {DELIVERY_TEXT.downgradeRate}
            </span>
            <span className="text-muted-foreground tabular-nums text-body-sm">
              {DELIVERY_TEXT.downgradeOf(stats.downgraded, liveCount)}
            </span>
          </div>
          <Progress value={rate} />
          <span className="text-muted-foreground text-body-sm">
            {DELIVERY_TEXT.downgradeWhy}
          </span>
        </Card>

        <div className="grid grid-cols-1 gap-md @3xl:grid-cols-2">
          <Card className="flex flex-col gap-sm p-lg">
            <span className="text-label-md text-foreground">{DELIVERY_TEXT.byStageTitle}</span>
            <span className="text-muted-foreground text-body-sm">
              {DELIVERY_TEXT.byStageWhy}
            </span>
            {byStage.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.analysisEmpty}</p>
            ) : (
              <BarChart data={byStage} formatValue={money} />
            )}
          </Card>

          <Card className="flex flex-col gap-sm p-lg">
            <span className="text-label-md text-foreground">{DELIVERY_TEXT.byHealthTitle}</span>
            <span className="text-muted-foreground text-body-sm">
              {DELIVERY_TEXT.byHealthWhy}
            </span>
            {byHealth.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.analysisEmpty}</p>
            ) : (
              <BarChart data={byHealth} formatValue={money} />
            )}
          </Card>
        </div>

        <Card className="flex flex-col gap-sm p-lg">
          <div className="flex items-baseline justify-between gap-sm">
            <span className="text-label-md text-foreground">
              {DELIVERY_TEXT.byProjectTitleDelivery}
            </span>
            <span className="text-muted-foreground tabular-nums text-body-sm">
              {DELIVERY_TEXT.contractTotal(money(stats.contractTotal), currency)}
            </span>
          </div>
          <span className="text-muted-foreground text-body-sm">
            {DELIVERY_TEXT.byProjectWhyDelivery}
          </span>
          {byProject.length === 0 ? (
            <p className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.analysisEmpty}</p>
          ) : (
            <BarChart data={byProject} formatValue={money} />
          )}
        </Card>
      </div>
    </Section>
  );
}
