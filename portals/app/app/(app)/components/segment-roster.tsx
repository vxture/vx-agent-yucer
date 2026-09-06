"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import { RowActions } from "./table-fittings";

// How the market is cut - the catalogue module pattern, applied on the
// owner's 2026-09-05 ruling.
//
// THE TWO COUNTS ARE THE POINT, and they stay in one cell so the reader
// compares them without moving their eyes: who carries the code, and who the
// definition matches. Equal is healthy; apart is a decision nobody re-read,
// and the dock says which direction it went.
//
// PRIORITY IS THE ORDER. The column has existed since batch 1 and nothing
// ever moved it, so the list was sorted by a number no screen could change -
// the row menu's 上移/下移 is what finally makes it a decision.

export interface SegmentRow {
  readonly id: string;
  readonly segmentCode: string;
  readonly name: string;
  readonly planName: string | null;
  readonly priority: number;
  readonly status: string;
  readonly criteria: { readonly industries: readonly string[]; readonly regions: readonly string[] };
  readonly accountCount: number;
  readonly matchedCount: number;
}

export interface SegmentRosterProps {
  readonly rows: readonly SegmentRow[];
  readonly canWrite: boolean;
  readonly onMove: (id: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
  readonly onStatus: (
    id: string,
    status: "active" | "paused" | "retired",
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function SegmentRoster({ rows, canWrite, onMove, onStatus, onDelete }: SegmentRosterProps) {
  const { STRATEGY_TEXT, SEGMENT_ERROR, CATALOG_TEXT, DATA_TABLE_LABELS } = useMessages();
  const [pending, startTransition] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). One
  // state across both rosters: the keys are ids.
  const [selected, setSelected] = useState<readonly string[]>([]);
  const { toast } = useToast();

  const live = rows.filter((r) => r.status === "active");
  const shelved = rows.filter((r) => r.status !== "active");

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({
          tone: "danger",
          title: SEGMENT_ERROR[r.error ?? "denied"] ?? SEGMENT_ERROR.denied,
        });
      });
    });

  const columns = [
    {
      id: "name",
      header: STRATEGY_TEXT.colSegmentName,
      cell: (r: SegmentRow) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-foreground truncate">{r.name}</span>
          <span className="text-muted-foreground mono truncate text-body-sm">{r.segmentCode}</span>
        </span>
      ),
    },
    {
      id: "criteria",
      header: STRATEGY_TEXT.colSegmentCriteria,
      cell: (r: SegmentRow) => {
        const parts = [...r.criteria.industries, ...r.criteria.regions];
        return parts.length === 0 ? (
          <span className="text-(color:--warning-text) text-body-sm">
            {STRATEGY_TEXT.segmentNoCriteriaYet}
          </span>
        ) : (
          <span className="text-muted-foreground truncate text-body-sm">{parts.join(" · ")}</span>
        );
      },
    },
    {
      id: "plan",
      header: STRATEGY_TEXT.colSegmentPlan,
      width: "sm" as const,
      cell: (r: SegmentRow) =>
        r.planName ? (
          <span className="text-muted-foreground truncate text-body-sm">{r.planName}</span>
        ) : (
          <span className="text-(color:--warning-text) text-body-sm">
            {STRATEGY_TEXT.segmentNoPlan}
          </span>
        ),
    },
    {
      id: "counts",
      header: STRATEGY_TEXT.colSegmentCounts,
      width: "sm" as const,
      align: "center" as const,
      // Side by side, and coloured when they disagree: the divergence is the
      // finding this page exists to show.
      cell: (r: SegmentRow) => (
        <span
          className={`tabular-nums text-body-sm ${
            r.accountCount === r.matchedCount ? "" : "text-(color:--warning-text)"
          }`}
        >
          {r.accountCount} / {r.matchedCount}
        </span>
      ),
    },
    {
      id: "status",
      header: CATALOG_TEXT.colStatus,
      width: "sm" as const,
      align: "center" as const,
      cell: (r: SegmentRow) => (
        <StatusBadge tone={r.status === "active" ? "success" : "neutral"}>
          {(STRATEGY_TEXT.segmentStatusLabel as Record<string, string>)[r.status] ?? r.status}
        </StatusBadge>
      ),
    },
  ];

  /* ALWAYS rendered (fittings ruling, 2026-09-06): a reader with no write
     permission gets the column with an empty, disabled trigger rather than a
     table one column narrower than a colleague's. */
  const rowActions = (row: SegmentRow, rowIndex: number) => {
    const list = row.status === "active" ? live : shelved;
    return (
      <RowActions
        disabled={pending}
        items={
          !canWrite
            ? []
            : [
              {
                id: "edit",
                label: CATALOG_TEXT.opEdit,
                onSelect: () => {
                  window.location.href = `/segment/new?code=${encodeURIComponent(row.segmentCode)}`;
                },
              },
              ...(row.status === "active"
                ? [
                    {
                      id: "pause",
                      label: STRATEGY_TEXT.segmentPause,
                      onSelect: () => run(onStatus(row.id, "paused")),
                    },
                    {
                      id: "retire",
                      label: STRATEGY_TEXT.segmentRetire,
                      onSelect: () => run(onStatus(row.id, "retired")),
                    },
                  ]
                : [
                    {
                      id: "resume",
                      label: STRATEGY_TEXT.segmentResume,
                      onSelect: () => run(onStatus(row.id, "active")),
                    },
                  ]),
              {
                id: "up",
                label: CATALOG_TEXT.opUp,
                disabled: rowIndex === 0,
                separatorBefore: true,
                onSelect: () => run(onMove(row.id, "up")),
              },
              {
                id: "down",
                label: CATALOG_TEXT.opDown,
                disabled: rowIndex === list.length - 1,
                onSelect: () => run(onMove(row.id, "down")),
              },
              {
                id: "delete",
                label: CATALOG_TEXT.opDelete,
                danger: true as const,
                separatorBefore: true,
                confirm: {
                  verb: CATALOG_TEXT.opDelete,
                  target: row.name,
                  consequence: STRATEGY_TEXT.segmentDeleteConsequence,
                  onConfirm: () => run(onDelete(row.id)),
                },
              },
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
     Order: 选择 | # | name | criteria | plan | counts | status | 操作 */
  const table = (list: readonly SegmentRow[]) => (
    <div className="[&_table]:table-fixed [&_table]:min-w-[52rem] [&_thead_th:nth-child(5)]:w-[8rem] [&_thead_th:nth-child(6)]:w-[7rem] [&_thead_th:nth-child(7)]:w-[6rem] [&_thead_th:last-child]:w-control-3xl">
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        rowKey={(r: SegmentRow) => r.id}
        rows={[...list]}
        columns={columns}
        rowActions={rowActions}
        empty={
          <EmptyState
            title={STRATEGY_TEXT.segmentsNone}
            description={STRATEGY_TEXT.rosterSegmentWhy}
          />
        }
      />
    </div>
  );

  return (
    <>
      <Section
        id="segments"
        icon={moduleIcon("segment")}
        title={STRATEGY_TEXT.rosterSegment}
        description={STRATEGY_TEXT.rosterSegmentWhy}
        action={
          canWrite ? (
            <Button asChild>
              <a href="/segment/new">{STRATEGY_TEXT.newSegmentEntry}</a>
            </Button>
          ) : undefined
        }
      >
        {table(live)}
      </Section>

      {shelved.length > 0 ? (
        <Section
          id="segments-shelved"
          icon="file-text"
          title={STRATEGY_TEXT.rosterSegmentShelved}
          description={STRATEGY_TEXT.rosterSegmentShelvedWhy}
        >
          {table(shelved)}
        </Section>
      ) : null}
    </>
  );
}
