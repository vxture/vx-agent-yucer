"use client";

import { DataTable, EmptyState, StatusBadge, Tooltip, TooltipContent, TooltipTrigger, type DataTableColumn } from "@vxture/design-ui";
import type { AttainmentRow } from "../../domains/planning/service";
import { PLANNING_TEXT, TARGET_STATUS_LABEL } from "../lib/messages";
import { formatMoney, formatPercent } from "../lib/view-model";

// The attainment table. Client-side because DataTableColumn.cell is a function
// and functions do not cross the RSC boundary - see account-table.tsx.
//
// The column that matters is attainment, and the thing it must never do is
// render "no snapshot yet" as 0%. One means nobody has forecast this scope this
// period; the other means the period is going badly. Collapsing them makes an
// unset quota look like a missed one.

function scopeLabel(row: AttainmentRow): string {
  const t = row.target;
  if (t.scopeType === "workspace") return PLANNING_TEXT.scopeWorkspace;
  if (t.scopeType === "territory") return t.territoryId ?? "-";
  return t.ownerSub ?? "-";
}

export interface PlanningTableProps {
  readonly rows: readonly AttainmentRow[];
}

export function PlanningTable({ rows }: PlanningTableProps) {
  if (rows.length === 0) {
    return <EmptyState title={PLANNING_TEXT.emptyTitle} description={PLANNING_TEXT.emptyDescription} />;
  }

  const columns: readonly DataTableColumn<AttainmentRow>[] = [
    { id: "scope", header: PLANNING_TEXT.columnScope, cell: (row) => scopeLabel(row) },
    { id: "metric", header: PLANNING_TEXT.columnMetric, cell: (row) => row.target.metric },
    {
      id: "target",
      header: PLANNING_TEXT.columnTarget,
      align: "right",
      cell: (row) => formatMoney(row.target.targetAmount.amount, row.target.targetAmount.currency),
    },
    {
      id: "closed",
      header: PLANNING_TEXT.columnClosed,
      align: "right",
      cell: (row) => (row.closed ? formatMoney(row.closed.amount, row.closed.currency) : "-"),
    },
    {
      id: "attainment",
      header: PLANNING_TEXT.columnAttainment,
      align: "right",
      // "No snapshot yet" is rendered as its own state, never as 0%.
      cell: (row) =>
        row.hasSnapshot ? (
          <StatusBadge tone={row.ratio != null && row.ratio >= 1 ? "success" : "neutral"}>
            {formatPercent(row.ratio)}
          </StatusBadge>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <StatusBadge tone="neutral">{PLANNING_TEXT.noSnapshot}</StatusBadge>
              </span>
            </TooltipTrigger>
            <TooltipContent>{PLANNING_TEXT.noSnapshotHint}</TooltipContent>
          </Tooltip>
        ),
    },
    {
      id: "status",
      header: PLANNING_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.target.status === "committed" ? "warning" : "neutral"}>
          {TARGET_STATUS_LABEL[row.target.status] ?? row.target.status}
        </StatusBadge>
      ),
    },
  ];

  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.target.id} />;
}
