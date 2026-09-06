"use client";

import { useState, useTransition, type ReactNode } from "react";
import { DataTable, EmptyState, Section, StatusBadge, useToast } from "@vxture/design-ui";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import { FORECAST_TONE } from "../lib/view-model";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions, rowClickSelection } from "./table-fittings";
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
  const { DATA_TABLE_LABELS, FORECAST_RULE_TEXT, FORECAST_RULE_ERROR, FORECAST_LABEL } =
    useMessages();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx).
  const [selected, setSelected] = useState<readonly string[]>([]);

  const disputed = rows.filter((r) => !r.agrees && r.suggested !== null);
  const settled = rows.filter((r) => r.agrees || r.suggested === null);

  const columns = [
    {
      id: "deal",
      header: FORECAST_RULE_TEXT.colDeal,
      cell: (r: ForecastRow) => (
        <span className="flex min-w-0 flex-col">
          {/* 主标题字号加大加粗，副行是编号 (owner, 2026-09-06). */}
          <span className="text-foreground truncate text-body-lg font-semibold">{r.dealName}</span>
          <span className="text-muted-foreground mono truncate text-body-sm">
            {r.opportunityNo}
          </span>
        </span>
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
        {table(
          disputed,
          <EmptyState
            title={FORECAST_RULE_TEXT.noneDisputed}
            description={FORECAST_RULE_TEXT.noneDisputedWhy}
          />,
        )}
        {!canApply ? (
          <p className="text-muted-foreground mt-sm text-body-sm">{FORECAST_RULE_TEXT.denied}</p>
        ) : null}
      </Section>

      {settled.length > 0 ? (
        <Section
          id="forecast-agreed"
          icon="file-text"
          title={FORECAST_RULE_TEXT.rosterAgreed}
          description={FORECAST_RULE_TEXT.rosterAgreedWhy}
        >
          {table(
            settled,
            <EmptyState
              title={FORECAST_RULE_TEXT.none}
              description={FORECAST_RULE_TEXT.noneWhy}
            />,
          )}
        </Section>
      ) : null}
    </>
  );
}
