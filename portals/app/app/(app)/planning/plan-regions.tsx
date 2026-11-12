"use client";
import { useState } from "react";
import Link from "next/link";
import {
  DataTable,
  EmptyState,
  Grid,
  MetricListCard,
  Section,
  StatusBadge,
  TableTitleCell,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useMediaQuery,
  type DataTableColumn,
  type FilterBarView,
} from "@vxture/design-ui";
import { FilterBar } from "../components/business-controls";
import { RowActions } from "../components/table-fittings";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type { PlanContent } from "../../domains/planning/plan-model";
import { PlanTargetLedger } from "./plan-targets";

export function PlanRegions({
  content,
  onSelect,
}: {
  content: PlanContent;
  onSelect: (id: string) => void;
}) {
  const {
    PLAN_VERSION_TEXT: T,
    PLANNING_TEXT: P,
    DATA_TABLE_LABELS,
    DS_LABELS,
  } = useMessages();
  const locale = useLocale();
  const isWide = useMediaQuery("(min-width: 96rem)");
  const [view, setView] = useState<FilterBarView>("cards");
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const format = (v: string | null | undefined) =>
    v == null
      ? "—"
      : Number(v).toLocaleString(locale, { maximumFractionDigits: 2 });
  const metricLabels = {
    revenue: P.metricRevenue,
    new_logo: P.metricNewLogo,
    pipeline: P.metricPipeline,
    margin: P.metricMargin,
  };
  const regions = content.regions.map((r) => ({
    ...r,
    target: content.targets.find(
      (t) =>
        t.scope === `territory:${r.id}` &&
        t.period === `Y${content.year}` &&
        t.metric === "revenue",
    ),
    periods: content.targets
      .filter(
        (t) =>
          t.scope === `territory:${r.id}` && t.period !== `Y${content.year}`,
      )
      .sort(
        (a, b) =>
          a.period.localeCompare(b.period) ||
          a.metric.localeCompare(b.metric) ||
          (a.currency ?? "").localeCompare(b.currency ?? ""),
      ),
    customers: new Set(
      content.contributions
        .filter((x) => x.regionId === r.id)
        .map((x) => x.budgetKey),
    ).size,
    people: new Set(
      content.team
        .filter((x) => x.regionId === r.id && x.memberSub)
        .map((x) => x.memberSub),
    ).size,
    actions: content.actions.filter((x) => x.regionId === r.id).length,
  }));
  type Region = (typeof regions)[number];
  const status = (r: Region) => (
    <StatusBadge tone={r.included ? "info" : "neutral"}>
      {r.included ? T.included : T.excluded}
    </StatusBadge>
  );
  const regionTitle = (r: Region) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-left font-semibold transition-colors hover:text-primary"
          onClick={() => onSelect(r.id)}
        >
          {r.name}
        </button>
      </TooltipTrigger>
      <TooltipContent>{r.provinces.join(" · ") || T.noCoverage}</TooltipContent>
    </Tooltip>
  );
  // Flatten expanded periods into the same DataTable. A nested table would
  // independently recalculate widths and break annual/period tier alignment.
  const rows = regions.flatMap((r) => [
    { region: r, target: r.target, isPeriod: false, key: r.id },
    ...(expanded.includes(r.id)
      ? r.periods.map((t) => ({
          region: r,
          target: t,
          isPeriod: true,
          key: `${r.id}:${t.key}`,
        }))
      : []),
  ]);
  type Row = (typeof rows)[number];
  const columns: DataTableColumn<Row>[] = [
    {
      id: "region",
      header: T.regions,
      cell: ({ region: r, target: t, isPeriod }) => (
        <TableTitleCell
          title={
            isPeriod
              ? t?.period.replace(String(content.year), "")
              : regionTitle(r)
          }
          titleSuffix={
            !isPeriod && !expanded.includes(r.id) ? (
              <span className="whitespace-nowrap text-body-small font-normal text-muted-foreground">
                {T.splitPeriods(new Set(r.periods.map((t) => t.period)).size)}
              </span>
            ) : undefined
          }
          description={
            isPeriod
              ? `${t ? metricLabels[t.metric] : ""} · ${t?.currency ?? T.count}`
              : `${t?.currency ?? "—"} · ${T.customers} ${r.customers} · ${T.people} ${r.people} · ${T.actions} ${r.actions}`
          }
        />
      ),
    },
    ...(["floor", "target", "stretch"] as const).map((tier) => ({
      id: tier,
      header: T[tier],
      align: "numeric" as const,
      width: "sm" as const,
      cell: (r: Row) => format(r.target?.[tier]),
    })),
    {
      id: "status",
      header: T.participation,
      align: "center",
      width: "sm",
      cell: (r) => (r.isPeriod ? "—" : status(r.region)),
    },
  ];
  return (
    <Section icon="map-pin" title={T.regions} description={T.regionsHint}>
      <div className="flex flex-col gap-md">
        <FilterBar
          view={view}
          onViewChange={setView}
          count={T.regionCount(regions.length)}
          actions={
            <Link
              href="/admin/division"
              target="_blank"
              rel="noopener noreferrer"
              className="text-body-small text-muted-foreground transition-colors hover:text-primary"
            >
              {T.configure}
            </Link>
          }
        />
        {view === "list" ? (
          <DataTable
            labels={DATA_TABLE_LABELS}
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            indexStart={1}
            rowActions={({ region: r, isPeriod }) => (
              <RowActions
                label={`${DS_LABELS.actionMenu} · ${r.name}`}
                items={
                  isPeriod
                    ? []
                    : [
                        {
                          id: "open",
                          label: T.regionDetail,
                          icon: "arrow-right",
                          onSelect: () => onSelect(r.id),
                        },
                        ...(r.included
                          ? [
                              {
                                id: "periods",
                                label: expanded.includes(r.id)
                                  ? T.collapsePeriods
                                  : T.periodTargets,
                                icon: "calendar" as const,
                                onSelect: () =>
                                  setExpanded((keys) =>
                                    keys.includes(r.id)
                                      ? keys.filter((key) => key !== r.id)
                                      : [...keys, r.id],
                                  ),
                              },
                            ]
                          : []),
                      ]
                }
              />
            )}
            empty={<EmptyState title={T.noRegions} />}
          />
        ) : regions.length ? (
          <Grid columns={isWide ? 2 : 1} gap="md" className="items-start">
            {regions.map((r) => (
              <MetricListCard
                key={r.id}
                title={regionTitle(r)}
                actions={status(r)}
                note={
                  r.included ? (
                    <div className="flex flex-wrap gap-md">
                      <span>
                        {T.customers} {r.customers}
                      </span>
                      <span>
                        {T.people} {r.people}
                      </span>
                      <span>
                        {T.actions} {r.actions}
                      </span>
                    </div>
                  ) : (
                    r.reason || T.excluded
                  )
                }
                footer={
                  r.included ? (
                    <div className="w-full min-w-0">
                      <PlanTargetLedger
                        content={content}
                        scope={`territory:${r.id}`}
                        edit={null}
                        disabled={false}
                      />
                    </div>
                  ) : undefined
                }
              />
            ))}
          </Grid>
        ) : (
          <EmptyState title={T.noRegions} />
        )}
      </div>
    </Section>
  );
}
