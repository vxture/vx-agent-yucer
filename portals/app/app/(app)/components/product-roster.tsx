"use client";

import { Section } from "./help-section";
import { DataTable } from "./business-controls";
import { CollectionHeadline, CollectionHistory, CollectionToolbar } from "./collection-layout";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inForceByProduct } from "../../domains/catalog/lib/pricing";
import { ProductPriceValues } from "./product-price-values";
import { ProductPricePanel, type ProductPricing } from "./product-price-panel";
import {
  Button,
  EmptyState,
  Icon,
  Input,
  ListCard,
  TableTitleCell,
  useToast,
  type FilterBarView,
} from "@vxture/design-ui";
import { statusTone } from "./status-label";
import { typeFamily, typeLabel } from "../../domains/catalog/lib/type-vocab";
import {
  RowActions,
  rowClickSelection,
  SearchSlot,
  useTableSort,
  moveItems,
} from "./table-fittings";
import type {
  ProductRecord,
  ProductStatusRecord,
  ProductTypeRecord,
  ProductUnitRecord,
} from "../../domains/catalog/store";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import { TypeFilter } from "./catalog-tool-row";
import type { MoveDirection } from "../../domains/shared/ordering";

// The module page's roster - owner ruling 2026-09-05: the page is DISPLAY, the
// row is where the operations live, locked to the right.
//
// Products and their current prices share one roster. The price column holds
// up to three labelled amounts; unpriced products remain visible. Current and
// retired groups keep lifecycle context, and price records open per product.
//
// ROW OPERATIONS live in ONE ActionMenu per row: the DS row-action column is
// fixed at 64px and holds a single trigger by design, so a row of buttons is
// not an option there. The status items are only the LEGAL moves (the
// lifecycle map's, not a full list the service would refuse), and 删除 is the
// DS danger item with its consequence spelled out - the confirm dialog is the
// DS's own. Sorting IS still one-click somewhere: the 新建 page's sort variant
// puts the arrows in a regular column, because sorting is a burst activity
// and that page is the one the ruling names for it (新建与排序同一页面).
//
// FAILURES GO TO A TOAST, the lifecycle-control argument: a violation is an
// event, not a property of the row, and a 56px cell cannot hold a sentence.

export interface ProductRosterProps {
  readonly products: readonly ProductRecord[];
  readonly types: readonly ProductTypeRecord[];
  /** The status vocabulary - labels, tones and legal moves all read it. */
  readonly statuses: readonly ProductStatusRecord[];
  /** 计价单位 (0037) - the row carries a uuid, this turns it into 套 / 人天.
   *  REQUIRED, not optional-with-a-default: an optional one let /catalog
   *  render the roster without it and print an empty 单位 column, which is
   *  exactly the kind of miss a type can catch and a default cannot. */
  readonly units: readonly ProductUnitRecord[];
  readonly pricing?: ProductPricing;
  readonly canWrite: boolean;
  /** "sort" renders only the live roster with the move arrows - the 新建 page
   * mounts it beside the create form so a new product can be put in place. */
  readonly variant?: "full" | "sort";
  readonly onMove: (id: string, direction: MoveDirection) => Promise<{ ok: boolean; error?: string }>;
  readonly onStatus: (id: string, statusId: string) => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

/* 排序取值: what each sortable column ORDERS ON. Not always what the cell
   renders - a money cell sorts on the raw amount, not its formatted string. */
const SORT_ON = {
  name: (r: ProductRecord) => r.name,
};

export function ProductRoster({
  units,
  products,
  types,
  statuses,
  pricing,
  canWrite,
  variant = "full",
  onMove,
  onStatus,
  onDelete,
}: ProductRosterProps) {
  const { CATALOG_ERROR, CATALOG_TEXT, DATA_TABLE_LABELS, ROW_OPS, TABLE_TOOLBAR_TEXT } =
    useMessages();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const historyId = params.get("priceHistory");
  const historyProduct = products.find((p) => p.id === historyId);
  const showHistory = historyId === "all" || historyProduct !== undefined;
  const priceByProduct = inForceByProduct(pricing?.prices ?? [], pricing?.currency ?? "", pricing?.now ?? 0);
  const openHistory = (productId: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (productId) next.set("priceHistory", productId);
    else next.delete("priceHistory");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const [pending, startTransition] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). Held
  // across BOTH rosters because the keys are product ids: a selection is of
  // products, not of whichever half of the page they were shown in.
  const [selected, setSelected] = useState<readonly string[]>(() =>
    (params.get("sel")?.split(",") ?? []).filter((id) => products.some((p) => p.id === id)));
  const sorted = useTableSort<ProductRecord>([], {
    ...SORT_ON,
    ...(pricing ? { list: (row: ProductRecord) => priceByProduct.get(row.id)?.listPrice ?? -1 } : {}),
  });
  // Clicking the row toggles it - the checkbox is too small a target
  // (owner, 2026-09-06). Bound per table because each has its own row order.
  const click = (list: readonly ProductRecord[]) =>
    rowClickSelection();
  const { toast } = useToast();

  // 类别 reads 软件产品-基础软件 for a 二级类 (owner, 2026-09-29: 两个字段，
  // 连接显示), and a filter on a 一级类 matches its 二级类 too.
  const typeNameOf = (typeId: string | null) => typeLabel(types, typeId)?.name ?? CATALOG_TEXT.noCategory;
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const vocab = new Map(statuses.map((r) => [r.id, r]));
  const codeOf = (p: ProductRecord) => vocab.get(p.statusId)?.statusCode;

  /* 工具行 - one query across the live and retired rosters. A catalogue is
     looked up by name or code, and the person looking it up does not
     necessarily know it has been retired; that is often the answer they came
     for. The 分类 filter is the second axis because it is the only column
     with a small, closed set of values. */
  const [query, setQuery] = useState(() => products.find(p => p.id === params.get("product"))?.name ?? "");
  const [view, setView] = useState<FilterBarView>("list");
  const [typeFilter, setTypeFilter] = useState("");
  const family = typeFilter === "" ? null : typeFamily(types, typeFilter);
  const match = (p: ProductRecord) => {
    const q = query.trim().toLowerCase();
    return (
      (q === "" ||
        p.name.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q)) &&
      (family === null || (p.typeId !== null && family.has(p.typeId)))
    );
  };
  const narrowed = query.trim() !== "" || typeFilter !== "";

  const isRetired = (p: ProductRecord) => codeOf(p) === "retired";

  const shown = products.filter(match);
  const live = shown.filter((p) => !isRetired(p));
  const retired = shown.filter(isRetired);

  /** The legal targets for one product - the mirror of
   * planProductStatusChange: a different row, and never INTO 在研 (the birth
   * state). Offering an illegal move would be offering a refusal. */
  const targetsFor = (p: ProductRecord) =>
    statuses.filter(
      (r) => r.id !== p.statusId && r.statusCode !== "in_development",
    );

  /** The crafted verbs for the canonical moves; a generic 转入 otherwise. */
  const moveLabel = (p: ProductRecord, to: ProductStatusRecord) => {
    if (to.statusCode === "active" && codeOf(p) === "in_development")
      return CATALOG_TEXT.opLaunch;
    if (to.statusCode === "active" && codeOf(p) === "retired")
      return CATALOG_TEXT.opReinstate;
    if (to.statusCode === "retired") return CATALOG_TEXT.opRetire;
    return CATALOG_TEXT.moveToStatus(to.name);
  };

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

  const statusBadge = (product: ProductRecord) => {
    const status = vocab.get(product.statusId);
    return status ? <Tag tone={statusTone(status)}>{status.name}</Tag> : null;
  };
  const columns = [
    {
      id: "name",
  sortable: true,
      header: CATALOG_TEXT.colName,
      /* THE DS'S OWN TITLE CELL (design-ui 8.0.0 `TableTitleCell`), not a
         hand-rolled flex-col. Same story as MoneyCell: the owner's 16/14
         ruling of 2026-09-06 is the component's `size="lg"` default as of
         2026-09-07, so eight tables were each re-deriving it. What the local
         version could not do is PIN THE TWO LINE HEIGHTS - the DS fixes them
         at 20px / 16px with a 4px gap so a title lines up with the titles in
         the rows around it and a subtitle with the subtitles, which is what
         makes a row readable straight across. */
      cell: (r: ProductRecord) => (
        <TableTitleCell title={r.name} description={r.productCode} tooltip={r.name} />
      ),
    },
    {
      id: "type",
      header: CATALOG_TEXT.colType,
      cell: (r: ProductRecord) =>
        typeNameOf(r.typeId),
    },
    {
      id: "unit",
      header: CATALOG_TEXT.colUnitPrice,
      /* THE NAME, resolved from the vocabulary (0037). The row carries a uuid;
         printing it would be a column of hex. A product whose unit row was
         deleted underneath it cannot exist - fk_product_unit RESTRICTs - so
         the fallback is for a partial read, not for a real state. */
      cell: (r: ProductRecord) => unitName.get(r.unitId) ?? "",
    },
    ...(pricing ? [{
      id: "list",
      header: `${CATALOG_TEXT.productPrices} (${pricing.currency})`,
      width: "md" as const,
      sortable: true,
      align: "center" as const,
      cell: (row: ProductRecord) => <ProductPriceValues price={priceByProduct.get(row.id)} currency={pricing.currency} />,
    }] : []),
    {
      id: "status",
      header: CATALOG_TEXT.colStatus,
      cell: statusBadge,
    },
  ];

  /** One menu per row - the DS's single-trigger row-action column. ALWAYS
   * rendered: with no write permission the menu is empty and the trigger is
   * disabled, so the column holds its place (the 2026-09-06 fittings ruling). */
  const rowActions = (row: ProductRecord) => {
    const group = products.filter(product => isRetired(product) === isRetired(row));
    return (
      <RowActions
        disabled={pending}
        items={
          [
            ...(canWrite ? [
              {
                id: "edit",
                label: ROW_OPS.configure(CATALOG_TEXT.productNoun),
                onSelect: () => {
                  window.location.href = `/catalog/new?id=${encodeURIComponent(row.id)}`;
                },
              },
              ...targetsFor(row).map((to) => ({
                id: to.id,
                label: moveLabel(row, to),
                onSelect: () => run(onStatus(row.id, to.id)),
              })),
              ...moveItems(ROW_OPS, group.findIndex(product => product.id === row.id), group.length, (d) => run(onMove(row.id, d))),
              {
                id: "delete",
                label: ROW_OPS.remove(CATALOG_TEXT.productNoun),
                danger: true as const,
                separatorBefore: true,
                confirm: {
                  verb: ROW_OPS.remove(CATALOG_TEXT.productNoun),
                  target: row.name,
                  consequence: CATALOG_TEXT.deleteConsequence,
                  onConfirm: () => run(onDelete(row.id)),
                },
              },
              ] : []),
            ...(pricing ? [{
              id: "price-history", label: CATALOG_TEXT.priceHistory,
              onSelect: () => openHistory(row.id),
            }] : []),
            ...(pricing?.canPrice && codeOf(row) !== "retired" ? [{
              id: "price-edit",
              label: priceByProduct.has(row.id) ? CATALOG_TEXT.reprice : CATALOG_TEXT.newPrice,
              onSelect: () => setEditingPrice(row.id),
            }] : []),
          ]
        }
      />
    );
  };

  /** The sort page's arrows: a REGULAR column, not the 64px action slot -
   * sorting is a burst activity and each step must stay one click. */
  const arrowColumn = {
    id: "order",
    header: CATALOG_TEXT.colOps,
    cell: (r: ProductRecord, rowIndex: number) => (
      <span className="flex items-center gap-xs">
        <Button
          variant="ghost"
          size="icon-md"
          data-control-size="compact"
          aria-label={CATALOG_TEXT.opUp}
          title={CATALOG_TEXT.opUp}
          disabled={pending || rowIndex === 0}
          onClick={() => run(onMove(r.id, "up"))}
        >
          <Icon name="chevron-up" size="sm" />
        </Button>
        <Button
          variant="ghost"
          size="icon-md"
          data-control-size="compact"
          aria-label={CATALOG_TEXT.opDown}
          title={CATALOG_TEXT.opDown}
          disabled={pending || rowIndex === live.length - 1}
          onClick={() => run(onMove(r.id, "down"))}
        >
          <Icon name="chevron-down" size="sm" />
        </Button>
      </span>
    ),
  };

  const table = (rows: readonly ProductRecord[], extra?: typeof arrowColumn, retiredGroup = false) => {
    const select = click(rows);
    return (
    /* The config tables' geometry, applied here too (owner ruling; TD-022):
       the pricing roster uses native automatic columns and a DS width floor
       so three prices stay readable in narrow panes; the sort variant stays
       fixed. The name column takes the lion's share, and the
       trailing column is token-fixed - the DS edge token for the single-
       trigger action slot, a wider fixed box for the sort page's two arrows.
       Counted FROM THE LEFT, and the leading pair is now 选择 | 序号, so the
       first business column is nth-child(3) rather than (2). */
    <div
      ref={select.ref}
      className={`${pricing ? "[&_table]:min-w-(--vx-container-4xl)" : "[&_table]:table-fixed"} [&_thead_th:nth-child(3)]:w-[34%] ${select.className} ${extra ? "[&_thead_th:last-child]:w-[6.5rem]" : ""}`}
    >
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        selectedKeys={selected}
        onSelectionChange={(keys) => {
          setSelected(keys);
          if (!pricing) return;
          const next = new URLSearchParams(params.toString());
          const ids = keys.filter((id) => live.some((row) => row.id === id));
          if (ids.length) next.set("sel", ids.join(","));
          else next.delete("sel");
          router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
        }}
        rowKey={(r: ProductRecord) => r.id}
        rows={[...sorted.sortRows(rows)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
        columns={extra ? [...columns, extra] : columns}
        /* The sort variant puts its arrows in a regular column, so IT is the
           trailing column there - the action slot would be a second one. */
        rowActions={extra ? undefined : rowActions}
        empty={
          narrowed ? (
            <EmptyState
              title={TABLE_TOOLBAR_TEXT.noMatch}
              description={TABLE_TOOLBAR_TEXT.noMatchWhy}
            />
          ) : (
            <EmptyState
              title={retiredGroup ? CATALOG_TEXT.noRetiredProducts : CATALOG_TEXT.noCurrentProducts}
              description={retiredGroup ? undefined : CATALOG_TEXT.byTypeEmpty}
            />
          )
        }
      />
      </div>
    );
  };

  if (variant === "sort") {
    return (
      <Section icon="sort-ascending" title={CATALOG_TEXT.sortTitle} help={CATALOG_TEXT.sortWhy}>
        {table(live, canWrite ? arrowColumn : undefined)}
      </Section>
    );
  }

  const renderLive = () => view === "list" || !live.length ? table(live) : (
    <div className="@container">
      <div className="grid min-w-0 grid-cols-1 gap-lg @2xl:grid-cols-2 @5xl:grid-cols-3" data-product-cards>
        {sorted.sortRows(live).map((product) => <ListCard key={product.id} title={product.name}
          description={product.productCode} icon="cube" status={statusBadge(product)}
          actions={rowActions(product)} meta={<div className="flex w-full flex-wrap items-center justify-between gap-sm">
            <span>{[typeNameOf(product.typeId), unitName.get(product.unitId)].filter(Boolean).join(" \u00b7 ")}</span>
            {pricing ? <ProductPriceValues price={priceByProduct.get(product.id)} currency={pricing.currency} /> : null}
          </div>} />)}
      </div>
    </div>
  );

  return (
    <>
      <CollectionHeadline moduleKey="catalog" help={CATALOG_TEXT.rosterLiveWhy}
        create={canWrite ? { href: "/catalog/new", label: CATALOG_TEXT.newProduct } : undefined} />
      <CollectionToolbar
        id="products"
        title={CATALOG_TEXT.productRoster}
        icon="list-checks"
        mode={{ value: view, onChange: setView }}
        count={shown.length}
        actions={pricing ? <Button size="xl" variant="outline" className="px-md" onClick={() => openHistory("all")}>
          <Icon name="clock-counter-clockwise" size="sm" aria-hidden="true" />{CATALOG_TEXT.priceHistory}
        </Button> : undefined}
        search={
          <SearchSlot>
            <Input
              type="search"
              className="w-full"
              value={query}
              placeholder={CATALOG_TEXT.productSearchHint}
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
      {live.length || !retired.length ? renderLive() : null}
      <CollectionHistory id="retired" title={CATALOG_TEXT.rosterRetired} count={retired.length} mode={view}
        revealMatches={narrowed && !live.length}>
        {table(retired, undefined, true)}
      </CollectionHistory>
      {pricing && editingPrice ? (
        <ProductPricePanel key={`edit-${editingPrice}`} mode="edit" products={products}
          product={products.find((p) => p.id === editingPrice)} pricing={pricing}
          current={priceByProduct.get(editingPrice)} onClose={() => setEditingPrice(null)} />
      ) : null}
      {pricing && showHistory ? (
        <ProductPricePanel key={`history-${historyId}`} mode="history" products={products}
          product={historyProduct} pricing={pricing} onClose={() => openHistory(null)} />
      ) : null}
    </>
  );
}
