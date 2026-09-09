"use client";

import { BarChart, Card } from "@vxture/design-ui";
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
// THE PROPORTION MOVED UP TO THE HEADER (owner, 2026-09-06). It is one bar
// segmented by the same stages the header's numbers already name, so it
// belongs beside them - and with the cells directly under it, the bar needs
// neither a title nor figures of its own.

export function CollectionOverview({ stats }: { readonly stats: CollectionStats }) {
  const { DELIVERY_TEXT } = useMessages();

  const money = (n: number) => n.toLocaleString();

  /* THE LABEL IS COMPOSED, not looked up (incr/0042). The bands used to be
     five literals with five translations beside them; a workspace ageing at
     45/90 has bands no dictionary written in advance has a sentence for, so
     the band carries its bounds and the copy is a function of them. */
  const ageing = stats.ageing.map((b) => ({
    key: b.key,
    label:
      b.band.kind === "late"
        ? b.band.to === null
          ? DELIVERY_TEXT.ageingOver(b.band.from - 1)
          : DELIVERY_TEXT.ageingBetween(b.band.from, b.band.to)
        : DELIVERY_TEXT.ageingBand[b.band.kind],
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
