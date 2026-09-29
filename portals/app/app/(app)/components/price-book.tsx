"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FilterBar,
  Input,
  ListCard,
  ListCardGrid,
  NativeSelect,
  Section,
  StatusBadge,
  TableTitleCell,
  useToast,
  type FilterBarView,
} from "@vxture/design-ui";
import { Tag } from "./tag";
import { typeFamily } from "../../domains/catalog/lib/type-vocab";
import { CardsEmpty, TypeFilter } from "./catalog-tool-row";
import { DialogForm } from "./dialog-form";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";
import {
  RowActions,
  rowClickSelection,
  SearchSlot,
  useTableSort,
} from "./table-fittings";
import type {
  PriceEntryRecord,
  ProductRecord,
  ProductTypeRecord,
} from "../../domains/catalog/store";

// The price book's rosters - the catalogue module page's pattern and layout,
// applied here (owner ruling 2026-09-05).
//
// TWO LISTS, the same shape as the catalogue's live/retired split: the price
// IN FORCE for each product, and the superseded rows below it. That split is
// what a price BOOK is - entries are appended, never edited (ADR-014), so the
// old row is not clutter, it is the explanation of today's number.
//
// SETTING A PRICE IS A DIALOG, not a page (owner: 一个弹出面板即可). Three
// fields, no long-form layout to earn a route, and the AI assist that used to
// sit beside the page form is deliberately not here - the floor is a
// commercial decision and the owner has paused the suggestions.
//
// LABELS CARRY NAMES ONLY. What a field MEANS goes in FieldDescription, which
// is the DS's slot for exactly that; a label that grew an explanation is the
// defect this page was told to avoid.

/** A history row: the entry, plus when it stopped applying. Derived by the
 * page from the next entry's effective time - see the note there. */
export type SupersededPrice = PriceEntryRecord & { readonly supersededAt: Date | null };

export interface PriceBookProps {
  readonly products: readonly ProductRecord[];
  /** The catalogue's type vocabulary - the 产品类型 filter reads the same list
   * the product catalogue's does (owner, 2026-09-29: 同产品目录). */
  readonly types: readonly ProductTypeRecord[];
  /** The entry in force per product, computed on the SERVER: "in force" reads
   * a clock, and a clock read during hydration is a different clock from the
   * one that rendered the HTML. */
  readonly current: readonly PriceEntryRecord[];
  /** Everything the current entries replaced, newest first, each carrying the
   * moment it stopped applying - the next price's effective time. */
  readonly superseded: readonly SupersededPrice[];
  readonly canPrice: boolean;
  /** The workspace's default (incr/0044) - what every entry here is in. */
  readonly currency: string;
  readonly onSave: (input: {
    productId: string;
    currency: string;
    listPrice: number;
    floorPrice: number;
    minPrice: number | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (priceId: string) => Promise<{ ok: boolean; error?: string }>;
}

/** The workspace's currency. The store keys every price by it and the model
 * keeps it, but this product quotes in one currency: the dialog offers no
 * choice, so a column repeating "CNY" on every row was spending the product
 * name's width on a constant. The column returns the day a second currency
 * does. */

/** How far a price sits under the standard price, as the tag beside it says:
 * "-20%". Null when there is nothing to say - no list to measure against, or
 * no price (a 保底价 from before incr/0099). Equal to list reads "0%": not
 * discountable is a stance, and the tag says it rather than going quiet. */
export function discountPct(price: number | null, list: number): string | null {
  if (price === null || !(list > 0)) return null;
  const pct = Math.round((1 - price / list) * 100);
  return pct === 0 ? "0%" : `-${pct}%`;
}

/* 排序取值: what each sortable column ORDERS ON. Not always what the cell
   renders - a money cell sorts on the raw amount, not its formatted string. */
const SORT_ON = {
  product: (r: PriceEntryRecord) => r.productId,
  list: (r: PriceEntryRecord) => r.listPrice,
  floor: (r: PriceEntryRecord) => r.floorPrice,
  min: (r: PriceEntryRecord) => r.minPrice ?? -1,
};

export function PriceBook({
  products,
  types,
  current,
  superseded,
  canPrice,
  currency,
  onSave,
  onDelete,
}: PriceBookProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS, TABLE_TOOLBAR_TEXT } =
    useMessages();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [view, setView] = useState<FilterBarView>("list");
  // The SELECTION drives analysis, and only the in-force table carries it:
  // history is never analysed (owner, 2026-09-05), so a checkbox there would
  // promise something the dock refuses to do. The history table takes the
  // DS's leadingSpacer instead - the same width, no control - so the two
  // tables line up column for column and read as one layout.
  const [selected, setSelected] = useState<readonly string[]>([]);
  /* THE SELECTION IS PUBLISHED TO THE URL (?sel=). 智能定价评估 moved to the
     栏3 business-intelligence area (owner, 2026-09-29), which is a parallel
     route - a different React tree that cannot receive this state. The URL is
     the bridge the deck already reads (`?analyze=`); `sel` is what is ticked,
     `analyze` is what the deck's button last ran on. Product ids, not entry
     ids: the analysis is about products. */
  const publishSelection = (keys: readonly string[]) => {
    setSelected(keys);
    const ids = current.filter((e) => keys.includes(e.id)).map((e) => e.productId);
    const next = new URLSearchParams(params.toString());
    if (ids.length > 0) next.set("sel", ids.join(","));
    else next.delete("sel");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const sorted = useTableSort<PriceEntryRecord>([], SORT_ON);
  const [dialog, setDialog] = useState<{
    productId: string;
    list: string;
    floor: string;
    min: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const productName = new Map(products.map((p) => [p.id, p.name]));
  const productCode = new Map(products.map((p) => [p.id, p.productCode]));

  /* 工具行. A price book is looked up BY PRODUCT, so the box searches the
     product's name and code - the entry itself has no name. Both tables read
     it: "what did we use to charge for this" is the same lookup as "what do
     we charge for this", one row further down.

     产品类型 IS THE FILTER (owner, 2026-09-29: 同产品目录) - the same
     vocabulary and the same control the catalogue's tool row carries, so the
     two pages narrow the same way. Currency is still not one: this book is
     single-currency in practice, and a one-option dropdown does nothing. */
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const productType = new Map(products.map((p) => [p.id, p.typeId]));
  const narrowed = query.trim() !== "" || typeFilter !== "";
  const match = (e: PriceEntryRecord) => {
    // A 一级类 matches its 二级类 too (incr/0100).
    if (typeFilter !== "") {
      const t = productType.get(e.productId);
      if (!t || !typeFamily(types, typeFilter).has(t)) return false;
    }
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    const name = productName.get(e.productId) ?? "";
    const code = productCode.get(e.productId) ?? "";
    return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
  };

  const shownCurrent = current.filter(match);
  const shownSuperseded = superseded.filter(match);

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({ tone: "danger", title: CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied });
      });
    });

  const list = Number(dialog?.list);
  const floor = Number(dialog?.floor);
  const min = Number(dialog?.min);
  // 保底价 is required on every new price (incr/0099) - the service refuses
  // without it, so the dialog does not offer a submit that can only fail.
  const ready =
    dialog !== null &&
    dialog.productId !== "" &&
    dialog.list.trim() !== "" &&
    dialog.floor.trim() !== "" &&
    dialog.min.trim() !== "" &&
    Number.isFinite(list) &&
    Number.isFinite(floor) &&
    Number.isFinite(min);

  const submit = () => {
    if (!dialog || !ready) return;
    setErr(null);
    startTransition(() => {
      void onSave({
        productId: dialog.productId,
        currency,
        listPrice: list,
        floorPrice: floor,
        minPrice: min,
      }).then((r) => {
        if (r.ok) setDialog(null);
        else setErr(CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied);
      });
    });
  };

  /** A moment, to the second, on two lines.
   *
   * To the second because two prices minutes apart are a real sequence; from
   * the ISO string rather than a locale because a locale renders differently
   * on the server than in the browser, which is a hydration mismatch rather
   * than a nicety; on two lines because the history table carries two of
   * these and one-line stamps would take the product name's width. */
  const stamp = (at: Date | null) =>
    at === null ? (
      <span className="text-muted-foreground">-</span>
    ) : (
      <span className="flex flex-col tabular-nums leading-tight">
        <span>{at.toISOString().slice(0, 10)}</span>
        <span className="text-muted-foreground text-body-sm">
          {at.toISOString().slice(11, 19)}
        </span>
      </span>
    );

  const columns = [
    {
      id: "product",
  sortable: true,
      header: CATALOG_TEXT.colProduct,
      width: "md" as const,
      cell: (r: PriceEntryRecord) => (
        <TableTitleCell
          title={productName.get(r.productId) ?? CATALOG_TEXT.noCategory}
          description={productCode.get(r.productId) ?? ""}
          tooltip={productName.get(r.productId) ?? CATALOG_TEXT.noCategory}
        />
      ),
    },
    {
      id: "list",
      header: CATALOG_TEXT.colList,
      // 资金列：右对齐让个位对齐，右侧留白让数字块看上去仍在列中间
      // (owner, 2026-09-06). Widened from 5.5rem to 6.5rem to make room for
      // the inset: at 5.5rem the content box was 56px against a 48px number,
      // so there were 8px of slack and the rule had nowhere to happen.
      // 金额列走 DS 的 numeric 档（design-ui 8.0.0）：右对齐 + 一档右内
      // 边距 + tabular-nums。本地那个 MoneyCell 就是手搓的同一件事。
      sortable: true,
      align: "money" as const,
      cell: (r: PriceEntryRecord) => r.listPrice.toLocaleString(),
    },
    {
      id: "floor",
      header: CATALOG_TEXT.colFloor,
      // TAG AND PRICE ON ONE LINE (owner, 2026-09-29): the discount says how
      // far under 标准价 this sits, the number says where. Equal to list keeps
      // its warning colour - "not discountable" is a stance worth seeing.
      sortable: true,
      align: "money" as const,
      cell: (r: PriceEntryRecord) => (
        <PriceWithTag price={r.floorPrice} list={r.listPrice} warn={r.floorPrice === r.listPrice} />
      ),
    },
    {
      id: "min",
      header: CATALOG_TEXT.colMin,
      sortable: true,
      align: "money" as const,
      // A price from before incr/0099 has no 保底价 - a dash, not a zero:
      // zero would claim the product may be given away.
      cell: (r: PriceEntryRecord) => <PriceWithTag price={r.minPrice} list={r.listPrice} />,
    },
    {
      id: "effective",
      header: CATALOG_TEXT.colEffective,
      width: "lg" as const,
      cell: (r: PriceEntryRecord) => stamp(r.effectiveAt),
    },
  ];

  /** The history table's own column: when this price stopped applying. Only
   * that table has it - a price in force has not stopped. */
  const supersededColumn = {
    id: "superseded",
    header: CATALOG_TEXT.colSuperseded,
    width: "md" as const,
    cell: (r: PriceEntryRecord) => stamp((r as SupersededPrice).supersededAt ?? null),
  };

  /** One menu per row. `inForce` decides what the row may do: the price a
   * product is quoted at can be re-priced but never deleted, and a superseded
   * row is the other way round. The delete item is RENDERED EITHER WAY,
   * disabled with its reason - a control that vanishes teaches nothing, and
   * the DS's `hint` exists for exactly this (禁用项不说理由，用户只能猜). The
   * service decides again on submit; this is the interface agreeing with it. */
  const rowActions = (inForce: boolean) => (row: PriceEntryRecord) => (
    <RowActions
      disabled={pending}
      items={
        !canPrice
          ? []
          : [
              ...(inForce
                ? [
                    {
                      id: "reprice",
                      label: CATALOG_TEXT.reprice,
                      onSelect: () => {
                        setErr(null);
                        setDialog({
                          productId: row.productId,
                          list: String(row.listPrice),
                          floor: String(row.floorPrice),
                          // History has no minimum (pre-0099): left blank
                          // for the person repricing to decide.
                          min: row.minPrice === null ? "" : String(row.minPrice),
                        });
                      },
                    },
                  ]
                : []),
              {
                id: "delete",
                label: CATALOG_TEXT.opDelete,
                danger: true as const,
                separatorBefore: inForce,
                disabled: inForce,
                hint: inForce ? CATALOG_TEXT.priceInForceHint : undefined,
                confirm: {
                  verb: CATALOG_TEXT.opDelete,
                  target: `${productName.get(row.productId) ?? ""} ${row.listPrice.toLocaleString()}/${row.floorPrice.toLocaleString()}`,
                  consequence: CATALOG_TEXT.priceDeleteConsequence,
                  onConfirm: () => run(onDelete(row.id)),
                },
              },
            ]
      }
    />
  );

  /* THE CATALOGUE'S PATTERN, verbatim (owner: 按产品目录的模式). Three lines
     and no per-table invention: table-fixed, the three edge columns pinned at
     64px, the title column at a percentage, and every other content column
     left AUTO to share what remains equally.

     Auto is what makes the other two work. Under table-fixed a specified
     width only holds while something can absorb the slack - pin every column
     and the surplus is shared out proportionally instead, which is how the
     "fixed" edge columns came to measure 100px at 1920. One set of columns
     has to stay elastic, and it is the ones whose content is elastic.

     Columns (owner, 2026-09-29): 选择 | 序号 | 产品 | 标准价 | 审批价 | 保底价 |
     生效时间 | 操作 - so 生效时间 is the 7th header cell.

     生效时间 IS PINNED, and it belongs with the edges rather than with the
     elastic columns: its content has a hard floor. The stamp is deliberately
     two lines - date above, time below - and the DATE alone measures 76px, so
     an auto share of 56px broke it into THREE lines mid-date (2026- / 03-10 /
     06:36:16). 7rem gives the 80px it needs. Pinning a column whose content
     cannot shrink is what the pattern already does for 选择 / 序号 / 操作; the
     columns left auto are the ones whose content really is elastic. */
  const table = (
    rows: readonly PriceEntryRecord[],
    acts: ReturnType<typeof rowActions>,
    selectable = false,
    extra?: typeof supersededColumn,
  ) => {
    /* Row-click selection only where selection exists: the history table
       carries the DS spacer rather than checkboxes (owner: 占位，不实现多选),
       so a click there would tick a box that is not offered. */
    const select = selectable
      ? rowClickSelection()
      : { ref: undefined, className: "" };
    return (
    <div
      ref={select.ref}
      className={`[&_table]:table-fixed [&_thead_th:nth-child(3)]:w-[22%] [&_thead_th:nth-child(7)]:w-[7rem] ${select.className}`}
    >
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        rowKey={(r: PriceEntryRecord) => r.id}
        rows={[...sorted.sortRows(rows)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
        columns={extra ? [...columns, extra] : columns}
        rowActions={acts}
        selectedKeys={selectable ? selected : undefined}
        onSelectionChange={selectable ? (keys) => publishSelection([...keys]) : undefined}
        leadingSpacer={!selectable}
        empty={
          narrowed ? (
            <EmptyState
              title={TABLE_TOOLBAR_TEXT.noMatch}
              description={TABLE_TOOLBAR_TEXT.noMatchWhy}
            />
          ) : (
            <EmptyState title={CATALOG_TEXT.noPrices} description={CATALOG_TEXT.priceCurrentWhy} />
          )
        }
      />
    </div>
    );
  };

  return (
    <>
      <Section
        id="pricebook"
        icon={moduleIcon("pricebook")}
        title={CATALOG_TEXT.priceCurrent}
        description={CATALOG_TEXT.priceCurrentWhy}
      >
        {/* THE TOOL ROW IS THE DS's (owner, 2026-09-29): 列表/卡片 on the left,
            then 搜索 · 产品类型 · 【设定价格】 on the right. The two analysis
            buttons that used to sit in this header moved to 栏3's business-
            intelligence area, where the analysis itself is shown - see
            @deck/pricebook. The history below reads the same keyword and type,
            and says so on its own heading. */}
        <FilterBar
          view={view}
          onViewChange={setView}
          count={
            narrowed
              ? TABLE_TOOLBAR_TEXT.filteredCount(shownCurrent.length, current.length)
              : CATALOG_TEXT.priceCount(current.length)
          }
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
          resetLabel={TABLE_TOOLBAR_TEXT.resetFilters}
          actions={
            /* A primary button, DISABLED rather than hidden without the
               permission (FilterBar's own contract): the reader learns the
               action exists and why it is not theirs. */
            <Button
              disabled={!canPrice}
              title={canPrice ? undefined : CATALOG_TEXT.priceDenied}
              onClick={() => {
                setErr(null);
                setDialog({ productId: "", list: "", floor: "", min: "" });
              }}
            >
              {CATALOG_TEXT.newPrice}
            </Button>
          }
        >
          <TypeFilter types={types} value={typeFilter} onChange={setTypeFilter} />
        </FilterBar>

        {view === "list" ? (
          table(shownCurrent, rowActions(true), true)
        ) : shownCurrent.length === 0 ? (
          <CardsEmpty narrowed={narrowed} title={CATALOG_TEXT.noPrices} description={CATALOG_TEXT.priceCurrentWhy} />
        ) : (
          /* THE SAME ROW, DRAWN AS A CARD (DS ListCard): product and code top
             left, the row menu top right, and the three prices with their
             tags plus 生效时间 as the meta line. */
          <ListCardGrid className="p-md">
            {[...sorted.sortRows(shownCurrent)].map((row) => (
              <ListCard
                key={row.id}
                title={productName.get(row.productId) ?? CATALOG_TEXT.noCategory}
                description={productCode.get(row.productId) ?? ""}
                actions={rowActions(true)(row)}
                meta={
                  <>
                    <span className="tabular-nums">
                      {CATALOG_TEXT.colList} {row.listPrice.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-2xs">
                      {CATALOG_TEXT.colFloor}
                      <PriceWithTag price={row.floorPrice} list={row.listPrice} />
                    </span>
                    <span className="flex items-center gap-2xs">
                      {CATALOG_TEXT.colMin}
                      <PriceWithTag price={row.minPrice} list={row.listPrice} />
                    </span>
                    <span className="tabular-nums">
                      {CATALOG_TEXT.colEffective} {row.effectiveAt.toISOString().slice(0, 10)}
                    </span>
                  </>
                }
              />
            ))}
          </ListCardGrid>
        )}
      </Section>

      {/* Holds its place while narrowed rather than vanishing under a keyword
          and taking its own explanation with it. */}
      {shownSuperseded.length > 0 || (narrowed && superseded.length > 0) ? (
        <Section
          id="price-history"
          icon="file-text"
          title={CATALOG_TEXT.priceHistory}
          description={CATALOG_TEXT.priceHistoryWhy}
          action={
            narrowed ? (
              <StatusBadge tone="info">{CATALOG_TEXT.narrowedNote}</StatusBadge>
            ) : undefined
          }
        >
          {table(shownSuperseded, rowActions(false), false, supersededColumn)}
        </Section>
      ) : null}

      <DialogForm
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={CATALOG_TEXT.newPrice}
        description={CATALOG_TEXT.repriceWhy}
        submitLabel={CATALOG_TEXT.setPrice}
        submitting={pending}
        submitDisabled={!ready}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="price-product">{CATALOG_TEXT.colProduct}</FieldLabel>
            <NativeSelect
              id="price-product"
              value={dialog?.productId ?? ""}
              disabled={pending}
              onChange={(e) => setDialog((d) => (d ? { ...d, productId: e.target.value } : d))}
            >
              <option value="">{CATALOG_TEXT.pickProduct}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="price-list">{CATALOG_TEXT.colList}</FieldLabel>
            <Input
              id="price-list"
              type="number"
              min="0"
              inputMode="decimal"
              value={dialog?.list ?? ""}
              disabled={pending}
              onChange={(e) => setDialog((d) => (d ? { ...d, list: e.target.value } : d))}
            />
            <FieldDescription>{CATALOG_TEXT.listHint}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="price-floor">{CATALOG_TEXT.colFloor}</FieldLabel>
            <Input
              id="price-floor"
              type="number"
              min="0"
              inputMode="decimal"
              value={dialog?.floor ?? ""}
              disabled={pending}
              onChange={(e) => setDialog((d) => (d ? { ...d, floor: e.target.value } : d))}
            />
            <FieldDescription>{CATALOG_TEXT.floorHint}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="price-min">{CATALOG_TEXT.colMin}</FieldLabel>
            <Input
              id="price-min"
              type="number"
              min="0"
              inputMode="decimal"
              value={dialog?.min ?? ""}
              disabled={pending}
              onChange={(e) => setDialog((d) => (d ? { ...d, min: e.target.value } : d))}
            />
            <FieldDescription>{CATALOG_TEXT.minHint}</FieldDescription>
          </Field>
        </FieldGroup>

        {/* Said BEFORE submitting: equal-to-list is legal and meaningful, and
            the person typing it should see the product read the choice. */}
        {ready && list === floor ? (
          <StatusBadge tone="warning">{CATALOG_TEXT.floorEqualsList}</StatusBadge>
        ) : null}
        {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
      </DialogForm>
    </>
  );
}

/** A price with its discount tag on the SAME line (owner, 2026-09-29): the
 * tag first, then the number, right-aligned together so the digits still line
 * up down the column. A missing price (a 保底价 from before incr/0099) is a
 * dash with no tag. */
function PriceWithTag({
  price,
  list,
  warn = false,
}: {
  readonly price: number | null;
  readonly list: number;
  readonly warn?: boolean;
}) {
  if (price === null) return <span className="text-muted-foreground">-</span>;
  const pct = discountPct(price, list);
  return (
    <span className="inline-flex items-center justify-end gap-xs whitespace-nowrap">
      {pct ? <Tag>{pct}</Tag> : null}
      <span className={`tabular-nums ${warn ? "text-(color:--warning-text)" : ""}`}>
        {price.toLocaleString()}
      </span>
    </span>
  );
}
