"use client";

import { DataTable, EmptyState, StatusBadge, type DataTableColumn } from "@vxture/design-system";
import type { PlanRecord } from "../../domains/strategy/store";
import { nextPlanStatuses } from "../../domains/strategy/lib/lifecycle";
import { PLAN_STATUS_LABEL, STRATEGY_TEXT } from "../lib/messages";
import { LifecycleControl } from "./lifecycle-control";

// The plan list's table. Client-side because DataTableColumn.cell is a function
// and functions do not cross the RSC boundary - see account-table.tsx.
//
// `onMove` is a SERVER ACTION passed down from the page. That is allowed where a
// plain function is not: a "use server" export is serialised as a reference the
// client can call, which is exactly the mechanism the error message points at.

export interface StrategyTableProps {
  readonly rows: readonly PlanRecord[];
  readonly canMove: boolean;
  readonly onMove: (id: string, to: string) => Promise<{ ok: boolean; error?: string }>;
}

export function StrategyTable({ rows, canMove, onMove }: StrategyTableProps) {
  if (rows.length === 0) {
    return <EmptyState title={STRATEGY_TEXT.emptyTitle} description={STRATEGY_TEXT.emptyDescription} />;
  }

  const columns: readonly DataTableColumn<PlanRecord>[] = [
    {
      id: "name",
      header: STRATEGY_TEXT.columnName,
      cell: (row) => (
        <div>
          <div>{row.name}</div>
          <div>{row.planNo}</div>
        </div>
      ),
    },
    { id: "period", header: STRATEGY_TEXT.columnPeriod, cell: (row) => row.period },
    { id: "owner", header: STRATEGY_TEXT.columnOwner, cell: (row) => row.ownerSub ?? "-" },
    {
      id: "status",
      header: STRATEGY_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.status === "active" ? "success" : "neutral"} dot>
          {PLAN_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      // Only the legal moves. An archived plan has none and renders nothing.
      cell: (row) => (
        <LifecycleControl
          id={row.id}
          status={row.status}
          options={nextPlanStatuses(row.status)}
          label={PLAN_STATUS_LABEL}
          canChange={canMove}
          onChange={onMove}
        />
      ),
    },
  ];

  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />;
}
