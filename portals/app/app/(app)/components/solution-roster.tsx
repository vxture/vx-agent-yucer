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
import type { SolutionItemRecord, SolutionRecord } from "../../domains/catalog/store";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import { ACTION_COLUMN, EDGE_COLUMNS, RowActions } from "./table-fittings";

// The solution module's rosters - the catalogue's pattern, applied here on
// the owner's 2026-09-05 ruling. A SOLUTION IS A COMBINATION PLUS ITS
// CUSTOMISATION, so the table shows both halves: how many lines are standard
// against how many are add-ons, and the scenario the whole thing is shaped
// for. Neither is decoration - they are what makes a bundle a solution.
//
// Two rosters, live and retired, for the reason the catalogue has two: a
// retired template is not clutter, it is the record of how something used to
// be sold.
//
// EDITING THE COMBINATION IS A PAGE (the 2026-09-05 flow ruling: content-rich
// work gets a page, flow operations get a menu). Retiring, reinstating,
// ordering and deleting are flow operations and live in the row menu.

export interface SolutionView {
  readonly solution: SolutionRecord;
  readonly items: readonly SolutionItemRecord[];
}

export interface SolutionRosterProps {
  readonly solutions: readonly SolutionView[];
  readonly canWrite: boolean;
  readonly onMove: (id: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
  readonly onStatus: (
    solutionId: string,
    status: "active" | "retired",
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function SolutionRoster({
  solutions,
  canWrite,
  onMove,
  onStatus,
  onDelete,
}: SolutionRosterProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS } = useMessages();
  const [pending, startTransition] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). One
  // state across both rosters: the keys are ids, so a selection is of the
  // things themselves, not of the half of the page they appeared in.
  const [selected, setSelected] = useState<readonly string[]>([]);
  const { toast } = useToast();

  const live = solutions.filter((s) => s.solution.status !== "retired");
  const retired = solutions.filter((s) => s.solution.status === "retired");

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({
          tone: "danger",
          title: CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied,
        });
      });
    });

  const columns = [
    {
      id: "name",
      header: CATALOG_TEXT.colSolutionName,
      cell: (r: SolutionView) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-foreground truncate">{r.solution.name}</span>
          <span className="text-muted-foreground mono truncate text-body-sm">
            {r.solution.solutionCode}
          </span>
        </span>
      ),
    },
    {
      id: "composition",
      header: CATALOG_TEXT.colComposition,
      width: "sm" as const,
      align: "center" as const,
      // The combination AND its customisation in one cell: how much of this
      // is the answer, and how much is tailored per deal.
      cell: (r: SolutionView) => (
        <span className="text-body-sm tabular-nums">
          {CATALOG_TEXT.compositionCount(
            r.items.filter((i) => !i.optional).length,
            r.items.filter((i) => i.optional).length,
          )}
        </span>
      ),
    },
    {
      id: "scenario",
      header: CATALOG_TEXT.colScenario,
      cell: (r: SolutionView) =>
        r.solution.scenario ? (
          <span className="text-muted-foreground text-body-sm">{r.solution.scenario}</span>
        ) : (
          <span className="text-(color:--warning-text) text-body-sm">
            {CATALOG_TEXT.noScenario}
          </span>
        ),
    },
    {
      id: "status",
      header: CATALOG_TEXT.colStatus,
      width: "sm" as const,
      align: "center" as const,
      cell: (r: SolutionView) =>
        r.solution.status === "retired" ? (
          <StatusBadge tone="neutral">{CATALOG_TEXT.typeRetiredBadge}</StatusBadge>
        ) : (
          <StatusBadge tone="success">{CATALOG_TEXT.typeEffectiveBadge}</StatusBadge>
        ),
    },
  ];

  /* ALWAYS rendered (fittings ruling, 2026-09-06): a reader with no write
     permission gets the column with an empty, disabled trigger rather than a
     table one column narrower than a colleague's. */
  const rowActions = (row: SolutionView, rowIndex: number) => {
    const list = row.solution.status === "retired" ? retired : live;
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
                  window.location.href = `/solution/new?code=${encodeURIComponent(row.solution.solutionCode)}`;
                },
              },
              {
                id: "status",
                label:
                  row.solution.status === "retired"
                    ? CATALOG_TEXT.solutionReinstate
                    : CATALOG_TEXT.solutionRetire,
                onSelect: () =>
                  run(
                    onStatus(
                      row.solution.id,
                      row.solution.status === "retired" ? "active" : "retired",
                    ),
                  ),
              },
              {
                id: "up",
                label: CATALOG_TEXT.opUp,
                disabled: rowIndex === 0,
                separatorBefore: true,
                onSelect: () => run(onMove(row.solution.id, "up")),
              },
              {
                id: "down",
                label: CATALOG_TEXT.opDown,
                disabled: rowIndex === list.length - 1,
                onSelect: () => run(onMove(row.solution.id, "down")),
              },
              {
                id: "delete",
                label: CATALOG_TEXT.opDelete,
                danger: true as const,
                separatorBefore: true,
                confirm: {
                  verb: CATALOG_TEXT.opDelete,
                  target: row.solution.name,
                  consequence: CATALOG_TEXT.solutionDeleteConsequence,
                  onConfirm: () => run(onDelete(row.solution.id)),
                },
              },
              ]
        }
      />
    );
  };

  /* The catalogue rosters' geometry (TD-022): fixed layout, edge columns on
     the DS token, and the name column taking the remainder. */
  const table = (rows: readonly SolutionView[]) => (
    /* COUNTED FROM THE LEFT, and every leading column is now unconditional:
       选择 | 序号 come first for every reader, so the business columns start
       at nth-child(3) and nothing to their left can disappear.
         A MIN-WIDTH so the shell can be narrow without crushing the text
       columns: with the fittings ruling's selection column added, the two
       flexible columns here were splitting what the fixed ones left and
       collapsing to an unreadable 56-72px. The DS wrapper is overflow-x-auto,
       so past this width the table scrolls - which is the honest failure for
       a table too wide for its container.
     Order: 选择 | # | name | composition | scenario | status | 操作. */
    <div className={`[&_table]:table-fixed ${EDGE_COLUMNS} [&_thead_th:nth-child(3)]:w-[30%] ${ACTION_COLUMN}`}>
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        rowKey={(r: SolutionView) => r.solution.id}
        rows={[...rows]}
        columns={columns}
        rowActions={rowActions}
        empty={
          <EmptyState
            title={CATALOG_TEXT.noSolutions}
            description={CATALOG_TEXT.rosterSolutionWhy}
          />
        }
      />
    </div>
  );

  return (
    <>
      <Section
        id="solutions"
        icon={moduleIcon("solution")}
        title={CATALOG_TEXT.rosterSolution}
        description={CATALOG_TEXT.rosterSolutionWhy}
        action={
          canWrite ? (
            <Button asChild>
              <a href="/solution/new">{CATALOG_TEXT.newSolutionEntry}</a>
            </Button>
          ) : undefined
        }
      >
        {table(live)}
      </Section>

      {retired.length > 0 ? (
        <Section
          id="solutions-retired"
          icon="file-text"
          title={CATALOG_TEXT.rosterSolutionRetired}
          description={CATALOG_TEXT.rosterSolutionRetiredWhy}
        >
          {table(retired)}
        </Section>
      ) : null}
    </>
  );
}
