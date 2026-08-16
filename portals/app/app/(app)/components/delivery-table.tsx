"use client";

import { DataTable, EmptyState, StatusBadge, type DataTableColumn } from "@vxture/design-system";
import type { ProjectHealth } from "../../domains/delivery/lib/revenue";
import { DELIVERY_TEXT, PROJECT_HEALTH_LABEL } from "../lib/messages";
import { formatMoney } from "../lib/view-model";

// The delivery table. Client-side because DataTableColumn.cell is a function
// and functions do not cross the RSC boundary - see account-table.tsx.
//
// The health column shows the DERIVED value with the downgrade called out,
// rather than quietly replacing what the delivery team reported. "We are fine"
// standing next to "they have not paid" is the single most common way a failing
// engagement stays green until it is a crisis.

const HEALTH_TONE: Record<ProjectHealth, "success" | "warning" | "danger"> = {
  green: "success",
  amber: "warning",
  red: "danger",
};

export interface DeliveryRow {
  id: string;
  name: string;
  projectNo: string;
  accountId: string;
  managerSub: string | null;
  contractAmount: number | null;
  currency: string;
  status: string;
  reported: ProjectHealth;
  derived: ProjectHealth;
  overriddenBecause: string | null;
}

export interface DeliveryTableProps {
  readonly rows: readonly DeliveryRow[];
}

export function DeliveryTable({ rows }: DeliveryTableProps) {
  if (rows.length === 0) {
    return <EmptyState title={DELIVERY_TEXT.emptyTitle} description={DELIVERY_TEXT.emptyDescription} />;
  }

  const columns: readonly DataTableColumn<DeliveryRow>[] = [
    {
      id: "name",
      header: DELIVERY_TEXT.columnName,
      cell: (row) => (
        <div>
          <div>{row.name}</div>
          <div>{row.projectNo}</div>
        </div>
      ),
    },
    { id: "account", header: DELIVERY_TEXT.columnAccount, cell: (row) => row.accountId.slice(0, 8) },
    { id: "manager", header: DELIVERY_TEXT.columnManager, cell: (row) => row.managerSub ?? "-" },
    {
      id: "health",
      header: DELIVERY_TEXT.columnHealth,
      cell: (row) => (
        <>
          <StatusBadge tone={HEALTH_TONE[row.derived]} dot>
            {PROJECT_HEALTH_LABEL[row.derived] ?? row.derived}
          </StatusBadge>
          {/* The downgrade is shown, with its reason, rather than quietly
              replacing what the team reported. */}
          {row.overriddenBecause ? (
            <StatusBadge tone="warning">{DELIVERY_TEXT.healthOverridden}</StatusBadge>
          ) : null}
        </>
      ),
    },
    {
      id: "contract",
      header: DELIVERY_TEXT.columnContract,
      align: "right",
      cell: (row) => formatMoney(row.contractAmount, row.currency),
    },
    { id: "status", header: DELIVERY_TEXT.columnStatus, cell: (row) => row.status },
  ];

  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />;
}
