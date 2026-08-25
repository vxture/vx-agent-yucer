"use client";

import { useState } from "react";
import Link from "next/link";
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
import type { ProjectHealth } from "../../domains/delivery/lib/revenue";
import {
  DELIVERY_TEXT,
  PROJECT_HEALTH_LABEL,
  PROJECT_STATUS_LABEL,
} from "../lib/messages";
import { formatMoney } from "../lib/view-model";
import { TableCard } from "./table-card";

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
  /** Resolved on the page. Null when the member may not read accounts. */
  accountName: string | null;
}

export interface DeliveryTableProps {
  readonly rows: readonly DeliveryRow[];
}

export function DeliveryTable({ rows }: DeliveryTableProps) {
  const [view, setView] = useState<FilterBarView>("list");

  if (rows.length === 0) {
    return (
      <EmptyState
        title={DELIVERY_TEXT.emptyTitle}
        description={DELIVERY_TEXT.emptyDescription}
      />
    );
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
    {
      id: "account",
      header: DELIVERY_TEXT.columnAccount,
      // A LINK, and the name when we have it. This printed
      // `row.accountId.slice(0, 8)` - the first eight characters of an id, which
      // identifies nothing to a reader, cannot be clicked, and on this dataset
      // is the same string on every row, so the column distinguished the rows
      // from each other not at all. The full id was right there and
      // /account/[id] already exists.
      cell: (row) => (
        <Link
          href={`/account/${row.accountId}`}
          className="text-foreground hover:underline"
        >
          {row.accountName ?? row.accountId}
        </Link>
      ),
    },
    {
      id: "manager",
      header: DELIVERY_TEXT.columnManager,
      // A raw subject, marked as one - the same call as the account list's
      // owner column. Dressing a machine string as a person is how a UUID ends
      // up in front of someone who then does not chase it.
      cell: (row) =>
        row.managerSub ? (
          <span className="text-muted-foreground font-mono text-xs">
            {row.managerSub}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            {DELIVERY_TEXT.managerNone}
          </span>
        ),
    },
    {
      id: "health",
      header: DELIVERY_TEXT.columnHealth,
      align: "center",
      cell: (row) => <Health row={row} />,
    },
    {
      id: "contract",
      header: DELIVERY_TEXT.columnContract,
      align: "right",
      cell: (row) => formatMoney(row.contractAmount, row.currency),
    },
    {
      id: "status",
      header: DELIVERY_TEXT.columnStatus,
      align: "center",
      // Labelled. This rendered the raw enum - `active`, `planning`,
      // `delivered` in English - and was the one status column in the product
      // not mapped through a label record.
      cell: (row) => (
        <StatusBadge tone="neutral" dot>
          {PROJECT_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
      <FilterBar
        view={view}
        onViewChange={setView}
        count={DELIVERY_TEXT.rowCount(rows.length)}
      />

      {/* NO ACTION COLUMN, and that is a gap rather than a decision. The
          delivery domain HAS verbs - reconcileProjectHealth and
          transitionInstalment both exist in service.ts - but neither is wired
          to a server action and there is no delivery/actions.ts at all, so
          there is nothing for a menu to call. Inventing the write path here
          would be inventing gate and revalidation semantics this file has no
          standing to decide. */}
      <TableCard>
        {view === "list" ? (
          <DataTable
            leadingSpacer
            indexStart={1}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
          />
        ) : (
          <ListCardGrid className="p-md">
            {rows.map((row) => (
              <ListCard
                key={row.id}
                title={row.name}
                description={`${row.projectNo} / ${row.accountName ?? row.accountId}`}
                status={<Health row={row} />}
                meta={
                  <>
                    <span>{formatMoney(row.contractAmount, row.currency)}</span>
                    <span>
                      {PROJECT_STATUS_LABEL[row.status] ?? row.status}
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
 * The derived health, and the downgrade when there is one.
 *
 * The REASON rides a tooltip rather than the row. "Downgraded" without a why is
 * an accusation the reader cannot check, and checkable is the property this
 * whole domain is built on - but the reason is a sentence, and a sentence per
 * row would make the column the widest thing on the table.
 *
 * The rule is stated in the product's own language and the rule layer's
 * sentence sits under it as evidence. That sentence arrives in ENGLISH -
 * deriveProjectHealth writes it in a source file the repo requires to be
 * ASCII-only - so it cannot serve as product copy, and it was previously the
 * entire tooltip. Demoting it to evidence is honest about what it is; making
 * the rule return a structured reason instead is TD-010.
 */
function Health({ row }: { row: DeliveryRow }) {
  const badge = (
    <StatusBadge tone={HEALTH_TONE[row.derived]} dot>
      {PROJECT_HEALTH_LABEL[row.derived] ?? row.derived}
    </StatusBadge>
  );

  if (!row.overriddenBecause) return badge;

  return (
    <span className="inline-flex items-center gap-xs">
      {badge}
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <StatusBadge tone="warning">
              {DELIVERY_TEXT.healthOverridden}
            </StatusBadge>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span className="flex flex-col gap-2xs">
            <span>{DELIVERY_TEXT.healthOverriddenWhy}</span>
            <span className="opacity-70">
              {DELIVERY_TEXT.healthOverriddenEvidence}: {row.overriddenBecause}
            </span>
          </span>
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
