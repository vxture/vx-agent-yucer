"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ActionMenu,
  DataTable,
  EmptyState,
  FilterBar,
  ListCard,
  ListCardGrid,
  MetricGrid,
  Section,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type DataTableColumn,
  type MetricGridItem,
} from "@vxture/design-ui";
import { TableCard } from "./table-card";
import type { Stage } from "../../domains/pipeline/lib/stage";
import type {
  ForecastCategory,
  ForecastableOpportunity,
} from "../../domains/pipeline/lib/forecast";
import { rollUp } from "../../domains/pipeline/lib/forecast";
import {
  FORECAST_TONE,
  STAGE_TONE,
  formatMoney,
  formatMoneyCompact,
  probabilityDisplay,
} from "../lib/view-model";

import { useLocale, useMessages } from "../lib/i18n/provider";
import { loadFailureText } from "../lib/load-failure";
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
  /**
   * Open deals excluded from these totals for having no expected close date.
   *
   * Shown rather than swallowed: after TD-014 the tiles report a PERIOD, and a
   * deal nobody has dated belongs to none. Dropping it silently would make the
   * totals smaller than the book with nothing on screen to explain why.
   */
  readonly undated?: number;
}

export function PipelineBoard({
  rows,
  currency = "CNY",
  loading,
  readOnly,
  undated = 0,
}: PipelineBoardProps) {
  const {
    DATA_TABLE_LABELS,
    DS_LABELS,
    FORECAST_LABEL,
    PIPELINE_TEXT,
    STAGE_LABEL,
    LOAD_ERROR,
  } = useMessages();
  // formatMoney and formatPercent DEFAULT to "zh-CN" and no caller was passing
  // anything, so every figure in the product was formatted Chinese-style
  // whatever the reader's locale. Threading it here fixes this page; the
  // default is the real defect and it is listed in the commit.
  const locale = useLocale();
  // Which arrangement the rows are in. Local: it is a preference about looking,
  // not about which data is on screen, so it has no business in the URL the way
  // the period filter does.
  const [view, setView] = useState<"list" | "cards">("list");
  const router = useRouter();
  const totals = useMemo(() => rollUp(rows, currency), [rows, currency]);

  const metrics: MetricGridItem[] = totals.ok
    ? [
        {
          id: "commit",
          label: FORECAST_LABEL.commit,
          value: formatMoneyCompact(
            totals.value.commitAmount.amount,
            currency,
            locale,
          ),
          tone: "warning",
        },
        {
          id: "best_case",
          label: FORECAST_LABEL.best_case,
          value: formatMoneyCompact(
            totals.value.bestCaseAmount.amount,
            currency,
            locale,
          ),
          tone: "info",
        },
        {
          id: "pipeline",
          label: FORECAST_LABEL.pipeline,
          value: formatMoneyCompact(
            totals.value.pipelineAmount.amount,
            currency,
            locale,
          ),
          tone: "neutral",
        },
        {
          id: "closed",
          label: FORECAST_LABEL.closed,
          value: formatMoneyCompact(
            totals.value.closedAmount.amount,
            currency,
            locale,
          ),
          tone: "success",
        },
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
        <StatusBadge
          tone={FORECAST_TONE[row.forecastCategory as ForecastCategory]}
        >
          {FORECAST_LABEL[row.forecastCategory as ForecastCategory]}
        </StatusBadge>
      ),
    },
    {
      id: "amount",
      header: PIPELINE_TEXT.columnAmount,
      align: "right",
      cell: (row) =>
        formatMoney(row.amount?.amount ?? null, row.currency, locale),
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
                <StatusBadge tone="info">
                  {PIPELINE_TEXT.probabilityOverridden(p.value)}
                </StatusBadge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {PIPELINE_TEXT.probabilityHintOverridden(p.stageDefault)}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span>{p.value}%</span>
        );
      },
    },
    {
      id: "close",
      header: PIPELINE_TEXT.columnExpectedClose,
      cell: (row) =>
        row.expectedCloseAt
          ? row.expectedCloseAt.toISOString().slice(0, 10)
          : "-",
    },
  ];

  return (
    <Section
      icon="table"
      title={PIPELINE_TEXT.title}
      description={
        readOnly ? PIPELINE_TEXT.descriptionReadOnly : PIPELINE_TEXT.description
      }
    >
      {totals.ok ? (
        <MetricGrid
          items={metrics}
          /* TWO COLUMNS, NOT FOUR, and the reason is that the DS's breakpoints
             are on the VIEWPORT while this grid lives in a fixed-width pane.
             At a 1600px window `lg:` applies and forces four cards into a
             488px pane: 102px each, of which 48px is the card's own padding,
             leaving 54px for a value that needs 92. The number was clipped, and
             a clipped figure is not a smaller number - it is a wrong one that
             looks exact.

             Four headline metrics read perfectly well as 2x2, and this is the
             only lever the component offers; a container query is what the case
             actually calls for, and the DS does not have one. */
          columns={2}
        />
      ) : null}
      {undated > 0 ? (
        <p className="text-muted-foreground mt-sm text-xs">
          {PIPELINE_TEXT.undatedExcluded(undated)}
        </p>
      ) : null}
      {!totals.ok ? (
        <EmptyState
          title={PIPELINE_TEXT.rollupFailedTitle}
          description={loadFailureText(totals.violations, LOAD_ERROR)}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={PIPELINE_TEXT.emptyTitle}
          description={PIPELINE_TEXT.emptyDescription}
        />
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
                labels={DATA_TABLE_LABELS}
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
                    label={DS_LABELS.actionMenu}
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
                        label={DS_LABELS.actionMenu}
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
                        <span className="tabular-nums">
                          {formatMoney(
                            row.amount?.amount ?? null,
                            row.currency,
                            locale,
                          )}
                        </span>
                        {/* Same two-case reading as the column: a null win rate
                            prints a dash rather than a zero, because "nobody has
                            set one" and "we think we lose" are different. */}
                        <span className="tabular-nums">
                          {probabilityDisplay(row).value == null
                            ? "-"
                            : `${probabilityDisplay(row).value}%`}
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
