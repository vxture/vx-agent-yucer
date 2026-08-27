"use client";

import { useState } from "react";
import {
  ActionMenu,
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
  /** False when the member may read targets but not move them. */
  readonly canUpdate?: boolean;
  readonly onUpdate?: (
    id: string,
    patch: { amount?: number; status?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function PlanningTable({
  rows,
  territoryNames,
  canUpdate = false,
  onUpdate,
}: PlanningTableProps) {
  const {
    DATA_TABLE_LABELS,
    DS_LABELS,
    PLANNING_TEXT,
    TARGET_METRIC_LABEL,
    TARGET_STATUS_LABEL,
  } = useMessages();
  // The DS confirm outlets, passed together. Word order and full-width
  // punctuation are the caller's job since design-ui 5.0 made the fallback
  // neutral.
  const CONFIRM = {
    titleTemplate: DS_LABELS.confirmTitleTemplate,
    cancelLabel: DS_LABELS.confirmCancel,
    pendingLabel: DS_LABELS.confirmPending,
  };
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

  function actions(row: AttainmentRow) {
    // A CLOSED target gets an empty menu rather than a disabled one. It is
    // frozen by rule - planTargetUpdate refuses every patch on it - so every
    // item would be a click that can only fail.
    if (!onUpdate || row.target.status === "closed") return null;
    const label = scopeLabel(row, names, PLANNING_TEXT);
    return (
      <ActionMenu
        label={DS_LABELS.actionMenu}
        items={[
          {
            id: "adjust",
            label: PLANNING_TEXT.adjust,
            icon: "edit",
            onSelect: () => {
              const next = window.prompt(
                PLANNING_TEXT.setAmount,
                String(row.target.targetAmount.amount),
              );
              if (next === null) return;
              const n = Number(next);
              if (!Number.isFinite(n) || n < 0) return;
              void onUpdate(row.target.id, { amount: n });
            },
          },
          // Committing is offered only from draft, because the rule layer
          // refuses committed -> draft. An item that can only ever be refused
          // is worse than an absent one: it teaches that the product is broken.
          //
          // PLAIN, NOT GUARDED, and the DS forced the question in a useful way:
          // it only lets a `confirm` sit on a `danger: true` item, so asking for
          // a dialog means calling the action dangerous. Committing a quota is
          // one-way but it is the NORMAL step - it is what the page is for.
          // Painting the happy path red would spend the colour that close needs.
          // The one-way part is said in the hint, and enforced by the rule layer
          // either way.
          ...(row.target.status === "draft"
            ? [
                {
                  id: "commit",
                  label: PLANNING_TEXT.commit,
                  icon: "check" as const,
                  hint: PLANNING_TEXT.commitWhy,
                  onSelect: () =>
                    void onUpdate(row.target.id, { status: "committed" }),
                },
              ]
            : []),
          {
            id: "close",
            label: PLANNING_TEXT.closeTarget,
            icon: "lock" as const,
            // GUARDED, and this one earns it: closing freezes the historical
            // record of what was committed for a finished period. Re-opening it
            // to change the number is how a missed quarter becomes a met one,
            // which is precisely what planTargetUpdate refuses afterwards.
            danger: true as const,
            separatorBefore: true,
            confirm: {
              verb: PLANNING_TEXT.closeTarget,
              target: label,
              consequence: PLANNING_TEXT.closeWhy,
              ...CONFIRM,
              onConfirm: () =>
                void onUpdate(row.target.id, { status: "closed" }),
            },
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
        count={PLANNING_TEXT.rowCount(rows.length)}
      />

      {/* THE ACTION COLUMN IS FOR ADJUSTING, NOT FOR SETTING (batch 6a-2).
          This comment used to say there was nothing for a menu to call, which
          was true until planning/actions.ts existed. The half of it that still
          holds is the half worth keeping: CREATING a target is not a row
          gesture - it needs a period, a scope, a metric and an amount that do
          not exist yet - so that lives in the form above the table. What a row
          menu is right for is changing a number you are already looking at, and
          moving its state forward. Both of those are here.

          A CLOSED target gets no menu at all rather than a disabled one: it is
          frozen by rule (planTargetUpdate refuses every patch), and a greyed
          menu invites a click that can only ever fail. */}
      <TableCard>
        {view === "list" ? (
          <DataTable
            labels={DATA_TABLE_LABELS}
            rowActions={canUpdate && onUpdate ? actions : undefined}
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
