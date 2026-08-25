"use client";

import { useState } from "react";
import {
  DataTable,
  EmptyState,
  FilterBar,
  ListCard,
  ListCardGrid,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type DataTableColumn,
  type FilterBarView,
} from "@vxture/design-ui";
import type { AttainmentRow } from "../../domains/planning/service";
import { formatMoney, formatPercent } from "../lib/view-model";
import { TableCard } from "./table-card";

import { useMessages } from "../lib/i18n/provider";
import type { Dictionary } from "../lib/i18n/dictionary";
// The attainment table. Client-side because DataTableColumn.cell is a function
// and functions do not cross the RSC boundary - see account-table.tsx.
//
// The column that matters is attainment, and the thing it must never do is
// render "no snapshot yet" as 0%. One means nobody has forecast this scope this
// period; the other means the period is going badly. Collapsing them makes an
// unset quota look like a missed one.

/**
 * What the row's quota is assigned TO.
 *
 * A territory rendered its `territoryId` - so the column read `terr_east`, a
 * code, when the territory table carries a `name` column and listTerritories is
 * a gated service the page can already call. The page resolves what it can and
 * passes a map in; anything unresolved falls back to the code rather than to a
 * blank, because a code a reader can look up beats an absence they cannot.
 */
function scopeLabel(
  row: AttainmentRow,
  names: ReadonlyMap<string, string>,
  PLANNING_TEXT: Dictionary["PLANNING_TEXT"],
): string {
  const t = row.target;
  if (t.scopeType === "workspace") return PLANNING_TEXT.scopeWorkspace;
  if (t.scopeType === "territory") {
    if (!t.territoryId) return PLANNING_TEXT.scopeUnnamed;
    return names.get(t.territoryId) ?? t.territoryId;
  }
  return t.ownerSub ?? PLANNING_TEXT.scopeUnnamed;
}

export interface PlanningTableProps {
  readonly rows: readonly AttainmentRow[];
  /** territoryId -> name, resolved on the page. Empty when unreadable. */
  readonly territoryNames?: ReadonlyMap<string, string>;
}

export function PlanningTable({ rows, territoryNames }: PlanningTableProps) {
  const {
    DATA_TABLE_LABELS,
    PLANNING_TEXT,
    TARGET_METRIC_LABEL,
    TARGET_STATUS_LABEL,
  } = useMessages();
  const [view, setView] = useState<FilterBarView>("list");
  const names = territoryNames ?? new Map<string, string>();

  if (rows.length === 0) {
    return (
      <EmptyState
        title={PLANNING_TEXT.emptyTitle}
        description={PLANNING_TEXT.emptyDescription}
      />
    );
  }

  const columns: readonly DataTableColumn<AttainmentRow>[] = [
    {
      id: "scope",
      header: PLANNING_TEXT.columnScope,
      cell: (row) => scopeLabel(row, names, PLANNING_TEXT),
    },
    {
      id: "metric",
      header: PLANNING_TEXT.columnMetric,
      // Labelled. This printed the raw enum, so every row read `revenue`.
      cell: (row) =>
        TARGET_METRIC_LABEL[row.target.metric] ?? row.target.metric,
    },
    {
      id: "target",
      header: PLANNING_TEXT.columnTarget,
      align: "right",
      cell: (row) =>
        formatMoney(
          row.target.targetAmount.amount,
          row.target.targetAmount.currency,
        ),
    },
    {
      id: "closed",
      header: PLANNING_TEXT.columnClosed,
      align: "right",
      cell: (row) =>
        row.closed ? formatMoney(row.closed.amount, row.closed.currency) : "-",
    },
    {
      id: "attainment",
      header: PLANNING_TEXT.columnAttainment,
      align: "center",
      // "No snapshot yet" is rendered as its own state, never as 0%.
      cell: (row) => <Attainment row={row} />,
    },
    {
      id: "status",
      header: PLANNING_TEXT.columnStatus,
      align: "center",
      cell: (row) => (
        <StatusBadge
          tone={row.target.status === "committed" ? "warning" : "neutral"}
        >
          {TARGET_STATUS_LABEL[row.target.status] ?? row.target.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <FilterBar
        view={view}
        onViewChange={setView}
        count={PLANNING_TEXT.rowCount(rows.length)}
      />

      {/* NO ACTION COLUMN. createTarget and updateTarget exist in the planning
          service but nothing is wired - there is no planning/actions.ts - so
          there is nothing for a menu to call. Setting a quota is also not a
          list-row gesture: it is a form with a scope, a metric, a period and an
          amount, and a three-dot menu would be the wrong doorway even once the
          action exists. */}
      <TableCard>
        {view === "list" ? (
          <DataTable
            labels={DATA_TABLE_LABELS}
            leadingSpacer
            indexStart={1}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.target.id}
          />
        ) : (
          <ListCardGrid className="p-md">
            {rows.map((row) => (
              <ListCard
                key={row.target.id}
                title={scopeLabel(row, names, PLANNING_TEXT)}
                description={
                  TARGET_METRIC_LABEL[row.target.metric] ?? row.target.metric
                }
                status={<Attainment row={row} />}
                meta={
                  <>
                    <span>
                      {formatMoney(
                        row.target.targetAmount.amount,
                        row.target.targetAmount.currency,
                      )}
                    </span>
                    <span>
                      {row.closed
                        ? formatMoney(row.closed.amount, row.closed.currency)
                        : "-"}
                    </span>
                    <span>
                      {TARGET_STATUS_LABEL[row.target.status] ??
                        row.target.status}
                    </span>
                  </>
                }
              />
            ))}
          </ListCardGrid>
        )}
      </TableCard>
    </>
  );
}

/**
 * Attainment, with "no snapshot yet" kept as its own state.
 *
 * It must never render as 0%. One means nobody has forecast this scope this
 * period; the other means the period is going badly. Collapsing them reports an
 * unforecast quarter as a failed one.
 */
function Attainment({ row }: { row: AttainmentRow }) {
  const { PLANNING_TEXT } = useMessages();
  if (!row.hasSnapshot) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <StatusBadge tone="neutral">{PLANNING_TEXT.noSnapshot}</StatusBadge>
          </span>
        </TooltipTrigger>
        <TooltipContent>{PLANNING_TEXT.noSnapshotHint}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <StatusBadge
      tone={row.ratio != null && row.ratio >= 1 ? "success" : "neutral"}
    >
      {formatPercent(row.ratio)}
    </StatusBadge>
  );
}
