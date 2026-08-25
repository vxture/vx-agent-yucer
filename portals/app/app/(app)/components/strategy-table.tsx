"use client";

import { useState } from "react";
import {
  DataTable,
  EmptyState,
  FilterBar,
  ListCard,
  ListCardGrid,
  StatusBadge,
  type DataTableColumn,
  type FilterBarView,
} from "@vxture/design-ui";
import type { PlanRecord } from "../../domains/strategy/store";
import { nextPlanStatuses } from "../../domains/strategy/lib/lifecycle";
import { PLAN_STATUS_LABEL, STRATEGY_TEXT } from "../lib/messages";
import { LifecycleControl } from "./lifecycle-control";
import { TableCard } from "./table-card";

// The plan list's table. Client-side because DataTableColumn.cell is a function
// and functions do not cross the RSC boundary - see account-table.tsx.
//
// `onMove` is a SERVER ACTION passed down from the page. That is allowed where a
// plain function is not: a "use server" export is serialised as a reference the
// client can call, which is exactly the mechanism the error message points at.

export interface StrategyTableProps {
  readonly rows: readonly PlanRecord[];
  /**
   * planId -> how many campaigns point at it, counted on the page.
   *
   * Undefined when the member may not read campaigns - campaign.view is a
   * separate permission - and the column then says nothing rather than showing
   * a zero, because "none" and "you cannot see" are different facts.
   */
  readonly campaignCounts?: ReadonlyMap<string, number>;
  readonly canMove: boolean;
  readonly onMove: (
    id: string,
    to: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function StrategyTable({
  rows,
  campaignCounts,
  canMove,
  onMove,
}: StrategyTableProps) {
  const [view, setView] = useState<FilterBarView>("list");

  if (rows.length === 0) {
    return (
      <EmptyState
        title={STRATEGY_TEXT.emptyTitle}
        description={STRATEGY_TEXT.emptyDescription}
      />
    );
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
    {
      id: "period",
      header: STRATEGY_TEXT.columnPeriod,
      cell: (row) => row.period,
    },
    {
      id: "owner",
      header: STRATEGY_TEXT.columnOwner,
      // A raw subject, marked as one - the same call as every other list here.
      cell: (row) =>
        row.ownerSub ? (
          <span className="text-muted-foreground font-mono text-xs">
            {row.ownerSub}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            {STRATEGY_TEXT.ownerNone}
          </span>
        ),
    },
    {
      id: "campaigns",
      header: STRATEGY_TEXT.columnCampaigns,
      align: "center",
      // THE PAGE'S CLAIM, MADE CHECKABLE. The subtitle says everything
      // downstream traces back to a strategy; a list of two rows asserts that
      // without showing it. The count is the cheapest possible proof, and a
      // strategy with none is worth seeing - it is a plan nobody acted on.
      cell: (row) => <Campaigns count={campaignCounts?.get(row.id)} />,
    },
    {
      id: "status",
      header: STRATEGY_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge tone={row.status === "active" ? "success" : "neutral"} dot>
          {PLAN_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
  ];

  const actions = (row: PlanRecord) => (
    <LifecycleControl
      id={row.id}
      status={row.status}
      options={nextPlanStatuses(row.status)}
      label={PLAN_STATUS_LABEL}
      canChange={canMove}
      onChange={onMove}
    />
  );

  return (
    <>
      <FilterBar
        view={view}
        onViewChange={setView}
        count={STRATEGY_TEXT.rowCount(rows.length)}
      />

      <TableCard>
        {view === "list" ? (
          <DataTable
            leadingSpacer
            indexStart={1}
            /* Pinned right by the DS, fixed width, locked during horizontal
               scroll. Moving it out of `columns` is what makes it behave that
               way - as an ordinary column it scrolled away from the row it acts
               on. */
            rowActions={actions}
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
                description={`${row.planNo} / ${row.period}`}
                status={
                  <StatusBadge
                    tone={row.status === "active" ? "success" : "neutral"}
                    dot
                  >
                    {PLAN_STATUS_LABEL[row.status] ?? row.status}
                  </StatusBadge>
                }
                actions={actions(row)}
                meta={<Campaigns count={campaignCounts?.get(row.id)} />}
              />
            ))}
          </ListCardGrid>
        )}
      </TableCard>
    </>
  );
}

/**
 * How many campaigns point at this strategy.
 *
 * Three states, not two. Undefined means the member cannot read campaigns and
 * the cell says nothing; zero means the plan exists and nobody acted on it,
 * which is worth seeing rather than hiding behind a dash.
 */
function Campaigns({ count }: { count: number | undefined }) {
  if (count === undefined)
    return <span className="text-muted-foreground">-</span>;
  if (count === 0)
    return (
      <StatusBadge tone="neutral">{STRATEGY_TEXT.noCampaigns}</StatusBadge>
    );
  return (
    <StatusBadge tone="info">{STRATEGY_TEXT.campaignCount(count)}</StatusBadge>
  );
}
