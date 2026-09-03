"use client";

import { DataTable, EmptyState, Section, StatusBadge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { SaveCell } from "./save-cell";
import { FORECAST_LABEL } from "../lib/messages";
import { FORECAST_TONE } from "../lib/view-model";
import type { ForecastCategory } from "../../domains/pipeline/lib/forecast";

// Where the rule would file each deal, next to where a person filed it.
//
// The owner's ruling of 2026-08-31: SUGGEST, applied one deal at a time. The
// two columns sit side by side because the disagreement between them IS the
// forecast review - forecast.ts has said since batch 1 that a rep at
// `negotiate` who will not commit is making a judgement worth capturing, and
// this page is the first thing that reads that judgement back to anyone.
//
// AGREEING ROWS STAY. A page of nothing but disagreements would read as "these
// are the problem deals" rather than "this is the forecast", and would hide how
// much of the book the rule and the rep already agree on - which is the context
// that makes a disagreement mean anything.
//
// THE BASIS SAYS WHOSE NUMBER IT USED. When the rule cites 35% it is often
// citing the rep's own figure back at them, and "rule says pipeline" without
// that attribution reads as the machine inventing an objection.

export interface ForecastRuleRow {
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
}

export interface ForecastRuleTableProps {
  readonly rows: readonly ForecastRuleRow[];
  readonly canApply: boolean;
  // ONLY AN ID. The server re-derives the suggestion; sending the category
  // would let a stale page apply one that no longer exists.
  readonly onApply: (input: {
    opportunityId: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function ForecastRuleTable({
  rows,
  canApply,
  onApply,
}: ForecastRuleTableProps) {
  const { DATA_TABLE_LABELS, FORECAST_RULE_TEXT, FORECAST_RULE_ERROR } =
    useMessages();

  return (
    <Section id="forecast-rule" icon="trend-up">
      {rows.length === 0 ? (
        <EmptyState
          title={FORECAST_RULE_TEXT.none}
          description={FORECAST_RULE_TEXT.noneWhy}
        />
      ) : (
        <>
          <DataTable
            labels={DATA_TABLE_LABELS}
            rowKey={(r: ForecastRuleRow) => r.opportunityId}
            rows={[...rows]}
            columns={[
              {
                id: "deal",
                header: FORECAST_RULE_TEXT.colDeal,
                cell: (r: ForecastRuleRow) => (
                  <div className="flex flex-col gap-3xs">
                    <span className="text-foreground">{r.dealName}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {r.opportunityNo}
                    </span>
                  </div>
                ),
              },
              {
                id: "filed",
                header: FORECAST_RULE_TEXT.colFiled,
                cell: (r: ForecastRuleRow) => (
                  <StatusBadge tone={FORECAST_TONE[r.filed]}>
                    {FORECAST_LABEL[r.filed]}
                  </StatusBadge>
                ),
              },
              {
                id: "suggested",
                header: FORECAST_RULE_TEXT.colSuggested,
                cell: (r: ForecastRuleRow) =>
                  r.suggested === null || r.agrees ? (
                    // Saying "agrees" beats repeating the badge already one
                    // column to the left.
                    <span className="text-muted-foreground text-xs">
                      {FORECAST_RULE_TEXT.agrees}
                    </span>
                  ) : (
                    <StatusBadge tone={FORECAST_TONE[r.suggested]}>
                      {FORECAST_LABEL[r.suggested]}
                    </StatusBadge>
                  ),
              },
              {
                id: "basis",
                header: FORECAST_RULE_TEXT.colBasis,
                cell: (r: ForecastRuleRow) => (
                  <div className="flex flex-col gap-3xs">
                    <span className="text-muted-foreground text-xs">
                      {r.probabilityIsHuman
                        ? FORECAST_RULE_TEXT.basisHuman(r.probability)
                        : FORECAST_RULE_TEXT.basisDefault(r.probability)}
                    </span>
                    {r.caps.map((c) => (
                      <span key={c} className="text-muted-foreground text-xs">
                        {FORECAST_RULE_TEXT.cap[c] ?? c}
                      </span>
                    ))}
                  </div>
                ),
              },
              {
                id: "stage",
                header: FORECAST_RULE_TEXT.colStage,
                align: "right" as const,
                cell: (r: ForecastRuleRow) =>
                  r.daysAtStage === null ? (
                    // UNKNOWN, not zero. A deal older than the journal has no
                    // history, and printing "0 days" would read as "it just
                    // moved" about something nobody knows.
                    <span className="text-muted-foreground text-xs">
                      {FORECAST_RULE_TEXT.neverMoved}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {FORECAST_RULE_TEXT.stalledFor(r.daysAtStage)}
                    </span>
                  ),
              },
              {
                id: "apply",
                header: FORECAST_RULE_TEXT.colApply,
                align: "center" as const,
                cell: (r: ForecastRuleRow) =>
                  !canApply || r.agrees || r.suggested === null ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <SaveCell
                      errors={FORECAST_RULE_ERROR}
                      label={FORECAST_RULE_TEXT.apply}
                      savedLabel={FORECAST_RULE_TEXT.applied}
                      onSave={() => onApply({ opportunityId: r.opportunityId })}
                    />
                  ),
              },
            ]}
          />
          {!canApply ? (
            <p className="text-muted-foreground mt-sm text-xs">
              {FORECAST_RULE_TEXT.denied}
            </p>
          ) : null}
        </>
      )}
    </Section>
  );
}
