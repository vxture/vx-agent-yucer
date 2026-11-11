"use client";

import { FilterBar } from "./business-controls";

import { TruncatedText } from "./truncated-text";
import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  ListCard,
  ListCardGrid,
  Section,
  StatusBadge,
  TableTitleCell,
  useToast,
  type FilterBarView,
} from "@vxture/design-ui";
import type {
  ProductTypeRecord,
  SolutionItemRecord,
  SolutionRecord,
} from "../../domains/catalog/store";
import { useMessages } from "../lib/i18n/provider";
import {
  RowActions,
  SearchSlot,
  useTableSort,
  moveItems,
} from "./table-fittings";
import { Tag } from "./tag";
import { ProductPriceValues } from "./product-price-values";
import type { SolutionFacts } from "../lib/solution-prices";
import { typeFamily, typeLabel } from "../../domains/catalog/lib/type-vocab";
import { CardsEmpty, TypeFilter } from "./catalog-tool-row";
import type { MoveDirection } from "../../domains/shared/ordering";

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
  /** Keyed by solution id. */
  readonly facts: Readonly<Record<string, SolutionFacts>>;
  /** The catalogue's type vocabulary - the 产品类型 filter and column. */
  readonly types: readonly ProductTypeRecord[];
  readonly currency: string;
  readonly canWrite: boolean;
  readonly onMove: (id: string, direction: MoveDirection) => Promise<{ ok: boolean; error?: string }>;
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

const EMPTY_FACTS: SolutionFacts = {
  typeIds: [], listTotal: 0, unpriced: 0, prices: {},
  missing: { listPrice: 0, floorPrice: 0, minPrice: 0 },
};

export function SolutionRoster({
  solutions,
  facts,
  types,
  currency,
  canWrite,
  onMove,
  onStatus,
  onDelete,
}: SolutionRosterProps) {
  const { CATALOG_ERROR, CATALOG_TEXT, DATA_TABLE_LABELS, ROW_OPS, TABLE_TOOLBAR_TEXT } =
    useMessages();
  const [pending, startTransition] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). One
  // state across both rosters: the keys are ids, so a selection is of the
  // things themselves, not of the half of the page they appeared in.
  const [selected, setSelected] = useState<readonly string[]>([]);
  const factsOf = (r: SolutionView) => facts[r.solution.id] ?? EMPTY_FACTS;
  const sorted = useTableSort<SolutionView>([], {
    ...SORT_ON,
    total: (r: SolutionView) => factsOf(r).prices.listPrice ?? null,
  });
  const [view, setView] = useState<FilterBarView>("list");
  // Full names, 软件产品-基础软件 (incr/0100).
  const typeName = new Map(types.map((t) => [t.id, typeLabel(types, t.id)?.name ?? t.name]));
  const { toast } = useToast();

  /* 工具行. 适用场景 is in the search alongside the name and code, and that
     is the point of putting a box here at all: the scenario is free text
     somebody says to a customer, so "找一个讲得通零售连锁的方案" is a lookup
     nobody can do by scanning a name column.

     产品类型 IS THE FILTER (owner, 2026-09-29: the same control as the
     product catalogue's): a solution matches when it contains a product of
     that type. Status is still not one - it is the split between the two
     tables, and a dropdown re-answering the headings changes nothing. */
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const narrowed = query.trim() !== "" || typeFilter !== "";
  const match = (r: (typeof solutions)[number]) => {
    if (typeFilter !== "") {
      // A 一级类 matches a solution carrying any of its 二级类 (incr/0100).
      const family = typeFamily(types, typeFilter);
      if (!factsOf(r).typeIds.some((id) => family.has(id))) return false;
    }
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    const sol = r.solution;
    return [sol.name, sol.solutionCode, sol.scenario ?? "", sol.summary ?? ""].some(
      (v) => v.toLowerCase().includes(q),
    );
  };


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
      id: "total",
      header: `${CATALOG_TEXT.solutionPrices} / ${currency}`,
      align: "center" as const,
      sortable: true,
      width: "md" as const,
      cell: (r: SolutionView) => (
        <ProductPriceValues price={factsOf(r).prices} missing={factsOf(r).missing} currency={currency} />
      ),
    },
    {
      id: "composition",
      header: CATALOG_TEXT.colComposition,
      width: "sm" as const,
      // The combination AND its customisation in one cell: how much of this
      // is the answer, and how much is tailored per deal.
      cell: (r: SolutionView) => (
        <span className="text-body-small tabular-nums">
          {CATALOG_TEXT.compositionCount(
            r.items.filter((i) => !i.optional).length,
            r.items.filter((i) => i.optional).length,
          )}
        </span>
      ),
    },
    {
      id: "types",
      header: CATALOG_TEXT.colCoveredTypes,
      align: "left" as const,
      cell: (r: SolutionView) => <CoveredTypes ids={factsOf(r).typeIds} names={typeName} />,
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
      // A width floor and two lines at most (polish, 2026-09-24): with no
      // width this column lost the auto-layout fight to the name and wrapped
      // a sentence down seven lines. The whole sentence is the hover title.
      width: "lg" as const,
      cell: (r: SolutionView) =>
        r.solution.scenario ? (
          <TruncatedText text={r.solution.scenario} className="text-muted-foreground line-clamp-2 text-body-small" />
        ) : (
          <span className="text-(color:--warning-text) text-body-small">
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
          <Tag>{CATALOG_TEXT.typeRetiredBadge}</Tag>
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
                label: ROW_OPS.configure(CATALOG_TEXT.solutionNoun),
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
              ...moveItems(ROW_OPS, rowIndex, list.length, (d) => run(onMove(row.solution.id, d))),
              {
                id: "delete",
                label: ROW_OPS.remove(CATALOG_TEXT.solutionNoun),
                danger: true as const,
                separatorBefore: true,
                confirm: {
                  verb: ROW_OPS.remove(CATALOG_TEXT.solutionNoun),
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

  // Use the DS table's own horizontal scroll when the pane is narrow.
  const table = (rows: readonly SolutionView[], retiredGroup = false) => (
    <div className="[&_table]:min-w-(--vx-container-4xl) [&_thead_th:nth-child(3)]:w-[20%]">
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
              title={retiredGroup ? CATALOG_TEXT.noRetiredSolutions : CATALOG_TEXT.noSolutions}
              description={retiredGroup ? undefined : CATALOG_TEXT.rosterSolutionWhy}
            />
          )
        }
      />
    </div>
  );

  return (
    <>
      {/* THE DS TOOL ROW (owner, 2026-09-29): 列表/卡片 | 搜索 · 产品类型 ·
          【新建方案】, one row for both rosters - the retired list says on
          its own heading that this control is narrowing it. The create
          button moved here from the section header; disabled, not hidden,
          without the permission. */}
      <FilterBar
        view={view}
        onViewChange={setView}
        actions={
          canWrite ? (
            <Button asChild>
              <a href="/solution/new">{CATALOG_TEXT.newSolutionEntry}</a>
            </Button>
          ) : (
            <Button disabled>{CATALOG_TEXT.newSolutionEntry}</Button>
          )
        }
        count={
          narrowed
            ? TABLE_TOOLBAR_TEXT.filteredCount(shown.length, solutions.length)
            : CATALOG_TEXT.solutionCount(solutions.length)
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
        onReset={
          narrowed
            ? () => {
                setQuery("");
                setTypeFilter("");
              }
            : undefined
        }
        resetLabel={TABLE_TOOLBAR_TEXT.resetFilters}
      >
        <TypeFilter types={types} value={typeFilter} onChange={setTypeFilter} />
      </FilterBar>

      <Section
        id="solutions"
        icon="list-checks"
        title={CATALOG_TEXT.rosterSolution}
        description={`${CATALOG_TEXT.rosterSolutionWhy} ${CATALOG_TEXT.solutionPricesHint}`}
      >
        {view === "list" ? (
          table(live)
        ) : live.length === 0 ? (
          <CardsEmpty narrowed={narrowed} title={CATALOG_TEXT.noSolutions} description={`${CATALOG_TEXT.rosterSolutionWhy} ${CATALOG_TEXT.solutionPricesHint}`} />
        ) : (
          /* The same row as a card (DS ListCard): name and code, status and
             the row menu top right; composition, covered types and all three price totals
             as the meta line. */
          <ListCardGrid className="p-md">
            {live.map((row, i) => (
              <ListCard
                key={row.solution.id}
                title={row.solution.name}
                description={row.solution.solutionCode}
                status={<StatusBadge tone="success">{CATALOG_TEXT.typeEffectiveBadge}</StatusBadge>}
                actions={rowActions(row, i)}
                meta={
                  <>
                    <span className="tabular-nums">
                      {CATALOG_TEXT.compositionCount(
                        row.items.filter((it) => !it.optional).length,
                        row.items.filter((it) => it.optional).length,
                      )}
                    </span>
                    <CoveredTypes ids={factsOf(row).typeIds} names={typeName} />
                    <div className="flex flex-col gap-xs">
                      <span>{CATALOG_TEXT.solutionPrices} / {currency}</span>
                      <ProductPriceValues price={factsOf(row).prices} missing={factsOf(row).missing} currency={currency} />
                    </div>
                  </>
                }
              />
            ))}
          </ListCardGrid>
        )}
      </Section>

      {/* The archive remains visible even when empty or filtered out. */}
      <Section
        id="solutions-retired"
        icon="archive"
        title={CATALOG_TEXT.rosterSolutionRetired}
        description={CATALOG_TEXT.rosterSolutionRetiredWhy}
        action={
          narrowed ? (
            <StatusBadge tone="info">{CATALOG_TEXT.narrowedNote}</StatusBadge>
          ) : undefined
        }
      >
        {table(retired, true)}
      </Section>
    </>
  );
}

/** 涵盖产品类型: the types' names, in the vocabulary's order the page gave. */
function CoveredTypes({
  ids,
  names,
}: {
  readonly ids: readonly string[];
  readonly names: ReadonlyMap<string, string>;
}) {
  if (ids.length === 0) return <span className="text-muted-foreground">-</span>;
  // Each name WHOLE, wrapping between names rather than inside one - a narrow
  // column broke 实施服务 into 实 / 施服务 (seen 2026-09-29).
  return (
    <span className="flex flex-wrap gap-x-xs text-body-small">
      {ids.map((id) => (
        <span key={id} className="whitespace-nowrap">
          {names.get(id) ?? ""}
        </span>
      ))}
    </span>
  );
}
