"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DataTable,
  EmptyState,
  FilterBar,
  ListCard,
  ListCardGrid,
  TableTitleCell,
  type DataTableColumn,
  type FilterBarView,
} from "@vxture/design-ui";
import { RowActions, useTableSort } from "./table-fittings";
import {
  nextCampaignStatuses,
  type CampaignStatus,
} from "../../domains/strategy/lib/lifecycle";
import { formatMoney } from "../lib/view-model";
import { LifecycleControl } from "./lifecycle-control";

import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
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
  /** campaign.upsert: 编辑 in the row menu. */
  readonly canEdit?: boolean;
  readonly onMove: (
    id: string,
    to: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

/* 排序取值: what each sortable column ORDERS ON, which is not always what
   it renders - a badge sorts on the score inside it, a money cell on the raw
   amount rather than its formatted string. */
const SORT_ON = {
    name: (r: CampaignRow) => r.name,
    budget: (r: CampaignRow) => r.budget,
  };

export function CampaignTable({ rows, canMove, canEdit = false, onMove }: CampaignTableProps) {
  const { DATA_TABLE_LABELS, DS_LABELS, CAMPAIGN_STATUS_LABEL, CAMPAIGN_TEXT } =
    useMessages();
  const router = useRouter();
  const [view, setView] = useState<FilterBarView>("list");
  const sorted = useTableSort(rows, SORT_ON);

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
  sortable: true,
      header: CAMPAIGN_TEXT.columnName,
      cell: (row) => (
        /* 渠道 on the second line, labelled (DS 14 batch 4): as its own column
           it printed the raw code ("event") and pushed the table 28px past the
           776px middle column. */
        <TableTitleCell
          title={row.name}
          description={CAMPAIGN_TEXT.nameMeta(row.campaignNo, row.channel ? (CAMPAIGN_TEXT.channelLabel[row.channel] ?? row.channel) : null)}
          tooltip={row.name}
        />
      ),
    },
    {
      id: "budget",
      header: CAMPAIGN_TEXT.columnBudget,
      sortable: true,
      align: "money",
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
      cell: (row) =>
        row.returnOnBudget == null ? (
          "-"
        ) : (
          <Tag tone={row.returnOnBudget >= 1 ? "success" : "neutral"}>
            {row.returnOnBudget.toFixed(1)}x
          </Tag>
        ),
    },
    {
      id: "status",
      header: CAMPAIGN_TEXT.columnStatus,
      cell: (row) => (
        <Tag
          tone={row.status === "running" ? "success" : "neutral"}
          dot
        >
          {CAMPAIGN_STATUS_LABEL[row.status] ?? row.status}
        </Tag>
      ),
    },
  ];

  const actions = (row: CampaignRow) =>
    /* A finished campaign has no next status; the column keeps its place with
       the DS's disabled trigger rather than an empty cell (表格三件标配, DS 14
       batch 4) - the same grid for every row. */
    nextCampaignStatuses(row.status as CampaignStatus).length === 0 ? (
      <RowActions label={DS_LABELS.actionMenu} items={[]} />
    ) : (
    <LifecycleControl
      id={row.id}
      status={row.status}
      options={nextCampaignStatuses(row.status as CampaignStatus)}
      label={CAMPAIGN_STATUS_LABEL}
      canChange={canMove}
      extraItems={
        canEdit
          ? [
              {
                id: "edit",
                label: CAMPAIGN_TEXT.editCampaign,
                icon: "edit",
                onSelect: () => router.push(`/campaign/create?no=${encodeURIComponent(row.campaignNo)}`),
              },
            ]
          : undefined
      }
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

      {/* NO CARD (design-ui 8.0.0 透明模式: 表格不套容器卡). The sticky action
          column masks with `--vx-table-sticky-bg`, which falls back to the page
          canvas - and the canvas is now what is actually behind it, so the
          bluer-stripe artefact that TableCard existed to fix cannot occur.
          Removing the card removed the reason for the card. */}
        {view === "list" ? (
          <DataTable
            labels={DATA_TABLE_LABELS}
            indexStart={1}
            /* Pinned right by the DS, fixed width, locked during horizontal
               scroll. Moving it out of `columns` is what makes it behave that
               way - as an ordinary column it scrolled away from the row it acts
               on.

               A TERMINAL CAMPAIGN gets the disabled trigger (see `actions`). */
            rowActions={actions}
            columns={columns}
            rows={[...sorted.rows]}
            sort={sorted.sort}
            onSortChange={sorted.onSortChange}
            rowKey={(row) => row.id}
          />
        ) : (
          <ListCardGrid className="p-md">
            {rows.map((row) => (
              <ListCard
                key={row.id}
                title={row.name}
                description={CAMPAIGN_TEXT.nameMeta(row.campaignNo, row.channel ? (CAMPAIGN_TEXT.channelLabel[row.channel] ?? row.channel) : null)}
                status={
                  <Tag
                    tone={row.status === "completed" ? "success" : "neutral"}
                    dot
                  >
                    {CAMPAIGN_STATUS_LABEL[row.status] ?? row.status}
                  </Tag>
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
    </>
  );
}
