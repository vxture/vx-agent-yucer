"use client";

import Link from "next/link";
import { DataTable, EmptyState, StatusBadge, type DataTableColumn } from "@vxture/design-system";
import type { AccountRecord } from "../../domains/account/store";
import { ACCOUNT_STATUS_LABEL, ACCOUNT_TEXT } from "../lib/messages";
import { healthTone } from "../lib/view-model";

// The account list's table.
//
// It lives in a CLIENT component because DataTableColumn.cell is a function,
// and a function cannot cross the server/client boundary - React refuses to
// serialise it. Building these columns in the page (a server component) threw
// "Functions cannot be passed directly to Client Components" at render time,
// which `next build` never caught because the page is force-dynamic and is
// therefore never prerendered.
//
// The page keeps the gates and the data fetch; only the rendering moved.

export interface AccountTableProps {
  readonly rows: readonly AccountRecord[];
}

export function AccountTable({ rows }: AccountTableProps) {
  if (rows.length === 0) {
    return <EmptyState title={ACCOUNT_TEXT.emptyTitle} description={ACCOUNT_TEXT.emptyDescription} />;
  }

  const columns: readonly DataTableColumn<AccountRecord>[] = [
    {
      id: "name",
      header: ACCOUNT_TEXT.columnName,
      // A link rather than an onRowClick handler: navigable, middle-clickable
      // and shareable in a way a click handler is not.
      cell: (row) => (
        <div>
          <Link href={`/account/${row.id}`}>{row.name}</Link>
          <div>{row.accountNo}</div>
        </div>
      ),
    },
    { id: "industry", header: ACCOUNT_TEXT.columnIndustry, cell: (row) => row.industry ?? "-" },
    { id: "owner", header: ACCOUNT_TEXT.columnOwner, cell: (row) => row.ownerSub ?? "-" },
    {
      id: "health",
      header: ACCOUNT_TEXT.columnHealth,
      align: "right",
      cell: (row) =>
        row.healthScore == null ? (
          <StatusBadge tone="neutral">{ACCOUNT_TEXT.unscored}</StatusBadge>
        ) : (
          <StatusBadge tone={healthTone(row.healthScore)}>{row.healthScore}</StatusBadge>
        ),
    },
    {
      id: "status",
      header: ACCOUNT_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.status === "churned" ? "danger" : "neutral"} dot>
          {ACCOUNT_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
  ];

  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />;
}
