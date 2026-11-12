"use client";
import { useState } from "react";
import {
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
  const { PLAN_VERSION_TEXT: T, PLANNING_TEXT: P, DS_LABELS } = useMessages();
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
  const togglePeriods = (id: string) =>
    setExpanded((keys) =>
      keys.includes(id) ? keys.filter((key) => key !== id) : [...keys, id],
    );
  const regionActions = (r: Region) => [
    {
      id: "open",
      label: T.regionDetail,
      icon: "arrow-right" as const,
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
            onSelect: () => togglePeriods(r.id),
          },
        ]
      : []),
  ];
  return (
    <Section
      icon="map-pin"
      title={T.regions}
      description={T.regionsHint}
      action={
        <RowActions
          label={`${T.regions} · ${DS_LABELS.actionMenu}`}
          items={[
            {
              id: "configure",
              label: T.configure,
              icon: "settings",
              onSelect: () =>
                window.open("/admin/division", "_blank", "noopener,noreferrer"),
            },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-md">
        <FilterBar
          view={view}
          onViewChange={setView}
          count={T.regionCount(regions.length)}
        />
        {view === "list" ? (
          <Table className="table-fixed min-w-panel-lg" aria-label={T.regions}>
            <colgroup>
              <col className="w-table-col-fixed" />
              <col />
              <col className="w-1/6" />
              <col className="w-1/6" />
              <col className="w-1/6" />
              <col className="w-32" />
              <col className="w-table-col-fixed" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center first:pl-md"></TableHead>
                <TableHead>{T.regions}</TableHead>
                {(["floor", "target", "stretch"] as const).map((tier) => (
                  <TableHead key={tier} className="text-right">
                    {T[tier]}
                  </TableHead>
                ))}
                <TableHead className="text-center">{T.participation}</TableHead>
                <TableHead className="text-center last:pr-md">
                  {T.operations}
                </TableHead>
              </TableRow>
            </TableHeader>
            {regions.map((r, index) => {
              const open = expanded.includes(r.id);
              return (
                <TableBody key={r.id}>
                  <TableRow
                    data-region-id={r.id}
                    tabIndex={r.included ? 0 : undefined}
                    aria-expanded={r.included ? open : undefined}
                    onKeyDown={(event) => {
                      if (
                        event.target !== event.currentTarget ||
                        !r.included ||
                        !["Enter", " "].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      togglePeriods(r.id);
                    }}
                    className={`${r.included ? "cursor-pointer " : ""}${open ? "bg-accent hover:bg-accent" : "hover:bg-transparent"}`}
                    onClick={(event) => {
                      if (
                        !r.included ||
                        (event.target as HTMLElement).closest(
                          'button,a,input,select,textarea,[role="menuitem"]',
                        ) ||
                        window.getSelection()?.toString()
                      )
                        return;
                      togglePeriods(r.id);
                    }}
                  >
                    <TableCell className="text-center text-muted-foreground first:pl-md">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <TableTitleCell
                        title={regionTitle(r)}
                        description={`${r.target?.currency ?? "—"} · ${T.customers} ${r.customers} · ${T.people} ${r.people} · ${T.actions} ${r.actions}`}
                      />
                    </TableCell>
                    {(["floor", "target", "stretch"] as const).map((tier) => (
                      <TableCell
                        key={tier}
                        data-plan-tier={tier}
                        className="text-right tabular-nums font-semibold"
                      >
                        {format(r.target?.[tier])}
                      </TableCell>
                    ))}
                    <TableCell className="text-center">{status(r)}</TableCell>
                    <TableCell className="text-center last:pr-md">
                      <RowActions
                        label={`${DS_LABELS.actionMenu} · ${r.name}`}
                        items={regionActions(r)}
                      />
                    </TableCell>
                  </TableRow>
                  {open
                    ? r.periods.map((t, periodIndex) => (
                        <TableRow
                          key={t.key}
                          id={
                            periodIndex === 0
                              ? `region-periods-${r.id}`
                              : undefined
                          }
                          className="bg-accent hover:bg-accent"
                        >
                          <TableCell className="text-center text-muted-foreground first:pl-md">
                            {index + 1}.{periodIndex + 1}
                          </TableCell>
                          <TableCell>
                            <TableTitleCell
                              title={t.period.replace(String(content.year), "")}
                              description={`${metricLabels[t.metric]} · ${t.currency ?? T.count}`}
                            />
                          </TableCell>
                          {(["floor", "target", "stretch"] as const).map(
                            (tier) => (
                              <TableCell
                                key={tier}
                                data-plan-tier={tier}
                                className="text-right tabular-nums"
                              >
                                {format(t[tier])}
                              </TableCell>
                            ),
                          )}
                          <TableCell />
                          <TableCell className="text-center last:pr-md">
                            <RowActions
                              label={`${DS_LABELS.actionMenu} · ${r.name} · ${t.period}`}
                              items={[]}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                  {open && !r.periods.length ? (
                    <TableRow className="bg-accent hover:bg-accent">
                      <TableCell colSpan={7}>
                        <EmptyState title={T.noQuarters} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              );
            })}
            {!regions.length ? (
              <TableBody>
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState title={T.noRegions} />
                  </TableCell>
                </TableRow>
              </TableBody>
            ) : null}
          </Table>
        ) : regions.length ? (
          <Grid columns={isWide ? 2 : 1} gap="md" className="items-start">
            {regions.map((r) => (
              <MetricListCard
                key={r.id}
                title={
                  <span className="flex h-control-xl min-w-0 items-center gap-sm">
                    <Icon
                      name="globe"
                      size="md"
                      className="shrink-0 text-muted-foreground"
                    />
                    {regionTitle(r)}
                    {r.included ? (
                      <span className="truncate text-body-small font-normal text-muted-foreground">
                        {T.customers} {r.customers} · {T.people} {r.people} ·{" "}
                        {T.actions} {r.actions}
                      </span>
                    ) : null}
                  </span>
                }
                actions={
                  <div className="flex items-center gap-sm">
                    {status(r)}
                    <RowActions
                      label={`${DS_LABELS.actionMenu} · ${r.name}`}
                      items={regionActions(r)}
                    />
                  </div>
                }
                note={!r.included ? r.reason || T.excluded : undefined}
                footer={
                  r.included ? (
                    <div className="w-full min-w-0">
                      <PlanTargetLedger
                        content={content}
                        scope={`territory:${r.id}`}
                        edit={null}
                        disabled={false}
                        open={expanded.includes(r.id)}
                        onOpenChange={(open) =>
                          setExpanded((keys) =>
                            open
                              ? [...new Set([...keys, r.id])]
                              : keys.filter((key) => key !== r.id),
                          )
                        }
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
