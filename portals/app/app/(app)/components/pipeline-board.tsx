"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionMenu, DataTable, EmptyState, FilterBar, ListCard, ListCardGrid, MetricGrid, Section, StatusBadge, Tooltip, TooltipContent, TooltipTrigger, type DataTableColumn, type MetricGridItem } from "@vxture/design-ui";
import { TableCard } from "./table-card";
import type { Stage } from "../../domains/pipeline/lib/stage";
import type { ForecastCategory, ForecastableOpportunity } from "../../domains/pipeline/lib/forecast";
import { rollUp } from "../../domains/pipeline/lib/forecast";
import { FORECAST_TONE, STAGE_TONE, formatMoney, probabilityDisplay } from "../lib/view-model";
import { FORECAST_LABEL, PIPELINE_TEXT, STAGE_LABEL } from "../lib/messages";

// The pipeline board: opportunities plus the forecast roll-up they produce.
//
// A thin binding of DS elements to yucer's domain semantics, which is the one
// kind of local wrapper the design canon allows. The totals are not computed
// here - they come from rollUp(), the same function the snapshot writer uses, so
// what a member reads on this page and what gets frozen into a
// forecast_snapshot cannot disagree.

export interface PipelineRow extends ForecastableOpportunity {
  opportunityNo: string;
  name: string;
  accountName: string;
  ownerSub: string | null;
  probability: number | null;
  expectedCloseAt: Date | null;
  currency: string;
}

export interface PipelineBoardProps {
  readonly rows: readonly PipelineRow[];
  readonly currency?: string;
  readonly loading?: boolean;
  /** Shown when the member may read but not advance anything. */
  readonly readOnly?: boolean;
}

export function PipelineBoard({ rows, currency = "CNY", loading, readOnly }: PipelineBoardProps) {
  // Which arrangement the rows are in. Local: it is a preference about looking,
  // not about which data is on screen, so it has no business in the URL the way
  // the period filter does.
  const [view, setView] = useState<"list" | "cards">("list");
  const router = useRouter();
  const totals = useMemo(() => rollUp(rows, currency), [rows, currency]);

  const metrics: MetricGridItem[] = totals.ok
    ? [
        { id: "commit", label: FORECAST_LABEL.commit, value: formatMoney(totals.value.commitAmount.amount, currency), tone: "warning" },
        { id: "best_case", label: FORECAST_LABEL.best_case, value: formatMoney(totals.value.bestCaseAmount.amount, currency), tone: "info" },
        { id: "pipeline", label: FORECAST_LABEL.pipeline, value: formatMoney(totals.value.pipelineAmount.amount, currency), tone: "neutral" },
        { id: "closed", label: FORECAST_LABEL.closed, value: formatMoney(totals.value.closedAmount.amount, currency), tone: "success" },
      ]
    : [];

  const columns: readonly DataTableColumn<PipelineRow>[] = [
    {
      id: "name",
      header: PIPELINE_TEXT.columnOpportunity,
      // A link, not a row-click handler: navigable, middle-clickable and
      // shareable in a way a click handler is not. Same reasoning as the
      // account list - and design-ui 2.0 dropped onRowClick entirely, which
      // only removed a second, worse way to reach the same page.
      cell: (row) => (
        <div>
          <div>
            <Link href={`/pipeline/${row.id}`}>{row.name}</Link>
          </div>
          <div>
            {row.opportunityNo} / {row.accountName}
          </div>
        </div>
      ),
    },
    {
      id: "stage",
      header: PIPELINE_TEXT.columnStage,
      cell: (row) => (
        <StatusBadge tone={STAGE_TONE[row.stage as Stage]} dot>
          {STAGE_LABEL[row.stage as Stage]}
        </StatusBadge>
      ),
    },
    {
      id: "forecast",
      header: PIPELINE_TEXT.columnForecast,
      cell: (row) => (
        <StatusBadge tone={FORECAST_TONE[row.forecastCategory as ForecastCategory]}>
          {FORECAST_LABEL[row.forecastCategory as ForecastCategory]}
        </StatusBadge>
      ),
    },
    {
      id: "amount",
      header: PIPELINE_TEXT.columnAmount,
      align: "right",
      cell: (row) => formatMoney(row.amount?.amount ?? null, row.currency),
    },
    {
      id: "probability",
      header: PIPELINE_TEXT.columnProbability,
      align: "right",
      // An overridden win rate is marked. A number the machine suggested and a
      // number a salesperson committed to look identical in the database and
      // mean entirely different things in a review.
      cell: (row) => {
        const p = probabilityDisplay(row);
        if (p.value == null) return "-";
        return p.overridden ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <StatusBadge tone="info">{PIPELINE_TEXT.probabilityOverridden(p.value)}</StatusBadge>
              </span>
            </TooltipTrigger>
            <TooltipContent>{PIPELINE_TEXT.probabilityHintOverridden(p.stageDefault)}</TooltipContent>
          </Tooltip>
        ) : (
          <span>{p.value}%</span>
        );
      },
    },
    {
      id: "close",
      header: PIPELINE_TEXT.columnExpectedClose,
      cell: (row) => (row.expectedCloseAt ? row.expectedCloseAt.toISOString().slice(0, 10) : "-"),
    },
  ];

  return (
    <Section
      icon="table"
      title={PIPELINE_TEXT.title}
      description={readOnly ? PIPELINE_TEXT.descriptionReadOnly : PIPELINE_TEXT.description}
    >
      {totals.ok ? <MetricGrid items={metrics} /> : null}
      {!totals.ok ? (
        <EmptyState
          title={PIPELINE_TEXT.rollupFailedTitle}
          description={totals.violations.map((v) => v.message).join("; ")}
        />
      ) : rows.length === 0 ? (
        <EmptyState title={PIPELINE_TEXT.emptyTitle} description={PIPELINE_TEXT.emptyDescription} />
      ) : (
        <>
          {/* The tool row: what this list looks like, and how many are in it.
              FilterBar owns the arrangement - view switch left, count beside
              it - so the page does not invent a second toolbar grammar. */}
          <FilterBar
            view={view}
            onViewChange={setView}
            count={PIPELINE_TEXT.rowCount(rows.length)}
          />

          {/* ONLY THE TABLE IS IN A CARD, not the section. The section is a
              heading and its tools; the card is the surface the rows sit on, so
              wrapping the whole section would put the heading inside the thing
              it names. */}
          <TableCard>
            {view === "list" ? (
              <DataTable
                leadingSpacer
                indexStart={1}
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                loading={loading}
                /* The fixed column: pinned right, locked during horizontal
                   scroll, one trigger rather than a row of buttons. A wide
                   table scrolls its own actions out of reach otherwise, and
                   this table is eight columns before the actions. */
                rowActions={(row) => (
                  <ActionMenu
                    items={[
                      {
                        id: "open",
                        label: PIPELINE_TEXT.openDeal,
                        icon: "arrow-right",
                        onSelect: () => router.push(`/pipeline/${row.id}`),
                      },
                    ]}
                  />
                )}
              />
            ) : (
              <ListCardGrid className="p-md">
                {rows.map((row) => (
                  <ListCard
                    key={row.id}
                    title={<Link href={`/pipeline/${row.id}`}>{row.name}</Link>}
                    description={`${row.opportunityNo} / ${row.accountName}`}
                    status={
                      <StatusBadge tone={FORECAST_TONE[row.forecastCategory]}>
                        {FORECAST_LABEL[row.forecastCategory]}
                      </StatusBadge>
                    }
                    actions={
                      <ActionMenu
                        items={[
                          {
                            id: "open",
                            label: PIPELINE_TEXT.openDeal,
                            icon: "arrow-right",
                            onSelect: () => router.push(`/pipeline/${row.id}`),
                          },
                        ]}
                      />
                    }
                    meta={
                      <>
                        <StatusBadge tone={STAGE_TONE[row.stage as Stage]}>
                          {STAGE_LABEL[row.stage as Stage] ?? row.stage}
                        </StatusBadge>
                        <span className="tabular-nums">{formatMoney(row.amount?.amount ?? null, row.currency)}</span>
                        {/* Same two-case reading as the column: a null win rate
                            prints a dash rather than a zero, because "nobody has
                            set one" and "we think we lose" are different. */}
                        <span className="tabular-nums">
                          {probabilityDisplay(row).value == null ? "-" : `${probabilityDisplay(row).value}%`}
                        </span>
                      </>
                    }
                  />
                ))}
              </ListCardGrid>
            )}
          </TableCard>
        </>
      )}
    </Section>
  );
}
