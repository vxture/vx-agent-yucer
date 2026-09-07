"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  Icon,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import type { ProductRecord, ProductStatusRecord, ProductTypeRecord } from "../../domains/catalog/store";
import { statusTone } from "./status-label";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  FilterSlot,
  RowActions,
  SearchSlot,
  rowClickSelection,
} from "./table-fittings";
import { useMessages } from "../lib/i18n/provider";

// The module page's roster - owner ruling 2026-09-05: the page is DISPLAY, the
// row is where the operations live, locked to the right.
//
// Columns exactly as ruled: 序号 | 名称(主)+编码(副) | 类型 | 状态 | 计价单位 |
// 操作. Two rosters: the live one (on sale + in development, in catalogue
// order) and the retired one below it - retirement is shelving, so the shelf
// is visible but secondary.
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
  readonly canWrite: boolean;
  /** "sort" renders only the live roster with the move arrows - the 新建 page
   * mounts it beside the create form so a new product can be put in place. */
  readonly variant?: "full" | "sort";
  readonly onMove: (id: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
  readonly onStatus: (id: string, statusId: string) => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function ProductRoster({
  products,
  types,
  statuses,
  canWrite,
  variant = "full",
  onMove,
  onStatus,
  onDelete,
}: ProductRosterProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS, TABLE_TOOLBAR_TEXT } =
    useMessages();
  const [pending, startTransition] = useTransition();
  // 选择列 - one of the three standard fittings (table-fittings.tsx). Held
  // across BOTH rosters because the keys are product ids: a selection is of
  // products, not of whichever half of the page they were shown in.
  const [selected, setSelected] = useState<readonly string[]>([]);
  // Clicking the row toggles it - the checkbox is too small a target
  // (owner, 2026-09-06). Bound per table because each has its own row order.
  const click = (list: readonly ProductRecord[]) =>
    rowClickSelection(list, (r) => r.id, selected, setSelected);
  const { toast } = useToast();

  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const vocab = new Map(statuses.map((r) => [r.id, r]));
  const codeOf = (p: ProductRecord) => vocab.get(p.statusId)?.statusCode;

  /* 工具行 - one query across the live and retired rosters. A catalogue is
     looked up by name or code, and the person looking it up does not
     necessarily know it has been retired; that is often the answer they came
     for. The 分类 filter is the second axis because it is the only column
     with a small, closed set of values. */
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const match = (p: ProductRecord) => {
    const q = query.trim().toLowerCase();
    return (
      (q === "" ||
        p.name.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q)) &&
      (typeFilter === "" || p.typeId === typeFilter)
    );
  };
  const narrowed = query.trim() !== "" || typeFilter !== "";

  const isRetired = (p: ProductRecord) => codeOf(p) === "retired";
  const liveTotal = products.filter((p) => !isRetired(p)).length;
  const retiredTotal = products.filter(isRetired).length;

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

  const columns = [
    {
      id: "name",
      header: CATALOG_TEXT.colName,
      cell: (r: ProductRecord) => (
        <span className="flex min-w-0 flex-col">
          {/* 主标题字号加大加粗，副编码保持小字 (owner, 2026-09-06). */}
          <span className="text-foreground truncate text-body-lg font-semibold">{r.name}</span>
          <span className="text-muted-foreground mono truncate text-body-sm">{r.productCode}</span>
        </span>
      ),
    },
    {
      id: "type",
      header: CATALOG_TEXT.colType,
      align: "center" as const,
      cell: (r: ProductRecord) =>
        r.typeId ? (typeName.get(r.typeId) ?? CATALOG_TEXT.noCategory) : CATALOG_TEXT.noCategory,
    },
    {
      id: "status",
      header: CATALOG_TEXT.colStatus,
      align: "center" as const,
      cell: (r: ProductRecord) => {
        const row = vocab.get(r.statusId);
        return (
          <StatusBadge tone={row ? statusTone(row) : "neutral"}>
            {row?.name ?? ""}
          </StatusBadge>
        );
      },
    },
    {
      id: "unit",
      header: CATALOG_TEXT.colUnitPrice,
      align: "center" as const,
      cell: (r: ProductRecord) => r.unit,
    },
  ];

  /** One menu per row - the DS's single-trigger row-action column. ALWAYS
   * rendered: with no write permission the menu is empty and the trigger is
   * disabled, so the column holds its place (the 2026-09-06 fittings ruling). */
  const rowActions = (row: ProductRecord, rowIndex: number) => {
    const list = codeOf(row) === "retired" ? retired : live;
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
                  window.location.href = `/catalog/new?code=${encodeURIComponent(row.productCode)}`;
                },
              },
              ...targetsFor(row).map((to) => ({
                id: to.id,
                label: moveLabel(row, to),
                onSelect: () => run(onStatus(row.id, to.id)),
              })),
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
                  consequence: CATALOG_TEXT.deleteConsequence,
                  onConfirm: () => run(onDelete(row.id)),
                },
              },
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
    align: "center" as const,
    cell: (r: ProductRecord, rowIndex: number) => (
      <span className="flex items-center gap-xs">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={CATALOG_TEXT.opUp}
          title={CATALOG_TEXT.opUp}
          disabled={pending || rowIndex === 0}
          onClick={() => run(onMove(r.id, "up"))}
        >
          <Icon name="chevron-up" size="sm" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
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

  const table = (rows: readonly ProductRecord[], extra?: typeof arrowColumn) => {
    const select = click(rows);
    return (
    /* The config tables' geometry, applied here too (owner ruling; TD-022):
       table-fixed so the live and retired rosters align column for column
       regardless of content, the name column takes the lion's share, and the
       trailing column is token-fixed - the DS edge token for the single-
       trigger action slot, a wider fixed box for the sort page's two arrows.
       Counted FROM THE LEFT, and the leading pair is now 选择 | 序号, so the
       first business column is nth-child(3) rather than (2). */
    <div
      ref={select.ref}
      className={`[&_table]:table-fixed ${EDGE_COLUMNS} [&_thead_th:nth-child(3)]:w-[34%] ${select.className} ${
        extra ? "[&_thead_th:last-child]:w-[6.5rem]" : ACTION_COLUMN
      }`}
    >
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        rowKey={(r: ProductRecord) => r.id}
        rows={[...rows]}
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
            <EmptyState title={CATALOG_TEXT.rosterLive} description={CATALOG_TEXT.byTypeEmpty} />
          )
        }
      />
      </div>
    );
  };

  if (variant === "sort") {
    return (
      <Section icon="stack" title={CATALOG_TEXT.sortTitle} description={CATALOG_TEXT.sortWhy}>
        {table(live, canWrite ? arrowColumn : undefined)}
      </Section>
    );
  }

  return (
    <>
      <Section
        id="products"
        icon="stack"
        title={CATALOG_TEXT.rosterLive}
        description={CATALOG_TEXT.rosterLiveWhy}
        action={
          canWrite ? (
            <Button asChild>
              <a href="/catalog/new">{CATALOG_TEXT.newProduct}</a>
            </Button>
          ) : undefined
        }
      >
        {/* ONE TOOL ROW FOR BOTH ROSTERS. A catalogue is looked up by name or
            code, and the person looking does not necessarily know the product
            has been retired - that is often the answer they came for. The
            retired roster below says on its own heading that the same control
            is narrowing it. */}
        <FilterBar
          count={
            narrowed
              ? TABLE_TOOLBAR_TEXT.filteredCount(live.length, liveTotal)
              : CATALOG_TEXT.productCount(live.length)
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
        >
          <FilterSlot width="w-[9rem]">
            <NativeSelect
              value={typeFilter}
              aria-label={CATALOG_TEXT.filterAllTypes}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">{CATALOG_TEXT.filterAllTypes}</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </FilterSlot>
        </FilterBar>

        {table(live)}
      </Section>

      {/* Holds its place while narrowed - a section that vanishes under a
          keyword takes its own explanation with it. */}
      {retired.length > 0 || (narrowed && retiredTotal > 0) ? (
        <Section
          id="retired"
          icon="package"
          title={CATALOG_TEXT.rosterRetired}
          description={CATALOG_TEXT.rosterRetiredWhy}
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
