"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  Input,
  Section,
  StatusBadge,
  TableTitleCell,
  useToast,
} from "@vxture/design-ui";
import type { SolutionItemRecord, SolutionRecord } from "../../domains/catalog/store";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  RowActions,
  SearchSlot,
  useTableSort,
} from "./table-fittings";

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

/* 排序取值: what each sortable column ORDERS ON. Not always what the cell
   renders - a money cell sorts on the raw amount, not its formatted string. */
const SORT_ON = {
  name: (r: SolutionView) => r.solution.name,
};

export function SolutionRoster({
  solutions,
  canWrite,
  onMove,
  onStatus,
  onDelete,
}: SolutionRosterProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS, TABLE_TOOLBAR_TEXT } =
    useMessages();
  const [pending, startTransition] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). One
  // state across both rosters: the keys are ids, so a selection is of the
  // things themselves, not of the half of the page they appeared in.
  const [selected, setSelected] = useState<readonly string[]>([]);
  const sorted = useTableSort<SolutionView>([], SORT_ON);
  const { toast } = useToast();

  /* 工具行. 适用场景 is in the search alongside the name and code, and that
     is the point of putting a box here at all: the scenario is free text
     somebody says to a customer, so "找一个讲得通零售连锁的方案" is a lookup
     nobody can do by scanning a name column.

     No second filter. Status is already the split between the two tables,
     and a dropdown that re-answers what the headings answer is a control
     that cannot change anything the reader can see. */
  const [query, setQuery] = useState("");
  const narrowed = query.trim() !== "";
  const match = (r: (typeof solutions)[number]) => {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    const sol = r.solution;
    return [sol.name, sol.solutionCode, sol.scenario ?? "", sol.summary ?? ""].some(
      (v) => v.toLowerCase().includes(q),
    );
  };

  const liveTotal = solutions.filter((s) => s.solution.status !== "retired").length;
  const retiredTotal = solutions.filter((s) => s.solution.status === "retired").length;

  const shown = solutions.filter(match);
  const live = shown.filter((s) => s.solution.status !== "retired");
  const retired = shown.filter((s) => s.solution.status === "retired");

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
  sortable: true,
      header: CATALOG_TEXT.colSolutionName,
      cell: (r: SolutionView) => (
        <TableTitleCell
          title={r.solution.name}
          description={r.solution.solutionCode}
          tooltip={r.solution.name}
        />
      ),
    },
    {
      id: "composition",
      header: CATALOG_TEXT.colComposition,
      width: "sm" as const,
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
      // LEFT, against the new default. design-ui 8.0.0 centres every non-first
      // column, which is right for codes, badges and dates - but 场景 is free
      // text by design (incr/0031: a sentence a salesperson says to a
      // customer), and centred prose has a ragged left edge the eye has to
      // re-find on every row.
      align: "left" as const,
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
        rows={[...sorted.sortRows(rows)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
        columns={columns}
        rowActions={rowActions}
        empty={
          narrowed ? (
            <EmptyState
              title={TABLE_TOOLBAR_TEXT.noMatch}
              description={TABLE_TOOLBAR_TEXT.noMatchWhy}
            />
          ) : (
            <EmptyState
              title={CATALOG_TEXT.noSolutions}
              description={CATALOG_TEXT.rosterSolutionWhy}
            />
          )
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
        {/* One tool row for both rosters; the retired list says on its own
            heading that this control is narrowing it. */}
        <FilterBar
          count={
            narrowed
              ? TABLE_TOOLBAR_TEXT.filteredCount(live.length, liveTotal)
              : CATALOG_TEXT.solutionCount(live.length)
          }
          search={
            <SearchSlot>
              <Input
                type="search"
                className="w-full"
                value={query}
                placeholder={CATALOG_TEXT.solutionSearchHint}
                aria-label={TABLE_TOOLBAR_TEXT.searchLabel}
                onChange={(e) => setQuery(e.target.value)}
              />
            </SearchSlot>
          }
          onReset={narrowed ? () => setQuery("") : undefined}
          resetLabel={TABLE_TOOLBAR_TEXT.resetFilters}
        />

        {table(live)}
      </Section>

      {/* Holds its place while narrowed rather than vanishing under a keyword
          and taking its own explanation with it. */}
      {retired.length > 0 || (narrowed && retiredTotal > 0) ? (
        <Section
          id="solutions-retired"
          icon="file-text"
          title={CATALOG_TEXT.rosterSolutionRetired}
          description={CATALOG_TEXT.rosterSolutionRetiredWhy}
          action={
            narrowed ? (
              <StatusBadge tone="info">{CATALOG_TEXT.narrowedNote}</StatusBadge>
            ) : undefined
          }
        >
          {table(retired)}
        </Section>
      ) : null}
    </>
  );
}
