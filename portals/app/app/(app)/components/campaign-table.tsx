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
import {
  nextCampaignStatuses,
  type CampaignStatus,
} from "../../domains/strategy/lib/lifecycle";
import { formatMoney } from "../lib/view-model";
import { LifecycleControl } from "./lifecycle-control";
import { TableCard } from "./table-card";

import { useMessages } from "../lib/i18n/provider";
// The campaign table. Client-side because DataTableColumn.cell is a function
// and functions do not cross the RSC boundary - see account-table.tsx.
//
// The return column reads WON revenue, never pipeline. A campaign that
// generated a lot of unclosed pipeline has returned nothing yet, and showing
// pipeline as return is how the same spend gets justified twice.

export interface CampaignRow {
  id: string;
  name: string;
  campaignNo: string;
  channel: string | null;
  budget: number | null;
  currency: string;
  status: string;
  done: number;
  total: number;
  skipped: number;
  wonAmount: number | null;
  returnOnBudget: number | null;
}

export interface CampaignTableProps {
  readonly rows: readonly CampaignRow[];
  readonly canMove: boolean;
  readonly onMove: (
    id: string,
    to: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function CampaignTable({ rows, canMove, onMove }: CampaignTableProps) {
  const { DATA_TABLE_LABELS, CAMPAIGN_STATUS_LABEL, CAMPAIGN_TEXT } =
    useMessages();
  const [view, setView] = useState<FilterBarView>("list");

  if (rows.length === 0) {
    return (
      <EmptyState
        title={CAMPAIGN_TEXT.emptyTitle}
        description={CAMPAIGN_TEXT.emptyDescription}
      />
    );
  }

  const columns: readonly DataTableColumn<CampaignRow>[] = [
    {
      id: "name",
      header: CAMPAIGN_TEXT.columnName,
      cell: (row) => (
        <div>
          <div>{row.name}</div>
          <div>{row.campaignNo}</div>
        </div>
      ),
    },
    {
      id: "channel",
      header: CAMPAIGN_TEXT.columnChannel,
      cell: (row) => row.channel ?? "-",
    },
    {
      id: "budget",
      header: CAMPAIGN_TEXT.columnBudget,
      align: "right",
      cell: (row) => formatMoney(row.budget, row.currency),
    },
    {
      id: "progress",
      header: CAMPAIGN_TEXT.columnProgress,
      cell: (row) => CAMPAIGN_TEXT.progress(row.done, row.total, row.skipped),
    },
    {
      id: "return",
      header: CAMPAIGN_TEXT.columnReturn,
      align: "right",
      cell: (row) =>
        row.returnOnBudget == null ? (
          "-"
        ) : (
          <StatusBadge tone={row.returnOnBudget >= 1 ? "success" : "neutral"}>
            {row.returnOnBudget.toFixed(1)}x
          </StatusBadge>
        ),
    },
    {
      id: "status",
      header: CAMPAIGN_TEXT.columnStatus,
      cell: (row) => (
        <StatusBadge
          tone={row.status === "running" ? "success" : "neutral"}
          dot
        >
          {CAMPAIGN_STATUS_LABEL[row.status] ?? row.status}
        </StatusBadge>
      ),
    },
  ];

  const actions = (row: CampaignRow) => (
    <LifecycleControl
      id={row.id}
      status={row.status}
      options={nextCampaignStatuses(row.status as CampaignStatus)}
      label={CAMPAIGN_STATUS_LABEL}
      canChange={canMove}
      onChange={onMove}
    />
  );

  return (
    <>
      {/* The tool row, same grammar as every other list in the product. */}
      <FilterBar
        view={view}
        onViewChange={setView}
        count={CAMPAIGN_TEXT.rowCount(rows.length)}
      />

      {/* Only the table is in the card - the section is a heading and its
          tools, the card is the surface the rows sit on. Without it the sticky
          action column masked with the page canvas and read as a bluer stripe
          against the rows beside it; TableCard points the mask at the card. */}
      <TableCard>
        {view === "list" ? (
          <DataTable
            labels={DATA_TABLE_LABELS}
            leadingSpacer
            indexStart={1}
            /* Pinned right by the DS, fixed width, locked during horizontal
               scroll. Moving it out of `columns` is what makes it behave that
               way - as an ordinary column it scrolled away from the row it acts
               on.

               A TERMINAL CAMPAIGN RENDERS AN EMPTY CELL HERE, on purpose:
               LifecycleControl returns null when there is no next status, and
               its own file says why. A disabled menu would promise a move that
               does not exist rather than saying the record is finished. */
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
                description={`${row.campaignNo}${row.channel ? ` / ${row.channel}` : ""}`}
                status={
                  <StatusBadge
                    tone={row.status === "completed" ? "success" : "neutral"}
                    dot
                  >
                    {CAMPAIGN_STATUS_LABEL[row.status] ?? row.status}
                  </StatusBadge>
                }
                actions={actions(row)}
                meta={
                  <>
                    <span>
                      {row.budget == null
                        ? "-"
                        : formatMoney(row.budget, row.currency)}
                    </span>
                    <span>
                      {CAMPAIGN_TEXT.progress(row.done, row.total, row.skipped)}
                    </span>
                    <span>
                      {row.returnOnBudget == null
                        ? "-"
                        : `${row.returnOnBudget.toFixed(1)}x`}
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
