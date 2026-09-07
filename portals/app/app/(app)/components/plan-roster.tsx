"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  TableTitleCell,
  useToast,
} from "@vxture/design-ui";
import { nextPlanStatuses, type PlanStatus } from "../../domains/strategy/lib/lifecycle";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  RowActions,
  useTableSort,
} from "./table-fittings";

// 战略计划清单 - the catalogue module's pattern, applied to plans on the
// owner's 2026-09-05 ruling. It replaces strategy-table.tsx, which was the
// last list still on the pre-migration ViewHeader + Section + FilterBar shape.
//
// TWO SECTIONS, NOT A FILTER. Running and settled plans are read for different
// reasons - one is this half-year's work, the other is the record - and the
// split is the same one every other roster here makes.
//
// NO 上移/下移 AND NO 删除, and both absences are the design rather than an
// omission. A plan is ordered by its PERIOD, which is data the row already
// carries; a manual rank would be a second, contradictable answer to "which
// half-year is this". And the store has no deletePlan at all: archiving an
// upstream record never destroys the downstream ones that point at it, so the
// way out of a plan is its lifecycle, not a delete.
//
// THE LIFECYCLE MOVES ARE ASKED, NOT LISTED. `nextPlanStatuses` owns which
// moves are legal from here; a menu that offered all five and let the machine
// refuse four teaches people the product says no for reasons they cannot
// predict.

export interface PlanRow {
  readonly id: string;
  readonly planNo: string;
  readonly name: string;
  readonly period: string;
  readonly ownerSub: string | null;
  readonly status: PlanStatus;
  /** Undefined when the reader may not see campaigns - see the cell. */
  readonly campaignCount: number | undefined;
}

export interface PlanRosterProps {
  readonly rows: readonly PlanRow[];
  readonly canEdit: boolean;
  readonly canApprove: boolean;
  readonly onMove: (id: string, to: string) => Promise<{ ok: boolean; error?: string }>;
}

/* 排序取值: what each sortable column ORDERS ON. Not always what the cell
   renders - a money cell sorts on the raw amount, not its formatted string. */
const SORT_ON = {
  name: (r: PlanRow) => r.name,
};

export function PlanRoster({ rows, canEdit, canApprove, onMove }: PlanRosterProps) {
  const { STRATEGY_TEXT, PLAN_ERROR, PLAN_STATUS_LABEL, CATALOG_TEXT, DATA_TABLE_LABELS } =
    useMessages();
  const [pending, startTransition] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). One
  // state across both rosters: the keys are plan ids.
  const [selected, setSelected] = useState<readonly string[]>([]);
  const sorted = useTableSort<PlanRow>([], SORT_ON);
  const { toast } = useToast();

  const live = rows.filter((r) => r.status !== "closed" && r.status !== "archived");
  const settled = rows.filter((r) => r.status === "closed" || r.status === "archived");

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({ tone: "danger", title: PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied });
      });
    });

  const columns = [
    {
      id: "name",
  sortable: true,
      header: STRATEGY_TEXT.columnName,
      cell: (r: PlanRow) => (
        <TableTitleCell title={r.name} description={r.planNo} tooltip={r.name} />
      ),
    },
    {
      id: "period",
      header: STRATEGY_TEXT.columnPeriod,
      width: "sm" as const,
      cell: (r: PlanRow) => (
        <span className="text-muted-foreground tabular-nums text-body-sm">{r.period}</span>
      ),
    },
    {
      id: "owner",
      header: STRATEGY_TEXT.columnOwner,
      // A raw subject, marked as one - the same call every other list here makes.
      cell: (r: PlanRow) =>
        r.ownerSub ? (
          <span className="text-muted-foreground mono truncate text-body-sm">{r.ownerSub}</span>
        ) : (
          <span className="text-muted-foreground text-body-sm">{STRATEGY_TEXT.ownerNone}</span>
        ),
    },
    {
      id: "campaigns",
      header: STRATEGY_TEXT.columnCampaigns,
      width: "sm" as const,
      // THE PAGE'S CLAIM, MADE CHECKABLE - and three states, not two.
      // Undefined means the reader holds no campaign.view and the cell says
      // nothing; zero means the plan exists and nobody acted on it, which is
      // worth seeing rather than hiding behind a dash.
      cell: (r: PlanRow) =>
        r.campaignCount === undefined ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span
            className={`tabular-nums text-body-sm ${
              r.campaignCount === 0 && r.status === "active" ? "text-(color:--warning-text)" : ""
            }`}
          >
            {r.campaignCount}
          </span>
        ),
    },
    {
      id: "status",
      header: CATALOG_TEXT.colStatus,
      width: "sm" as const,
      cell: (r: PlanRow) => (
        <StatusBadge tone={r.status === "active" ? "success" : "neutral"}>
          {PLAN_STATUS_LABEL[r.status] ?? r.status}
        </StatusBadge>
      ),
    },
  ];

  /* ALWAYS rendered (fittings ruling, 2026-09-06): a reader who may neither
     edit nor approve gets the column with an empty, disabled trigger rather
     than a table one column narrower than a colleague's. */
  const rowActions = (row: PlanRow) => {
    const settledRow = row.status === "closed" || row.status === "archived";
    const moves = nextPlanStatuses(row.status).filter(
      // Approval is its own permission. Offering the move to somebody who
      // holds only strategy.plan.update would put the refusal after the click
      // instead of before it.
      (to) => (to === "approved" ? canApprove : canEdit),
    );
    return (
      <RowActions
        disabled={pending}
        items={
          !canEdit && !canApprove
            ? []
            : [
                ...(canEdit && !settledRow
                  ? [
                      {
                        id: "edit",
                        label: CATALOG_TEXT.opEdit,
                        onSelect: () => {
                          window.location.href = `/strategy/new?no=${encodeURIComponent(row.planNo)}`;
                        },
                      },
                    ]
                  : []),
                ...moves.map((to, i) => ({
                  id: `to-${to}`,
                  label: STRATEGY_TEXT.planMoveTo(PLAN_STATUS_LABEL[to] ?? to),
                  separatorBefore: i === 0 && canEdit && !settledRow,
                  onSelect: () => run(onMove(row.id, to)),
                })),
              ]
        }
      />
    );
  };

  /* The catalogue rosters' geometry (TD-022), COUNTED FROM THE LEFT, and
     every leading column is now unconditional: 选择 | 序号 come first for
     every reader, so the business columns start at nth-child(3) and nothing
     to their left can disappear.
       A MIN-WIDTH so the shell can be narrow without crushing the text
       columns: with the fittings ruling's selection column added, the two
       flexible columns here were splitting what the fixed ones left and
       collapsing to an unreadable 56-72px. The DS wrapper is overflow-x-auto,
       so past this width the table scrolls - which is the honest failure for
       a table too wide for its container.
     Order: 选择 | # | name | period | owner | campaigns | status | 操作 */
  const table = (list: readonly PlanRow[]) => (
    <div className={`[&_table]:table-fixed ${EDGE_COLUMNS} [&_thead_th:nth-child(3)]:w-[24%] ${ACTION_COLUMN}`}>
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        rowKey={(r: PlanRow) => r.id}
        rows={[...sorted.sortRows(list)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
        columns={columns}
        rowActions={rowActions}
        empty={
          <EmptyState
            title={STRATEGY_TEXT.emptyTitle}
            description={STRATEGY_TEXT.emptyDescription}
          />
        }
      />
    </div>
  );

  return (
    <>
      <Section
        id="plans"
        icon={moduleIcon("strategy")}
        title={STRATEGY_TEXT.rosterPlan}
        description={STRATEGY_TEXT.rosterPlanWhy}
        action={
          canEdit ? (
            <Button asChild>
              <a href="/strategy/new">{STRATEGY_TEXT.newPlanEntry}</a>
            </Button>
          ) : undefined
        }
      >
        {table(live)}
      </Section>

      {settled.length > 0 ? (
        <Section
          id="plans-settled"
          icon="file-text"
          title={STRATEGY_TEXT.rosterPlanSettled}
          description={STRATEGY_TEXT.rosterPlanSettledWhy}
        >
          {table(settled)}
        </Section>
      ) : null}
    </>
  );
}
