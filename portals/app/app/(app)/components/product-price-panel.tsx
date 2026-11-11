"use client";

import { useState, useTransition } from "react";
import {
  Button, DataTable, Drawer, EmptyState, Field, FieldDescription,
  FieldGroup, FieldLabel, Input, StatusBadge, useToast,
} from "@vxture/design-ui";
import type { PriceEntryRecord, ProductRecord } from "../../domains/catalog/store";
import { productPriceVersions, suggestedProductPrices } from "../lib/product-prices";
import { useMessages } from "../lib/i18n/provider";
import { DialogForm } from "./dialog-form";
import { ProductPriceValues } from "./product-price-values";
import { RowActions } from "./table-fittings";
import { Tag } from "./tag";

export interface ProductPricing {
  readonly prices: readonly PriceEntryRecord[];
  readonly currency: string;
  readonly now: number;
  readonly canPrice: boolean;
  readonly onSave: (input: {
    productId: string; currency: string;
    listPrice: number; floorPrice: number; minPrice: number | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onDelete: (priceId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function ProductPricePanel({ product, products, pricing, current, mode, onClose }: {
  readonly product?: ProductRecord;
  readonly products: readonly ProductRecord[];
  readonly pricing: ProductPricing;
  readonly current?: PriceEntryRecord;
  readonly mode: "edit" | "history";
  readonly onClose: () => void;
}) {
  const { CATALOG_TEXT: T, CATALOG_ERROR, DATA_TABLE_LABELS, DS_LABELS } = useMessages();
  const [list, setList] = useState(current ? String(current.listPrice) : "");
  const [floor, setFloor] = useState(current ? String(current.floorPrice) : "");
  const [min, setMin] = useState(current?.minPrice == null ? "" : String(current.minPrice));
  const [manualFloor, setManualFloor] = useState(false);
  const [manualMin, setManualMin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const numbers = [list, floor, min].map(Number);
  const complete = [list, floor, min].every((v) => v.trim() !== "") && numbers.every(Number.isFinite);
  const ordered = complete && numbers[2] >= 0 && numbers[2] <= numbers[1] && numbers[1] <= numbers[0];
  const defaults = list.trim() === "" ? null : suggestedProductPrices(Number(list));
  const applyList = (value: string) => {
    setList(value);
    const next = value.trim() === "" ? null : suggestedProductPrices(Number(value));
    if (!manualFloor) setFloor(next ? String(next.floorPrice) : "");
    if (!manualMin) setMin(next ? String(next.minPrice) : "");
  };
  const resetDiscounts = () => {
    if (!defaults) return;
    setFloor(String(defaults.floorPrice));
    setMin(String(defaults.minPrice));
    setManualFloor(false);
    setManualMin(false);
  };
  const save = () => {
    if (!product || !ordered || !pricing.canPrice) return;
    setError(null);
    start(async () => {
      const result = await pricing.onSave({ productId: product.id, currency: pricing.currency,
        listPrice: numbers[0], floorPrice: numbers[1], minPrice: numbers[2] });
      if (result.ok) onClose();
      else setError(CATALOG_ERROR[result.error ?? "denied"] ?? CATALOG_ERROR.denied);
    });
  };
  const versions = productPriceVersions(pricing.prices, undefined, pricing.now)
    .filter((p) => !product || p.productId === product.id);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const stateLabel = { current: T.priceStateCurrent, scheduled: T.priceStateScheduled, historical: T.priceStateHistorical };

  if (mode === "history") return (
    <Drawer open onClose={onClose} width="lg" title={T.priceHistory}
      description={product ? `${product.name} \u00b7 ${product.productCode}` : T.priceHistoryWhy}
      closeLabel={DS_LABELS.confirmCancel}>
      <DataTable
        labels={DATA_TABLE_LABELS}
        leadingSpacer
        indexStart={1}
        rowKey={(row) => row.id}
        rows={versions}
        columns={[
          ...(!product ? [{ id: "product", header: T.colProduct,
            cell: (row: (typeof versions)[number]) => names.get(row.productId) ?? T.noCategory }] : []),
          { id: "prices", header: T.productPrices, width: "md", cell: (row) => <ProductPriceValues price={row} currency={row.currency} /> },
          { id: "currency", header: T.colCurrency, cell: (row) => row.currency },
          { id: "effective", header: T.colEffective, cell: (row) => (
            <span className="flex flex-col gap-2xs tabular-nums text-body-small">
              <span>{row.effectiveAt.toISOString().slice(0, 10)}</span>
              <span className="text-muted-foreground">{row.effectiveAt.toISOString().slice(11, 19)} UTC</span>
            </span>
          ) },
          { id: "state", header: T.colStatus, cell: (row) => row.state === "historical" ? (
            <Tag>{stateLabel[row.state]}</Tag>
          ) : (
            <StatusBadge tone={row.state === "current" ? "success" : "info"}>
              {stateLabel[row.state]}
            </StatusBadge>
          ) },
        ]}
        rowActions={(row) => <RowActions disabled={pending} items={!pricing.canPrice ? [] : [{
          id: "delete", label: T.opDelete, danger: true,
          disabled: row.state === "current", hint: row.state === "current" ? T.priceInForceHint : undefined,
          confirm: { verb: T.opDelete, target: `${names.get(row.productId) ?? ""} ${row.listPrice.toLocaleString()}`,
            consequence: T.priceDeleteConsequence,
            onConfirm: () => start(async () => {
              const result = await pricing.onDelete(row.id);
              if (!result.ok) toast({ tone: "danger", title: CATALOG_ERROR[result.error ?? "denied"] ?? CATALOG_ERROR.denied });
            }),
          },
        }]} />}
        empty={<EmptyState title={T.noPrices} />}
      />
    </Drawer>
  );

  return (
    <DialogForm open onOpenChange={(open) => { if (!open && !pending) onClose(); }}
      title={current ? T.reprice : T.newPrice}
      description={`${product?.name ?? ""} \u00b7 ${pricing.currency}`}
      submitLabel={T.setPrice} submitting={pending} submitDisabled={!ordered || !pricing.canPrice}
      onSubmit={(e) => { e.preventDefault(); save(); }}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="price-list">{T.colList}</FieldLabel>
          <Input id="price-list" type="number" min="0" step="any" inputMode="decimal" value={list}
            disabled={pending} onChange={(e) => applyList(e.target.value)} />
          <FieldDescription>{T.listHint}</FieldDescription>
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <p className="text-body-small text-muted-foreground">{T.defaultPriceDiscounts}</p>
          <Button type="button" variant="ghost" size="md" disabled={pending || !defaults} onClick={resetDiscounts}>
            {T.resetPriceDiscounts}
          </Button>
        </div>
        <Field>
          <FieldLabel htmlFor="price-floor">{T.colFloor}</FieldLabel>
          <Input id="price-floor" type="number" min="0" step="any" inputMode="decimal" value={floor}
            disabled={pending} onChange={(e) => { setManualFloor(true); setFloor(e.target.value); }} />
          <FieldDescription>{T.floorHint}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="price-min">{T.colMin}</FieldLabel>
          <Input id="price-min" type="number" min="0" step="any" inputMode="decimal" value={min}
            disabled={pending} onChange={(e) => { setManualMin(true); setMin(e.target.value); }} />
          <FieldDescription>{T.minHint}</FieldDescription>
        </Field>
      </FieldGroup>
      {complete && !ordered ? <p role="alert" className="text-body-small text-destructive-text">{T.priceOrderHint}</p> : null}
      {error ? <p role="alert" className="text-body-small text-destructive-text">{error}</p> : null}
    </DialogForm>
  );
}
