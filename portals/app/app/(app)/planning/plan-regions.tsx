"use client";
import { useState } from "react";
import Link from "next/link";
import {
  DataTable,
  EmptyState,
  ListCardGrid,
  MetricListCard,
  Section,
  StatusBadge,
  TableTitleCell,
  type DataTableColumn,
  type FilterBarView,
} from "@vxture/design-ui";
import { FilterBar } from "../components/business-controls";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type { PlanContent } from "../../domains/planning/plan-model";
import { PlanQuarterDisclosure } from "./plan-quarter-disclosure";
import { PlanQuarterTable } from "./plan-targets";

export function PlanRegions({
  content,
  onSelect,
}: {
  content: PlanContent;
  onSelect: (id: string) => void;
}) {
  const { PLAN_VERSION_TEXT: T, DATA_TABLE_LABELS } = useMessages();
  const locale = useLocale();
  const [view, setView] = useState<FilterBarView>("cards");
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const format = (v: string | null | undefined) =>
    v == null
      ? "—"
      : Number(v).toLocaleString(locale, { maximumFractionDigits: 2 });
  const rows = content.regions.map((r) => ({
    ...r,
    target: content.targets.find(
      (t) =>
        t.scope === `territory:${r.id}` &&
        t.period === `Y${content.year}` &&
        t.metric === "revenue",
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
  type Row = (typeof rows)[number];
  const status = (r: Row) => (
    <StatusBadge tone={r.included ? "info" : "neutral"}>
      {r.included ? T.included : T.excluded}
    </StatusBadge>
  );
  const quarters = (r: Row) => (
    <PlanQuarterTable
      content={content}
      scope={`territory:${r.id}`}
      edit={null}
      disabled={false}
    />
  );
  const columns: DataTableColumn<Row>[] = [
    {
      id: "region",
      header: T.regions,
      cell: (r) => (
        <TableTitleCell
          title={r.name}
          description={r.provinces.join(" · ")}
          tooltip={r.provinces.join(" · ")}
          onTitleClick={() => onSelect(r.id)}
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
      id: "currency",
      header: T.currency,
      width: "xs",
      cell: (r) => r.target?.currency ?? "—",
    },
    {
      id: "customers",
      header: T.customers,
      align: "numeric",
      width: "xs",
      cell: (r) => r.customers,
    },
    {
      id: "people",
      header: T.people,
      align: "numeric",
      width: "xs",
      cell: (r) => r.people,
    },
    {
      id: "status",
      header: T.participation,
      align: "center",
      width: "sm",
      cell: status,
    },
  ];
  return (
    <Section icon="map-pin" title={T.regions} description={T.regionsHint}>
      <div className="flex flex-col gap-md">
        <FilterBar
          view={view}
          onViewChange={setView}
          count={T.regionCount(rows.length)}
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
            rowKey={(r) => r.id}
            expandedContent={(r) => (r.included ? quarters(r) : null)}
            expandedKeys={expanded}
            onExpandedChange={setExpanded}
            empty={<EmptyState title={T.noRegions} />}
          />
        ) : rows.length ? (
          <ListCardGrid>
            {rows.map((r) => (
              <MetricListCard
                key={r.id}
                title={
                  <button
                    type="button"
                    className="text-left transition-colors hover:text-primary"
                    onClick={() => onSelect(r.id)}
                  >
                    {r.name}
                  </button>
                }
                description={
                  <span title={r.provinces.join(" · ")}>
                    {r.provinces.join(" · ") || T.noCoverage}
                  </span>
                }
                actions={status(r)}
                note={
                  r.included
                    ? `${T.annualRevenue} · ${r.target?.currency ?? "—"}`
                    : r.reason || T.excluded
                }
                metrics={
                  r.included
                    ? (["floor", "target", "stretch"] as const).map((tier) => ({
                        key: tier,
                        label: T[tier],
                        value: format(r.target?.[tier]),
                      }))
                    : undefined
                }
                footer={
                  r.included ? (
                    <div className="flex w-full min-w-0 flex-col gap-md">
                      <div className="flex flex-wrap gap-md text-body-small text-muted-foreground">
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
                      <PlanQuarterDisclosure compact label={T.quarters}>
                        {quarters(r)}
                      </PlanQuarterDisclosure>
                    </div>
                  ) : undefined
                }
              />
            ))}
          </ListCardGrid>
        ) : (
          <EmptyState title={T.noRegions} />
        )}
      </div>
    </Section>
  );
}
