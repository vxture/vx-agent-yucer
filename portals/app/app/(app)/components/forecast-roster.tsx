"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
  useToast,
} from "@vxture/design-ui";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import { FORECAST_TONE } from "../lib/view-model";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  FilterSlot,
  RowActions,
  SearchSlot,
  rowClickSelection,
} from "./table-fittings";
import type { ForecastCategory } from "../../domains/pipeline/lib/forecast";
import { moreOptimistic } from "../../domains/pipeline/lib/forecast-stats";

// 口径清单 - the catalogue module's pattern, applied to the forecast rule's
// second opinion.
//
// TWO SECTIONS, and the split is the page's argument. The rows where the rule
// and the person DISAGREE are the forecast review; the rows where they agree
// are the context that makes a disagreement mean anything. Both stay - a page
// of nothing but disagreements would read as "these are the problem deals"
// rather than as "this is the forecast" - but they are no longer interleaved,
// so a reviewer can work the first list and read the second.
//
// THE BASIS SAYS WHOSE NUMBER IT USED. When the rule cites 35% it is often
// citing the rep's own figure back at them, and "rule says pipeline" without
// that attribution reads as the machine inventing an objection.

export interface ForecastRow {
  readonly opportunityId: string;
  readonly opportunityNo: string;
  readonly dealName: string;
  readonly filed: ForecastCategory;
  readonly suggested: ForecastCategory | null;
  readonly agrees: boolean;
  readonly probability: number;
  readonly probabilityIsHuman: boolean;
  readonly caps: readonly string[];
  readonly daysAtStage: number | null;
  /** Not rendered here - the analysis block sums it from this same array, so
   * the block above and the list below cannot be counting different deals. */
  readonly amount: number | null;
}

export interface ForecastRosterProps {
  readonly rows: readonly ForecastRow[];
  readonly canApply: boolean;
  // ONLY AN ID. The server re-derives the suggestion; sending the category
  // would let a stale page apply one that no longer exists.
  readonly onApply: (input: {
    opportunityId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function ForecastRoster({ rows, canApply, onApply }: ForecastRosterProps) {
  const {
    DATA_TABLE_LABELS,
    FORECAST_RULE_TEXT,
    FORECAST_RULE_ERROR,
    FORECAST_LABEL,
    TABLE_TOOLBAR_TEXT,
  } = useMessages();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx).
  const [selected, setSelected] = useState<readonly string[]>([]);

  /* 工具行. The deal's name and number are the two free-text fields the row
     shows. The filter is 口径 - the FILED one, not the suggested one: this
     page is a review of what people have committed to, and "show me
     everything filed as 承诺" is the question a forecast review actually
     asks. Filtering on the suggestion would filter on the machine's opinion
     of the deal rather than the person's claim about it. */
  const [query, setQuery] = useState("");
  const [filedFilter, setFiledFilter] = useState("");
  const match = (r: ForecastRow) => {
    const q = query.trim().toLowerCase();
    return (
      (q === "" ||
        r.dealName.toLowerCase().includes(q) ||
        r.opportunityNo.toLowerCase().includes(q)) &&
      (filedFilter === "" || r.filed === filedFilter)
    );
  };
  const narrowed = query.trim() !== "" || filedFilter !== "";

  const isDisputed = (r: ForecastRow) => !r.agrees && r.suggested !== null;
  const disputedTotal = rows.filter(isDisputed).length;
  const settledTotal = rows.filter((r) => !isDisputed(r)).length;

  const shown = rows.filter(match);
  const disputed = shown.filter(isDisputed);
  const settled = shown.filter((r) => !isDisputed(r));

  const columns = [
    {
      id: "deal",
      header: FORECAST_RULE_TEXT.colDeal,
      cell: (r: ForecastRow) => (
        <TableTitleCell
          title={r.dealName}
          description={r.opportunityNo}
          tooltip={r.dealName}
        />
      ),
    },
    {
      id: "filed",
      header: FORECAST_RULE_TEXT.colFiled,
      align: "center" as const,
      cell: (r: ForecastRow) => (
        <StatusBadge tone={FORECAST_TONE[r.filed]}>{FORECAST_LABEL[r.filed]}</StatusBadge>
      ),
    },
    {
      id: "suggested",
      header: FORECAST_RULE_TEXT.colSuggested,
      align: "center" as const,
      cell: (r: ForecastRow) =>
        r.suggested === null || r.agrees ? (
          // Saying "agrees" beats repeating the badge already one column left.
          <span className="text-muted-foreground text-body-sm">{FORECAST_RULE_TEXT.agrees}</span>
        ) : (
          <span className="flex flex-col items-center gap-3xs">
            <StatusBadge tone={FORECAST_TONE[r.suggested]}>
              {FORECAST_LABEL[r.suggested]}
            </StatusBadge>
            {/* WHICH WAY the disagreement goes, said on the row. Filing surer
                than the rule inflates a number somebody will be held to;
                filing less sure hides work that is going well. They are
                different problems and the badge alone does not tell them
                apart. */}
            <span className="text-muted-foreground text-body-sm">
              {moreOptimistic(r.filed, r.suggested)
                ? FORECAST_RULE_TEXT.filedOptimistic
                : FORECAST_RULE_TEXT.filedConservative}
            </span>
          </span>
        ),
    },
    {
      id: "basis",
      header: FORECAST_RULE_TEXT.colBasis,
      align: "center" as const,
      cell: (r: ForecastRow) => (
        <span className="flex flex-col items-center gap-3xs">
          <span className="text-muted-foreground text-body-sm">
            {r.probabilityIsHuman
              ? FORECAST_RULE_TEXT.basisHuman(r.probability)
              : FORECAST_RULE_TEXT.basisDefault(r.probability)}
          </span>
          {r.caps.map((c) => (
            <span key={c} className="text-muted-foreground text-body-sm">
              {FORECAST_RULE_TEXT.cap[c] ?? c}
            </span>
          ))}
        </span>
      ),
    },
    {
      id: "stage",
      header: FORECAST_RULE_TEXT.colStage,
      align: "center" as const,
      cell: (r: ForecastRow) =>
        r.daysAtStage === null ? (
          // UNKNOWN, not zero. A deal older than the journal has no history,
          // and printing "0 days" would read as "it just moved" about
          // something nobody knows.
          <span className="text-muted-foreground text-body-sm">
            {FORECAST_RULE_TEXT.neverMoved}
          </span>
        ) : (
          <span className="text-muted-foreground tabular-nums text-body-sm">
            {FORECAST_RULE_TEXT.stalledFor(r.daysAtStage)}
          </span>
        ),
    },
  ];

  const rowActions = (row: ForecastRow) => (
    <RowActions
      disabled={pending}
      items={
        !canApply || row.agrees || row.suggested === null
          ? []
          : [
              {
                id: "apply",
                label: FORECAST_RULE_TEXT.apply,
                onSelect: () =>
                  start(() => {
                    void onApply({ opportunityId: row.opportunityId }).then((r) => {
                      toast(
                        r.ok
                          ? { tone: "success", title: FORECAST_RULE_TEXT.applied }
                          : {
                              tone: "danger",
                              title:
                                FORECAST_RULE_ERROR[r.error ?? "denied"] ??
                                FORECAST_RULE_ERROR.denied,
                            },
                      );
                    });
                  }),
              },
            ]
      }
    />
  );

  /* THE FIXED COLUMNS ARE FIXED AND EVERYTHING ELSE IS DIVIDED EQUALLY
     (owner, 2026-09-06). */
  const table = (list: readonly ForecastRow[], empty: ReactNode) => {
    const select = rowClickSelection(list, (r) => r.opportunityId, selected, setSelected);
    return (
      <div
        ref={select.ref}
        className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} ${select.className}`}
      >
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowKey={(r: ForecastRow) => r.opportunityId}
          rows={[...list]}
          columns={columns}
          rowActions={rowActions}
          empty={empty}
        />
      </div>
    );
  };

  return (
    <>
      <Section
        id="forecast-disputed"
        icon={moduleIcon("forecastRule")}
        title={FORECAST_RULE_TEXT.rosterDisputed}
        description={FORECAST_RULE_TEXT.rosterDisputedWhy}
      >
        {/* One tool row for both tables; the agreed list below says on its
            own heading that this control is narrowing it. */}
        <FilterBar
          count={
            narrowed
              ? TABLE_TOOLBAR_TEXT.filteredCount(disputed.length, disputedTotal)
              : FORECAST_RULE_TEXT.rowCount(disputed.length)
          }
          search={
            <SearchSlot>
              <Input
                type="search"
                className="w-full"
                value={query}
                placeholder={FORECAST_RULE_TEXT.searchHint}
                aria-label={TABLE_TOOLBAR_TEXT.searchLabel}
                onChange={(e) => setQuery(e.target.value)}
              />
            </SearchSlot>
          }
          onReset={
            narrowed
              ? () => {
                  setQuery("");
                  setFiledFilter("");
                }
              : undefined
          }
          resetLabel={TABLE_TOOLBAR_TEXT.resetFilters}
        >
          <FilterSlot width="w-[9rem]">
            <NativeSelect
              value={filedFilter}
              aria-label={FORECAST_RULE_TEXT.filterAllFiled}
              onChange={(e) => setFiledFilter(e.target.value)}
            >
              <option value="">{FORECAST_RULE_TEXT.filterAllFiled}</option>
              {Object.entries(FORECAST_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </FilterSlot>
        </FilterBar>

        {table(
          disputed,
          narrowed ? (
            <EmptyState
              title={TABLE_TOOLBAR_TEXT.noMatch}
              description={TABLE_TOOLBAR_TEXT.noMatchWhy}
            />
          ) : (
            <EmptyState
              title={FORECAST_RULE_TEXT.noneDisputed}
              description={FORECAST_RULE_TEXT.noneDisputedWhy}
            />
          ),
        )}
        {!canApply ? (
          <p className="text-muted-foreground mt-sm text-body-sm">{FORECAST_RULE_TEXT.denied}</p>
        ) : null}
      </Section>

      {/* Holds its place while narrowed rather than vanishing under a keyword
          and taking its own explanation with it. */}
      {settled.length > 0 || (narrowed && settledTotal > 0) ? (
        <Section
          id="forecast-agreed"
          icon="file-text"
          title={FORECAST_RULE_TEXT.rosterAgreed}
          description={FORECAST_RULE_TEXT.rosterAgreedWhy}
          action={
            narrowed ? (
              <StatusBadge tone="info">{FORECAST_RULE_TEXT.narrowedNote}</StatusBadge>
            ) : undefined
          }
        >
          {table(
            settled,
            narrowed ? (
              <EmptyState
                title={TABLE_TOOLBAR_TEXT.noMatch}
                description={TABLE_TOOLBAR_TEXT.noMatchWhy}
              />
            ) : (
              <EmptyState
                title={FORECAST_RULE_TEXT.none}
                description={FORECAST_RULE_TEXT.noneWhy}
              />
            ),
          )}
        </Section>
      ) : null}
    </>
  );
}
