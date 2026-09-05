"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ActionMenu,
  Button,
  DataTable,
  DialogForm,
  EmptyState,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
  useToast,
} from "@vxture/design-ui";
import type { PriceEntryRecord, ProductRecord } from "../../domains/catalog/store";
import { moduleIcon } from "../lib/navigation";
import { useMessages } from "../lib/i18n/provider";

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

export interface PriceBookProps {
  readonly products: readonly ProductRecord[];
  /** The entry in force per product, computed on the SERVER: "in force" reads
   * a clock, and a clock read during hydration is a different clock from the
   * one that rendered the HTML. */
  readonly current: readonly PriceEntryRecord[];
  /** Everything the current entries replaced, newest first. */
  readonly superseded: readonly PriceEntryRecord[];
  readonly canPrice: boolean;
  readonly onSave: (input: {
    productId: string;
    currency: string;
    listPrice: number;
    floorPrice: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (priceId: string) => Promise<{ ok: boolean; error?: string }>;
}

/** The workspace's currency. The store keys every price by it and the model
 * keeps it, but this product quotes in one currency: the dialog offers no
 * choice, so a column repeating "CNY" on every row was spending the product
 * name's width on a constant. The column returns the day a second currency
 * does. */
const CURRENCY = "CNY";

export function PriceBook({
  products,
  current,
  superseded,
  canPrice,
  onSave,
  onDelete,
}: PriceBookProps) {
  const { CATALOG_TEXT, CATALOG_ERROR, DATA_TABLE_LABELS } = useMessages();
  const router = useRouter();
  // The SELECTION drives analysis, and only the in-force table carries it:
  // history is never analysed (owner, 2026-09-05), so a checkbox there would
  // promise something the dock refuses to do.
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [dialog, setDialog] = useState<{ productId: string; list: string; floor: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const productName = new Map(products.map((p) => [p.id, p.name]));
  const productCode = new Map(products.map((p) => [p.id, p.productCode]));

  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    startTransition(() => {
      void p.then((r) => {
        if (r.ok) return;
        toast({ tone: "danger", title: CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied });
      });
    });

  const list = Number(dialog?.list);
  const floor = Number(dialog?.floor);
  const ready =
    dialog !== null &&
    dialog.productId !== "" &&
    dialog.list.trim() !== "" &&
    dialog.floor.trim() !== "" &&
    Number.isFinite(list) &&
    Number.isFinite(floor);

  const submit = () => {
    if (!dialog || !ready) return;
    setErr(null);
    startTransition(() => {
      void onSave({
        productId: dialog.productId,
        currency: CURRENCY,
        listPrice: list,
        floorPrice: floor,
      }).then((r) => {
        if (r.ok) setDialog(null);
        else setErr(CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied);
      });
    });
  };

  const columns = [
    {
      id: "product",
      header: CATALOG_TEXT.colProduct,
      width: "md" as const,
      cell: (r: PriceEntryRecord) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-foreground truncate">
            {productName.get(r.productId) ?? CATALOG_TEXT.noCategory}
          </span>
          <span className="text-muted-foreground mono truncate text-body-sm">
            {productCode.get(r.productId) ?? ""}
          </span>
        </span>
      ),
    },
    {
      id: "list",
      header: CATALOG_TEXT.colList,
      width: "sm" as const,
      align: "right" as const,
      cell: (r: PriceEntryRecord) => (
        <span className="tabular-nums">{r.listPrice.toLocaleString()}</span>
      ),
    },
    {
      id: "floor",
      header: CATALOG_TEXT.colFloor,
      width: "sm" as const,
      align: "right" as const,
      // Equal to list means "not discountable" - a stance, worth seeing at a
      // glance rather than worked out by comparing two columns.
      cell: (r: PriceEntryRecord) => (
        <span
          className={`tabular-nums ${
            r.floorPrice === r.listPrice ? "text-(color:--warning-text)" : ""
          }`}
        >
          {r.floorPrice.toLocaleString()}
        </span>
      ),
    },
    {
      id: "effective",
      header: CATALOG_TEXT.colEffective,
      width: "lg" as const,
      align: "center" as const,
      // To the second, and formatted from the ISO string rather than a locale:
      // two prices minutes apart are a real sequence, and a locale format
      // would render differently on the server than in the browser, which is
      // a hydration mismatch rather than a nicety.
      cell: (r: PriceEntryRecord) => (
        <span className="tabular-nums">
          {r.effectiveAt.toISOString().slice(0, 19).replace("T", " ")}
        </span>
      ),
    },
  ];

  /** One menu per row. `inForce` decides what the row may do: the price a
   * product is quoted at can be re-priced but never deleted, and a superseded
   * row is the other way round. The delete item is RENDERED EITHER WAY,
   * disabled with its reason - a control that vanishes teaches nothing, and
   * the DS's `hint` exists for exactly this (禁用项不说理由，用户只能猜). The
   * service decides again on submit; this is the interface agreeing with it. */
  const rowActions = (inForce: boolean) =>
    canPrice
      ? (row: PriceEntryRecord) => (
          <ActionMenu
            disabled={pending}
            items={[
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
            ]}
          />
        )
      : undefined;

  /* The catalogue rosters' geometry, so the module pages read as one product
     (TD-022): fixed layout, the DS edge token on the action column, and every
     other column pinned EXCEPT the product name - the one column whose
     content varies gets the remainder, which is what fixed layout gives an
     unsized column. Counted from the RIGHT (nth-last-child) because the
     selection column shifts every position when the table is selectable. */
  const table = (
    rows: readonly PriceEntryRecord[],
    acts: ReturnType<typeof rowActions>,
    selectable = false,
  ) => (
    <div className="[&_table]:table-fixed [&_thead_th:nth-last-child(2)]:w-[10.5rem] [&_thead_th:nth-last-child(3)]:w-[5.5rem] [&_thead_th:nth-last-child(4)]:w-[5.5rem] [&_thead_th:last-child]:w-control-3xl">
      <DataTable
        labels={DATA_TABLE_LABELS}
        indexStart={1}
        rowKey={(r: PriceEntryRecord) => r.id}
        rows={[...rows]}
        columns={columns}
        rowActions={acts}
        selectedKeys={selectable ? selected : undefined}
        onSelectionChange={selectable ? (keys) => setSelected([...keys]) : undefined}
        empty={<EmptyState title={CATALOG_TEXT.noPrices} description={CATALOG_TEXT.priceCurrentWhy} />}
      />
    </div>
  );

  return (
    <>
      <Section
        id="pricebook"
        icon={moduleIcon("pricebook")}
        title={CATALOG_TEXT.priceCurrent}
        description={CATALOG_TEXT.priceCurrentWhy}
        action={
          <span className="flex items-center gap-sm">
            {/* Analysis of what is TICKED. Disabled until something is,
                with the reason on the hover rather than a click that
                silently does nothing. The dock's own button covers the
                whole book; this one is the narrow question. */}
            <Button
              variant="secondary"
              disabled={selected.length === 0}
              title={selected.length === 0 ? CATALOG_TEXT.analyzeSelectedHint : undefined}
              onClick={() => {
                const ids = current
                  .filter((e) => selected.includes(e.id))
                  .map((e) => e.productId);
                router.push(`/pricebook?analyze=${ids.join(",")}`);
              }}
            >
              {CATALOG_TEXT.analyzeSelected}
            </Button>
            {canPrice ? (
              <Button
                onClick={() => {
                  setErr(null);
                  setDialog({ productId: "", list: "", floor: "" });
                }}
              >
                {CATALOG_TEXT.newPrice}
              </Button>
            ) : null}
          </span>
        }
      >
        {table(current, rowActions(true), true)}
        {canPrice ? null : (
          <p className="text-muted-foreground mt-sm text-body-sm">{CATALOG_TEXT.priceDenied}</p>
        )}
      </Section>

      {superseded.length > 0 ? (
        <Section
          id="price-history"
          icon="file-text"
          title={CATALOG_TEXT.priceHistory}
          description={CATALOG_TEXT.priceHistoryWhy}
        >
          {table(superseded, rowActions(false))}
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
