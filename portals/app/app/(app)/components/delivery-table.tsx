"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ActionMenu,
  useToast,
  DataTable,
  EmptyState,
  FilterBar,
  ListCard,
  ListCardGrid,
  Stack,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type DataTableColumn,
  type FilterBarView,
} from "@vxture/design-ui";
import type { HealthOverride, ProjectHealth } from "../../domains/delivery/lib/revenue";
import { formatMoney } from "../lib/view-model";
import { TableCard } from "./table-card";

import { useMessages } from "../lib/i18n/provider";
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
  overriddenBecause: HealthOverride | null;
  /** Resolved on the page. Null when the member may not read accounts. */
  accountName: string | null;
}

export interface DeliveryTableProps {
  /** False when the member may read delivery but not change it. */
  readonly canWrite?: boolean;
  readonly onReconcile?: (projectId: string) => Promise<{
    ok: boolean;
    health?: string;
    changed?: boolean;
    because?: HealthOverride | null;
    error?: string;
  }>;
  readonly rows: readonly DeliveryRow[];
}

export function DeliveryTable({
  rows,
  canWrite = false,
  onReconcile,
}: DeliveryTableProps) {
  const {
    DATA_TABLE_LABELS,
    DELIVERY_TEXT,
    DS_LABELS,
    PROJECT_HEALTH_LABEL,
    PROJECT_STATUS_LABEL,
    PROJECT_ERROR,
    healthOverrideText,
  } = useMessages();
  const { toast } = useToast();
  const [, start] = useTransition();
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
      // THE PROJECT AND WHOSE IT IS, in one cell. Side by side they were 62px
      // and 56px, and a project name broke over four lines to fit - "POS 上线
      // 一 - 期" - while the customer beside it did the same. One column of the
      // two widths added together lets each line use all of it, which is why
      // this merge SHORTENS the row rather than paying for itself in height.
      //
      // The account stays A LINK, and the name when we have it. This printed
      // `row.accountId.slice(0, 8)` - the first eight characters of an id,
      // which identifies nothing to a reader, cannot be clicked, and on this
      // dataset is the same string on every row, so the column distinguished
      // the rows from each other not at all.
      id: "name",
      header: DELIVERY_TEXT.columnNameAccount,
      // The same floor pipeline's identity column takes, and for the same
      // reason: auto-layout was giving the row's own name 103px while the two
      // badges beside it held 168.
      width: "md",
      cell: (row) => (
        <Stack gap="sm">
          <span>{row.name}</span>
          {/* The customer, smaller and quieter - main over sub. The project
              NUMBER used to sit on this line and is gone: an identifier is
              what the detail page is for, and here it was spending a third of
              the cell to say something no reader was scanning for. */}
          <Link
            href={`/account/${row.accountId}`}
            className="text-muted-foreground text-body-sm hover:underline"
          >
            {row.accountName ?? row.accountId}
          </Link>
        </Stack>
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
          <span className="text-muted-foreground font-mono text-body-sm">
            {row.managerSub}
          </span>
        ) : (
          <span className="text-muted-foreground text-body-sm">
            {DELIVERY_TEXT.managerNone}
          </span>
        ),
    },
    {
      // HEALTH OVER STATUS, the third table to take this shape. A delivery
      // health signal and the project's declared status are one reading - "at
      // risk, and still marked active" is the sentence - and they were split
      // into two columns with the contract amount wedged between them.
      //
      // The status is labelled. It rendered the raw enum - `active`,
      // `planning`, `delivered` in English - and was the one status column in
      // the product not mapped through a label record.
      id: "health",
      header: DELIVERY_TEXT.columnHealthStatus,
      align: "center",
      cell: (row) => (
        <Stack gap="sm" className="items-center">
          <Health row={row} />
          <StatusBadge tone="neutral" dot>
            {PROJECT_STATUS_LABEL[row.status] ?? row.status}
          </StatusBadge>
        </Stack>
      ),
    },
    {
      id: "contract",
      header: DELIVERY_TEXT.columnContract,
      align: "right",
      cell: (row) => formatMoney(row.contractAmount, row.currency),
    },
  ];

  function actions(row: DeliveryRow) {
    if (!onReconcile) return null;
    return (
      <ActionMenu
        label={DS_LABELS.actionMenu}
        items={[
          {
            id: "reconcile",
            label: DELIVERY_TEXT.reconcile,
            icon: "refresh",
            hint: DELIVERY_TEXT.reconcileHint,
            onSelect: () =>
              start(() => {
                void onReconcile(row.id).then((r) => {
                  if (!r.ok)
                    return toast({
                      tone: "danger",
                      title: PROJECT_ERROR[r.error ?? "denied"] ?? PROJECT_ERROR.not_found,
                    });
                  // THREE OUTCOMES, THREE MESSAGES. Saying "recomputed" for all
                  // of them would hide the one that matters: the report and the
                  // rows agreed, which is a different fact from having just
                  // corrected a misreport.
                  if (!r.changed) {
                    return toast({
                      tone: "info",
                      title: DELIVERY_TEXT.reconcileAgreed,
                    });
                  }
                  toast({
                    tone: "warning",
                    title: DELIVERY_TEXT.reconcileChanged(
                      PROJECT_HEALTH_LABEL[r.health ?? ""] ?? r.health ?? "",
                    ),
                    description: r.because
                      ? DELIVERY_TEXT.reconcileWhy(healthOverrideText(r.because))
                      : undefined,
                  });
                });
              }),
          },
        ]}
      />
    );
  }

  return (
    <>
      <FilterBar
        view={view}
        onViewChange={setView}
        count={DELIVERY_TEXT.rowCount(rows.length)}
      />

      {/* THE ACTION COLUMN CARRIES ONE VERB (batch 6a-3a), and the other one
          is not missing from it by oversight.

          `reconcileProjectHealth` is a project-row action and is here.
          `transitionInstalment` is not: this table's rows are PROJECTS, and an
          instalment is not one of them. It needs a collections surface that
          does not exist yet - `projectView` already returns the instalments and
          nothing renders them - so wiring it here would mean inventing a row
          type this table does not have. Tracked as its own item, not as part of
          this one. */}
      <TableCard>
        {view === "list" ? (
          <DataTable
            labels={DATA_TABLE_LABELS}
            rowActions={canWrite && onReconcile ? actions : undefined}
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
  const { DELIVERY_TEXT, PROJECT_HEALTH_LABEL, healthOverrideText } = useMessages();
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
              {DELIVERY_TEXT.healthOverriddenEvidence}: {healthOverrideText(row.overriddenBecause)}
            </span>
          </span>
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
