"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ActionMenu,
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  ListCard,
  ListCardGrid,
  MetricGrid,
  NativeSelect,
  Section,
  Stack,
  StatusBadge,
  TableTitleCell,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useListPagination,
  type DataTableColumn,
  type MetricGridItem,
} from "@vxture/design-ui";
import { FilterSlot, PaginationFooter, SearchSlot, useTableSort } from "./table-fittings";
import {
  DEFAULT_STAGE_DEFINITIONS,
  type Stage,
  type StageDefinition,
} from "../../domains/pipeline/lib/stage";
import {
  rollUp,
  type ForecastCategory,
  type ForecastableOpportunity,
} from "../../domains/pipeline/lib/forecast";
import {
  FORECAST_TONE,
  STAGE_TONE,
  formatMoney,
  formatMoneyCompact,
  probabilityDisplay,
  stageLabelFor,
} from "../lib/view-model";

import { useLocale, useMessages } from "../lib/i18n/provider";
import { loadFailureText } from "../lib/load-failure";
import { Tag } from "./tag";
import { priorityKeys } from "../../domains/account/lib/importance";
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
  /**
   * Nobody has reached the economic buyer at this deal's account.
   *
   * ON THE DEAL because that is where it changes a decision. It was a count on
   * a board card - "6 决策人未触达" - which says the workspace has a problem
   * and not which deal has it, and a deal sitting at negotiate with no
   * reachable buyer is the single most expensive thing on this page to read
   * as healthy.
   */
  buyerUnreachable?: boolean;
  /**
   * 优先级 (incr/0090, R11): the customer's tier crossed with the deal's
   * importance, looked up in the workspace's matrix. Null = 未定级 - a pair
   * the matrix has no cell for, never guessed from its neighbours.
   */
  priority?: number | null;
  /** The two levels it was crossed from, for the hover. */
  priorityFrom?: { readonly tier: string; readonly importance: string } | null;
}

export interface PipelineBoardProps {
  readonly rows: readonly PipelineRow[];
  /** The workspace's default (incr/0044), for rows that carry no amount. */
  readonly currency: string;
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
  /** The workspace's own stage catalog (incr/0057). */
  readonly stageDefinitions?: readonly StageDefinition[];
}

/* 排序取值: what each sortable column ORDERS ON, which is not always what
   it renders - a badge sorts on the score inside it, a money cell on the raw
   amount rather than its formatted string. 优先级 sorts on priorityKeys: the
   P, then amount within the same P (R11's 按优先级), 未定级 sinking. */
function sortOn(rows: readonly PipelineRow[]) {
  const keys = priorityKeys(rows.map((r) => ({ row: r, priority: r.priority ?? null, amount: r.amount?.amount ?? null })));
  const byRow = new Map([...keys].map(([k, v]) => [k.row, v] as const));
  return {
    name: (r: PipelineRow) => r.name,
    amount: (r: PipelineRow) => r.amount?.amount ?? null,
    priority: (r: PipelineRow) => byRow.get(r) ?? null,
  };
}

/** P1-P2 are what a review opens with; P5-P6 wait their turn. */
const PRIORITY_TONE = (p: number) => (p <= 2 ? "danger" : p <= 4 ? "warning" : "neutral");

export function PipelineBoard({
  rows,
  currency,
  loading,
  readOnly,
  undated = 0,
  stageDefinitions = DEFAULT_STAGE_DEFINITIONS,
}: PipelineBoardProps) {
  const {
    DATA_TABLE_LABELS,
    DS_LABELS,
    FORECAST_LABEL,
    PIPELINE_TEXT,
    STAGE_LABEL,
    TABLE_TOOLBAR_TEXT,
    LOAD_ERROR,
  } = useMessages();
  const accessors = useMemo(() => sortOn(rows), [rows]);
  const sorted = useTableSort<PipelineRow>(rows, accessors);
  // 工具行 (module rebuild, 2026-09-27): search + 阶段 / 预测 / 优先级 filters
  // and a pager - the list is 93 open deals in the demo, all on one page.
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [forecastFilter, setForecastFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const filtering = query !== "" || stageFilter !== "" || forecastFilter !== "" || priorityFilter !== "";
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (q === "" ||
          r.name.toLowerCase().includes(q) ||
          r.opportunityNo.toLowerCase().includes(q) ||
          r.accountName.toLowerCase().includes(q)) &&
        (stageFilter === "" || r.stage === stageFilter) &&
        (forecastFilter === "" || r.forecastCategory === forecastFilter) &&
        (priorityFilter === "" ||
          (priorityFilter === "none" ? (r.priority ?? null) === null : String(r.priority ?? "") === priorityFilter)),
    );
  }, [rows, query, stageFilter, forecastFilter, priorityFilter]);
  // Sorted BEFORE paging, so a sort orders the list and not just this page.
  const ordered = useMemo(() => sorted.sortRows(visible), [sorted, visible]);
  const pagination = useListPagination(ordered, 20);
  const stagesPresent = useMemo(() => [...new Set(rows.map((r) => r.stage))], [rows]);
  const prioritiesPresent = useMemo(
    () => [...new Set(rows.map((r) => r.priority ?? null).filter((p): p is number => p !== null))].sort((a, b) => a - b),
    [rows],
  );
  const reset = (set: (v: string) => void) => (v: string) => {
    set(v);
    pagination.resetPage();
  };
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
      // THE DEAL, and only the deal (owner, 2026-09-04). This cell used to
      // carry four things - name, number, customer, and the unreachable badge -
      // which broke the rule the rest of this table now follows: a column holds
      // ONE dimension. The customer is a different entity and one a reader
      // filters by, so it has its own column below; the number belongs on the
      // detail page, where an identifier is what you came for.
      //
      // A link, not a row-click handler: navigable, middle-clickable and
      // shareable in a way a click handler is not. Same reasoning as the
      // account list - and design-ui 2.0 dropped onRowClick entirely, which
      // only removed a second, worse way to reach the same page.
      id: "name",
  sortable: true,
      header: PIPELINE_TEXT.columnOpportunity,
      // A FLOOR, because auto-layout gives a column what its content demands
      // and this cell no longer demands anything: with the number and the
      // customer moved out it is one short link, so the table handed it 57px
      // and broke 智能仓储升级 down four lines. The row identity is the one
      // column that should never be the narrowest.
      width: "md",
      cell: (row) => (
        <TableTitleCell
          title={<Link href={`/pipeline/${row.id}`}>{row.name}</Link>}
          tooltip={row.name}
        />
      ),
    },
    {
      // 优先级 (R11): one tag, the cross on hover. Sorting here is 按优先级 -
      // P1 first, the same P by amount, 未定级 last.
      id: "priority",
      header: PIPELINE_TEXT.columnPriority,
      sortable: true,
      cell: (row) => <PriorityTag row={row} />,
    },
    {
      // THE CUSTOMER, main over sub - the same two-line shape delivery uses,
      // with the same gap, so a stacked cell reads the same wherever it
      // appears. The second line is where this deal stands with the people who
      // decide it: today that is the unreachable warning, which is the only
      // chain fact this page is given. Naming the decision-maker and counting
      // the rest needs contacts for MANY accounts at once, and the domain has
      // only a per-account read - see the PR.
      id: "account",
      header: PIPELINE_TEXT.columnAccount,
      cell: (row) => (
        <Stack gap="sm">
          <span>{row.accountName}</span>
          {row.buyerUnreachable ? (
            <span>
              <StatusBadge tone="warning">{PIPELINE_TEXT.buyerUnreachable}</StatusBadge>
            </span>
          ) : null}
        </Stack>
      ),
    },
    {
      // STAGE AND FORECAST CATEGORY, STACKED, and they belong together: one
      // says where the deal has got to, the other says what we are calling it,
      // and a review reads them as a pair - "negotiation, and we are committing
      // it" is a different sentence from either half.
      //
      // Two lines cost no height. The opportunity cell beside it is already two
      // lines (name, then number and account), so the row was that tall before
      // this and is that tall after.
      id: "stage",
      header: PIPELINE_TEXT.columnStageForecastClose,
      cell: (row) => (
        <Stack gap="sm">
          <Tag tone={STAGE_TONE[row.stage as Stage]} dot>
            {stageLabelFor(row.stage, stageDefinitions, STAGE_LABEL)}
          </Tag>
          <Tag
            tone={FORECAST_TONE[row.forecastCategory as ForecastCategory]}
          >
            {FORECAST_LABEL[row.forecastCategory as ForecastCategory]}
          </Tag>
          {/* 预计成交 under the stage (DS 14 batch 4, owner: 压缩到放得下): when
              it closes is the third half of "where it stands", and as a column
              of its own it pushed the table past the 776px middle column. */}
          <span className="text-muted-foreground text-body-small tabular-nums">
            {row.expectedCloseAt ? row.expectedCloseAt.toISOString().slice(0, 10) : "-"}
          </span>
        </Stack>
      ),
    },
    {
      // 金额 with 赢率 beneath (DS 14 batch 4, owner: 压缩到放得下). Two scales
      // in one cell was refused on 2026-09-04 while there was room for both;
      // in the 776px middle column the choice is a stacked cell or a table
      // that scrolls its figures away. Stacked, each keeps its own line and
      // format, and 金额 keeps its sort.
      id: "amount",
      header: PIPELINE_TEXT.columnAmountProbability,
      sortable: true,
      align: "money",
      cell: (row) => (
        <span className="inline-flex flex-col items-end gap-3xs">
          <span>{formatMoney(row.amount?.amount ?? null, row.currency, locale)}</span>
          <ProbabilityLine row={row} stageDefinitions={stageDefinitions} />
        </span>
      ),
    },
  ];

  return (
    <Section
      icon="table"
      title={PIPELINE_TEXT.title}
      // ONLY THE READ-ONLY LINE. The module header above carries the ordinary
      // description, and the same sentence twice on one screen makes a reader
      // check whether the two agree instead of reading either. The read-only
      // variant stays because it says something the header does not: that this
      // particular reader cannot move a deal.
      description={readOnly ? PIPELINE_TEXT.descriptionReadOnly : undefined}
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
        <p className="text-muted-foreground mt-sm text-body-small">
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
            count={filtering ? TABLE_TOOLBAR_TEXT.filteredCount(visible.length, rows.length) : PIPELINE_TEXT.rowCount(rows.length)}
            search={
              <SearchSlot>
                <Input
                  type="search"
                  className="w-full"
                  value={query}
                  placeholder={PIPELINE_TEXT.searchHint}
                  aria-label={TABLE_TOOLBAR_TEXT.searchLabel}
                  onChange={(e) => reset(setQuery)(e.target.value)}
                />
              </SearchSlot>
            }
            onReset={
              filtering
                ? () => {
                    setQuery("");
                    setStageFilter("");
                    setForecastFilter("");
                    setPriorityFilter("");
                    pagination.resetPage();
                  }
                : undefined
            }
            resetLabel={TABLE_TOOLBAR_TEXT.resetFilters}
          >
            <FilterSlot width="w-[7rem]">
              <NativeSelect value={stageFilter} aria-label={PIPELINE_TEXT.filterStage} onChange={(e) => reset(setStageFilter)(e.target.value)}>
                <option value="">{PIPELINE_TEXT.filterAllStages}</option>
                {stagesPresent.map((s) => (
                  <option key={s} value={s}>
                    {stageLabelFor(s, stageDefinitions, STAGE_LABEL)}
                  </option>
                ))}
              </NativeSelect>
            </FilterSlot>
            <FilterSlot width="w-[7rem]">
              <NativeSelect value={forecastFilter} aria-label={PIPELINE_TEXT.filterForecast} onChange={(e) => reset(setForecastFilter)(e.target.value)}>
                <option value="">{PIPELINE_TEXT.filterAllForecast}</option>
                {(Object.keys(FORECAST_LABEL) as ForecastCategory[]).map((k) => (
                  <option key={k} value={k}>
                    {FORECAST_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </FilterSlot>
            <FilterSlot width="w-[6.5rem]">
              <NativeSelect value={priorityFilter} aria-label={PIPELINE_TEXT.columnPriority} onChange={(e) => reset(setPriorityFilter)(e.target.value)}>
                <option value="">{PIPELINE_TEXT.filterAllPriority}</option>
                {prioritiesPresent.map((p) => (
                  <option key={p} value={String(p)}>{`P${p}`}</option>
                ))}
                <option value="none">{PIPELINE_TEXT.priorityUnranked}</option>
              </NativeSelect>
            </FilterSlot>
          </FilterBar>

          {/* ONLY THE TABLE IS IN A CARD, not the section. The section is a
              heading and its tools; the card is the surface the rows sit on, so
              wrapping the whole section would put the heading inside the thing
              it names. */}
            {visible.length === 0 ? null : view === "list" ? (
              <DataTable
                labels={DATA_TABLE_LABELS}
                indexStart={pagination.indexStart}
                columns={columns}
                rows={[...pagination.pageRows]}
                sort={sorted.sort}
                onSortChange={(s) => {
                  sorted.onSortChange(s);
                  pagination.resetPage();
                }}
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
                {pagination.pageRows.map((row) => (
                  <ListCard
                    key={row.id}
                    title={<Link href={`/pipeline/${row.id}`}>{row.name}</Link>}
                    description={
                      row.buyerUnreachable
                        ? `${row.opportunityNo} / ${row.accountName} · ${PIPELINE_TEXT.buyerUnreachable}`
                        : `${row.opportunityNo} / ${row.accountName}`
                    }
                    status={
                      <Tag tone={FORECAST_TONE[row.forecastCategory]}>
                        {FORECAST_LABEL[row.forecastCategory]}
                      </Tag>
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
                        <PriorityTag row={row} />
                        <Tag tone={STAGE_TONE[row.stage as Stage]}>
                          {stageLabelFor(row.stage, stageDefinitions, STAGE_LABEL)}
                        </Tag>
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
                          {probabilityDisplay(row, stageDefinitions).value == null
                            ? "-"
                            : `${probabilityDisplay(row, stageDefinitions).value}%`}
                        </span>
                      </>
                    }
                  />
                ))}
              </ListCardGrid>
            )}
          {visible.length > 0 ? (
            <PaginationFooter pagination={pagination} total={rows.length} filteredTotal={filtering ? visible.length : undefined} />
          ) : (
            <EmptyState title={TABLE_TOOLBAR_TEXT.noMatch} description={TABLE_TOOLBAR_TEXT.noMatchWhy} />
          )}
        </>
      )}
    </Section>
  );
}

function PriorityTag({ row }: { readonly row: PipelineRow }) {
  const { PIPELINE_TEXT, DEAL_PAGE_TEXT } = useMessages();
  const p = row.priority ?? null;
  const tag =
    p === null ? (
      <span className="text-muted-foreground">{PIPELINE_TEXT.priorityUnranked}</span>
    ) : (
      <Tag tone={PRIORITY_TONE(p)}>{`P${p}`}</Tag>
    );
  if (!row.priorityFrom) return tag;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{tag}</span>
      </TooltipTrigger>
      <TooltipContent>{DEAL_PAGE_TEXT.importanceCross(row.priorityFrom.tier, row.priorityFrom.importance)}</TooltipContent>
    </Tooltip>
  );
}

/** 赢率 as a second line under 金额. An overridden rate is marked: a number the
 *  machine suggested and one a salesperson committed look identical in the
 *  database and mean different things in a review. */
function ProbabilityLine({ row, stageDefinitions }: { readonly row: PipelineRow; readonly stageDefinitions: readonly StageDefinition[] }) {
  const { PIPELINE_TEXT } = useMessages();
  const p = probabilityDisplay(row, stageDefinitions);
  if (p.value == null) return <span className="text-muted-foreground text-body-small">-</span>;
  if (!p.overridden) return <span className="text-muted-foreground text-body-small tabular-nums">{PIPELINE_TEXT.probabilityLine(p.value)}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <StatusBadge size="sm" tone="info">
            {PIPELINE_TEXT.probabilityOverridden(p.value)}
          </StatusBadge>
        </span>
      </TooltipTrigger>
      <TooltipContent>{PIPELINE_TEXT.probabilityHintOverridden(p.stageDefault)}</TooltipContent>
    </Tooltip>
  );
}
