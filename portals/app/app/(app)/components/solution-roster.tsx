"use client";

import { ModuleHeadline } from "./module-headline";
import { CollectionHistory, CollectionToolbar } from "./collection-layout";
import { CollectionTable, CollectionTitleCell } from "./collection-table";
import { useCollectionView } from "./collection-view-provider";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  EmptyState,
  Icon,
  Input,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useToast,
} from "@vxture/design-ui";
import type {
  ProductTypeRecord,
  ProductRecord,
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
import { MarketOfferingCard } from "./market-offering-card";
import { Tag } from "./tag";
import layout from "./strategy-info-card.module.css";
import { SolutionDetails } from "./solution-details";
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
  readonly initialSolutionId?: string;
  readonly solutions: readonly SolutionView[];
  readonly products: readonly ProductRecord[];
  /** Keyed by solution id. */
  readonly facts: Readonly<Record<string, SolutionFacts>>;
  readonly marketsBySolution: Readonly<Record<string, readonly { id: string; name: string }[]>>;
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
  composition: (r: SolutionView) => r.items.length,
};

const EMPTY_FACTS: SolutionFacts = {
  typeIds: [], listTotal: 0, unpriced: 0, prices: {},
  missing: { listPrice: 0, floorPrice: 0, minPrice: 0 },
};

export function SolutionRoster({
  initialSolutionId,
  solutions,
  products,
  facts,
  marketsBySolution,
  types,
  currency,
  canWrite,
  onMove,
  onStatus,
  onDelete,
}: SolutionRosterProps) {
  const { CATALOG_ERROR, CATALOG_TEXT, DATA_TABLE_LABELS, ROW_OPS, TABLE_TOOLBAR_TEXT, MARKET_STRATEGY_TEXT } =
    useMessages();
  const [pending, startTransition] = useTransition();
  const [detailId, setDetailId] = useState<string | null>(initialSolutionId ?? null);
  const detail = solutions.find((row) => row.solution.id === detailId);
  const factsOf = (r: SolutionView) => facts[r.solution.id] ?? EMPTY_FACTS;
  const sorted = useTableSort<SolutionView>([], {
    ...SORT_ON,
    total: (r: SolutionView) => factsOf(r).prices.listPrice ?? null,
  });
  const [view, setView] = useCollectionView("cards");
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
      header: CATALOG_TEXT.colName,
      cell: (r: SolutionView) => (
        <CollectionTitleCell
          title={r.solution.name}
          description={r.solution.solutionCode}
          tooltip={`${r.solution.name} - ${CATALOG_TEXT.solutionDetailsHint}`}
          onTitleClick={() => setDetailId(r.solution.id)}
        />
      ),
    },
    {
      id: "types",
      header: CATALOG_TEXT.solutionContents,
      align: "left" as const,
      track: "category" as const,
      cell: (r: SolutionView) => <CoveredTypes ids={factsOf(r).typeIds} names={typeName} />,
    },
    {
      id: "composition",
      sortable: true,
      header: CATALOG_TEXT.colComposition,
      track: "composition" as const,
      cell: (r: SolutionView) => (
        <span className="tabular-nums">
          {CATALOG_TEXT.compositionCount(
            r.items.filter((item) => !item.optional).length,
            r.items.filter((item) => item.optional).length,
          )}
        </span>
      ),
    },
    {
      id: "unit",
      header: CATALOG_TEXT.colUnitPrice,
      track: "unit" as const,
      cell: () => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{CATALOG_TEXT.solutionUnit}</span>
          </TooltipTrigger>
          <TooltipContent>{CATALOG_TEXT.solutionUnitHint}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      id: "total",
      header: `${CATALOG_TEXT.productPrices} (${currency})`,
      align: "center" as const,
      sortable: true,
      track: "price" as const,
      cell: (r: SolutionView) => (
        <ProductPriceValues price={factsOf(r).prices} missing={factsOf(r).missing} currency={currency} />
      ),
    },
    {
      id: "status",
      header: CATALOG_TEXT.colStatus,
      track: "state" as const,
      cell: (r: SolutionView) =>
        r.solution.status === "retired" ? (
          <Tag>{CATALOG_TEXT.typeRetiredBadge}</Tag>
        ) : (
          <StatusBadge tone="success">{CATALOG_TEXT.typeEffectiveBadge}</StatusBadge>
        ),
    },
  ];

  // Every reader can open details; write actions retain their original gate.
  const rowActions = (row: SolutionView) => {
    const group = solutions.filter(({ solution }) => solution.status === row.solution.status);
    return (
      <RowActions
        disabled={pending}
        items={[
          { id: "details", label: ROW_OPS.details(CATALOG_TEXT.solutionNoun),
            onSelect: () => setDetailId(row.solution.id) },
          ...(canWrite ? [
              {
                id: "edit",
                label: ROW_OPS.configure(CATALOG_TEXT.solutionNoun),
                onSelect: () => {
                  window.location.href = `/solution/new?id=${encodeURIComponent(row.solution.id)}`;
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
              ...moveItems(ROW_OPS, group.findIndex(({ solution }) => solution.id === row.solution.id), group.length, (d) => run(onMove(row.solution.id, d))),
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
          ] : []),
        ]}
      />
    );
  };

  // Use the DS table's own horizontal scroll when the pane is narrow.
  const table = (rows: readonly SolutionView[], retiredGroup = false) => (
      <CollectionTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
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
  );

  const render = (rows: readonly SolutionView[]) => view === "list" ? table(rows)
    : !rows.length ? <CardsEmpty narrowed={narrowed} title={CATALOG_TEXT.noSolutions}
      description={CATALOG_TEXT.rosterSolutionWhy} />
    : <div className="flex flex-col gap-lg">{sorted.sortRows(rows).map((row) => {
      const { solution, items } = row;
      const contents = items.map(it => products.find(p => p.id === it.productId)?.name).filter(Boolean).join(" / ");
      const composition = CATALOG_TEXT.compositionCount(items.filter(it => !it.optional).length, items.filter(it => it.optional).length);
      const scenario = solution.scenario || solution.summary;
      const markets = marketsBySolution[solution.id] ?? [];
      const primaryPrice = factsOf(row).prices.listPrice;
      const unpriced = factsOf(row).missing.listPrice;
      return <MarketOfferingCard key={solution.id} kind="solution" name={solution.name} number={solution.solutionCode}
        status={<StatusBadge tone="success">{CATALOG_TEXT.typeEffectiveBadge}</StatusBadge>}
        actions={rowActions(row)} openLabel={ROW_OPS.details(CATALOG_TEXT.solutionNoun)} onOpen={() => setDetailId(solution.id)}
        summary={<>
          <div className={layout.field}><span className="inline-flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="ticket" size="xs" aria-hidden="true" />{CATALOG_TEXT.colScenario}</span><p className="line-clamp-2 text-body" title={scenario ?? undefined}>{scenario || "-"}</p></div>
          {solution.scenario && solution.summary && solution.summary !== scenario && <div className={layout.field}><span className="inline-flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="lightbulb" size="xs" aria-hidden="true" />{CATALOG_TEXT.solutionSummary}</span><p className="line-clamp-2 text-body text-muted-foreground" title={solution.summary}>{solution.summary}</p></div>}
        </>}
        context={<>
          <div className={layout.field} data-solution-card-markets>
            <span className="inline-flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="target" size="xs" aria-hidden="true" />{MARKET_STRATEGY_TEXT.targetMarketsTitle}</span><div className="flex min-w-0 flex-wrap items-baseline gap-x-sm gap-y-xs text-body">
            {markets.slice(0, 2).map(m => <Link key={m.id} href={`/segment/${encodeURIComponent(m.id)}`} className="min-w-0 max-w-full truncate hover:text-primary-text" title={m.name}>{m.name}</Link>)}
            {markets.length > 2 && <span title={markets.slice(2).map(m => m.name).join(" / ")}>+{markets.length - 2}</span>}
            {!markets.length ? <span className="text-muted-foreground">-</span> : null}
          </div></div>
          <div className={layout.field} data-solution-card-price>
            <span className="inline-flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="coins" size="xs" aria-hidden="true" />{CATALOG_TEXT.solutionPriceBasis}</span>
            <span className="inline-flex min-w-0 flex-wrap items-baseline gap-xs text-body" title={unpriced ? CATALOG_TEXT.listTotalPartial(unpriced) : CATALOG_TEXT.solutionUnitHint}>
              <span className="font-medium tabular-nums">{primaryPrice == null ? CATALOG_TEXT.unpricedShort : primaryPrice.toLocaleString()}</span>
              {primaryPrice != null ? <span className="text-body-small text-muted-foreground">{currency} / {CATALOG_TEXT.solutionUnit}</span> : null}
              {unpriced > 0 ? <Icon name="warning" size="xs" className="self-center text-warning-text" aria-label={CATALOG_TEXT.listTotalPartial(unpriced)} /> : null}
            </span>
          </div>
        </>}
        facts={<div className={layout.field} data-solution-card-products>
          <span className="inline-flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="cube" size="xs" aria-hidden="true" />{CATALOG_TEXT.colComposition}</span>
          <div className="flex min-w-0 items-baseline gap-sm"><span className="max-w-1/2 shrink-0 truncate text-body-small text-muted-foreground" title={composition}>{composition}</span><p className="min-w-0 truncate text-body" title={contents || undefined}>{contents || "-"}</p></div>
        </div>}
      />;
    })}</div>;

  return (
    <>
      <ModuleHeadline moduleKey="solution"
        help={<><p>{CATALOG_TEXT.rosterSolutionWhy}</p><p>{CATALOG_TEXT.solutionPricesHint}</p></>}
        create={canWrite ? { href: "/solution/new", label: CATALOG_TEXT.newSolutionEntry } : undefined} />
      {detail ? <SolutionDetails view={detail} products={products} facts={factsOf(detail)} currency={currency}
        onClose={() => setDetailId(null)} /> : null}
      <CollectionToolbar
        id="solutions"
        title={CATALOG_TEXT.solutionRoster}
        icon="list-checks"
        mode={{ value: view, onChange: setView }}
        count={shown.length}
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
      >
        <TypeFilter types={types} value={typeFilter} onChange={setTypeFilter} />
      </CollectionToolbar>
      {live.length || !retired.length ? render(live) : null}
      <CollectionHistory id="solutions-retired" title={CATALOG_TEXT.rosterSolutionRetired} count={retired.length} mode={view}
        revealMatches={narrowed && !live.length}>
        {table(retired, true)}
      </CollectionHistory>
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
  return (
    <span className="flex flex-wrap gap-x-xs gap-y-2xs">
      {ids.map((id) => (
        <span key={id} className="max-w-full truncate" title={names.get(id)}>
          {names.get(id) ?? ""}
        </span>
      ))}
    </span>
  );
}
