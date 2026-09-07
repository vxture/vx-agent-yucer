"use client";

import { BarChart, Card } from "@vxture/design-ui";
import { AnalysisTabs } from "./analysis-tabs";
import { useMessages } from "../lib/i18n/provider";
import { UNKNOWN_REGION, type RoutingStats } from "../../domains/signal/lib/routing-stats";

// 分配分析 - the statistics block above the routing list, built to the shape
// collections and delivery settled on (owner, 2026-09-06: 统计为主，列表为具体
// 清单). Every number here is a sum over the very rows below.
//
// THE LOAD CHART IS THE HALF OF THE RULE THE PAGE NEVER SHOWED. Territory
// decides who MAY work a lead; load decides which of them SHOULD. The list
// below shows each decision one at a time, so the tiebreaker - the thing that
// actually chose between two eligible people - was invisible, and "why them
// and not me" had no answer on the page.
//
// NOW AND AFTER, AS TWO SERIES. A single bar per person would say where things
// stand OR where they would end up, and the reader would have to remember
// which. The gap between the pair IS the page's effect, which is the one thing
// somebody about to press apply wants to see.
//
// THE MAP'S HOLES GET THEIR OWN TAB rather than a slice of another chart.
// Blocked leads are not a category of routing outcome, they are three
// different pieces of missing configuration, and each names a different
// person's job.

export function RoutingAnalysis({ stats }: { readonly stats: RoutingStats }) {
  const { ROUTING_TEXT } = useMessages();

  const whole = (n: number) => n.toLocaleString();

  const byOwnerNow = stats.byOwner.slice(0, 8).map((o) => ({
    key: `${o.sub}-now`,
    label: o.sub,
    value: o.now,
  }));
  const byOwnerAfter = stats.byOwner.slice(0, 8).map((o) => ({
    key: `${o.sub}-after`,
    label: o.sub,
    value: o.after,
  }));

  const byRegion = stats.byRegion.map((b) => ({
    key: b.key,
    // The unregioned bucket is NAMED. Drawing it as a blank label would make
    // the biggest problem on the page look like a rendering fault.
    label: b.key === UNKNOWN_REGION ? ROUTING_TEXT.noRegion : b.key,
    value: b.count,
  }));

  const byReason = stats.byReason.map((b) => ({
    key: b.key,
    label: ROUTING_TEXT.unroutable[b.key] ?? b.key,
    value: b.count,
  }));

  const chart = (data: readonly { key: string; label: string; value: number }[], why: string) => (
    <Card className="flex flex-col gap-sm p-lg">
      <span className="text-muted-foreground text-body-sm">{why}</span>
      {data.length === 0 ? (
        <p className="text-muted-foreground text-body-sm">{ROUTING_TEXT.analysisEmpty}</p>
      ) : (
        <BarChart data={[...data]} formatValue={whole} peakLabel={ROUTING_TEXT.chartPeak} />
      )}
    </Card>
  );

  return (
    <AnalysisTabs
      id="routing-analysis"
      title={ROUTING_TEXT.analysisTitle}
      description={ROUTING_TEXT.analysisWhy}
      tabs={[
        {
          key: "load",
          label: ROUTING_TEXT.byLoadTitle,
          content: (
            <Card className="flex flex-col gap-md p-lg">
              <span className="text-muted-foreground text-body-sm">
                {ROUTING_TEXT.byLoadWhy}
              </span>
              {stats.byOwner.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">{ROUTING_TEXT.analysisEmpty}</p>
              ) : (
                <div className="flex flex-col gap-md">
                  <div className="flex flex-col gap-2xs">
                    <span className="text-muted-foreground text-label-sm">
                      {ROUTING_TEXT.loadNow}
                    </span>
                    <BarChart
                      data={byOwnerNow}
                      formatValue={whole}
                      peakLabel={ROUTING_TEXT.chartPeak}
                    />
                  </div>
                  <div className="flex flex-col gap-2xs">
                    <span className="text-muted-foreground text-label-sm">
                      {ROUTING_TEXT.loadAfter}
                    </span>
                    <BarChart
                      data={byOwnerAfter}
                      formatValue={whole}
                      peakLabel={ROUTING_TEXT.chartPeak}
                    />
                  </div>
                </div>
              )}
            </Card>
          ),
        },
        {
          key: "region",
          label: ROUTING_TEXT.byRegionTitle,
          content: chart(byRegion, ROUTING_TEXT.byRegionWhy),
        },
        {
          key: "blocked",
          label: ROUTING_TEXT.byReasonTitle,
          content: chart(byReason, ROUTING_TEXT.byReasonWhy),
        },
      ]}
    />
  );
}
