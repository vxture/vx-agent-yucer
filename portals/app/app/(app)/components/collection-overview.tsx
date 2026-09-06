"use client";

import { BarChart, Card, Progress } from "@vxture/design-ui";
import { AnalysisTabs } from "./analysis-tabs";
import { useMessages } from "../lib/i18n/provider";
import type { CollectionStats } from "../../domains/delivery/lib/collection-stats";

// 回款分析 - the statistics block above the schedule (owner, 2026-09-06:
// 统计为主，列表为具体清单).
//
// TWO CUTS, BECAUSE THE LIST ALREADY ANSWERS THE THIRD. Read row by row the
// schedule tells you what is next; it cannot tell you HOW BAD THE TAIL IS or
// WHO MOST OF IT IS WITH, and both are sums over the very rows below. They are
// computed in collection-stats.ts from the same array the table renders, so
// the block above and the list below cannot disagree.
//
// THE AGEING CHART KEEPS ITS HEALTHY BAND. 未到期 is money behaving normally;
// a chart that drew only the late bands would make every workspace look like
// it is in trouble, and the reader could not see whether the tail is the
// exception or the rule. 未填到期日 is a band of its own for the opposite
// reason - it is not early, it is unmeasurable.
//
// COLLECTED IS WHAT ARRIVED. The progress bar reads short payments as short:
// summing the planned figure for rows that settled would report money nobody
// received, which is exactly the number a collections review is checking.

export function CollectionOverview({ stats }: { readonly stats: CollectionStats }) {
  const { DELIVERY_TEXT } = useMessages();

  const money = (n: number) => n.toLocaleString();
  const rate = stats.promised === 0 ? 0 : Math.round((stats.collected / stats.promised) * 100);

  const ageing = stats.ageing.map((b) => ({
    key: b.key,
    label: DELIVERY_TEXT.ageingBand[b.key] ?? b.key,
    value: b.amount,
  }));
  // Top eight and no more: a bar per project reads as a chart at eight and as
  // a wall at thirty, and the list below is where every project is anyway.
  const byProject = stats.byProject.slice(0, 8).map((p) => ({
    key: p.key,
    label: p.name,
    value: p.amount,
  }));

  const chart = (
    data: readonly { key: string; label: string; value: number }[],
    why: string,
  ) => (
    <Card className="flex flex-col gap-sm p-lg">
      <span className="text-muted-foreground text-body-sm">{why}</span>
      {data.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{DELIVERY_TEXT.overviewEmpty}</p>
      ) : (
        <BarChart data={[...data]} formatValue={money} peakLabel={DELIVERY_TEXT.chartPeak} />
      )}
    </Card>
  );

  return (
    <AnalysisTabs
      id="collection-overview"
      title={DELIVERY_TEXT.overviewTitle}
      description={DELIVERY_TEXT.overviewWhy}
      summary={
        <Card className="flex flex-col gap-sm p-lg">
          <div className="flex items-baseline justify-between gap-sm">
            <span className="text-label-md text-foreground">{DELIVERY_TEXT.collectedRate}</span>
            <span className="text-muted-foreground tabular-nums text-body-sm">
              {DELIVERY_TEXT.collectedOf(money(stats.collected), money(stats.promised))}
            </span>
          </div>
          <Progress value={rate} />
        </Card>
      }
      tabs={[
        {
          key: "ageing",
          label: DELIVERY_TEXT.ageingTitle,
          content: chart(ageing, DELIVERY_TEXT.ageingWhy),
        },
        {
          key: "project",
          label: DELIVERY_TEXT.byProjectTitle,
          content: chart(byProject, DELIVERY_TEXT.byProjectWhy),
        },
      ]}
    />
  );
}
