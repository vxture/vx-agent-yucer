"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type {
  PriceEntryRecord,
  ProductRecord,
  SolutionItemRecord,
  SolutionRecord,
} from "../../domains/catalog/store";

// The catalogue's three panels.
//
// ONE FILE, THREE SECTIONS, ONE PAGE. A catalogue of a handful of products does
// not need three routes; splitting it would make the module nav a row of
// siblings that are really one screen. The launcher marks solutions and the
// price book as SECTIONS of this page for the same reason - they are built and
// they live here.
//
// The two forms are separate because the two permissions are: `catalog.write`
// maintains what we sell and `catalog.price` decides what we will not go below,
// and a single form guarded by the weaker of the two would hand the floor to
// whoever can rename a product.

export interface CatalogPanelsProps {
  readonly products: readonly ProductRecord[];
  readonly solutions: readonly {
    readonly solution: SolutionRecord;
    readonly items: readonly SolutionItemRecord[];
  }[];
  readonly prices: readonly PriceEntryRecord[];
  readonly canWrite: boolean;
  readonly canPrice: boolean;
  readonly canSolution: boolean;
  readonly onSaveProduct: (input: {
    productCode: string;
    name: string;
    category: string | null;
    unit: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onSaveSolution: (input: {
    solutionCode: string;
    name: string;
    summary: string | null;
    items: readonly { productId: string; quantity: number }[];
  }) => Promise<{ ok: boolean; error?: string }>;
  readonly onSavePrice: (input: {
    productId: string;
    currency: string;
    listPrice: number;
    floorPrice: number;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function CatalogPanels({
  products,
  solutions,
  prices,
  canWrite,
  canPrice,
  canSolution,
  onSaveProduct,
  onSaveSolution,
  onSavePrice,
}: CatalogPanelsProps) {
  const { CATALOG_TEXT, DATA_TABLE_LABELS } = useMessages();
  const productName = new Map(products.map((p) => [p.id, p.name]));

  return (
    <>
      <Section id="products" icon="stack" title={CATALOG_TEXT.products} description={CATALOG_TEXT.productsWhy}>
        {products.length === 0 ? (
          <EmptyState title={CATALOG_TEXT.products} description={CATALOG_TEXT.productsWhy} />
        ) : (
          <DataTable
            labels={DATA_TABLE_LABELS}
            leadingSpacer
            indexStart={1}
            rowKey={(r: ProductRecord) => r.id}
            rows={[...products]}
            columns={[
              { id: "productCode", header: CATALOG_TEXT.colCode, cell: (r: ProductRecord) => <span className="mono">{r.productCode}</span> },
              { id: "name", header: CATALOG_TEXT.colName, cell: (r: ProductRecord) => r.name },
              {
                id: "category",
                header: CATALOG_TEXT.colCategory,
                cell: (r: ProductRecord) => r.category ?? CATALOG_TEXT.noCategory,
              },
              { id: "unit", header: CATALOG_TEXT.colUnit, cell: (r: ProductRecord) => r.unit },
              {
                id: "status",
                header: CATALOG_TEXT.colStatus,
                cell: (r: ProductRecord) => (
                  <StatusBadge tone={r.status === "active" ? "success" : "neutral"}>
                    {r.status === "active" ? CATALOG_TEXT.statusActive : CATALOG_TEXT.statusRetired}
                  </StatusBadge>
                ),
              },
            ]}
          />
        )}
        {canWrite ? <ProductForm onSave={onSaveProduct} /> : null}
      </Section>
    </>
  );
}

/**
 * THE THREE WERE ONE COMPONENT AND ARE NOW THREE.
 *
 * They rendered together while /catalog was one route with three anchors. The
 * per-domain menu ended that: with armory holding five entries, three of them
 * landing on /catalog read as a broken menu rather than as one screen with
 * parts. Each section keeps its own id so existing anchors still resolve.
 */
export function SolutionSection({
  products,
  solutions,
  canSolution,
  onSaveSolution,
}: Pick<CatalogPanelsProps, "products" | "solutions" | "canSolution" | "onSaveSolution">) {
  const { CATALOG_TEXT } = useMessages();
  const productName = new Map(products.map((p) => [p.id, p.name]));
  return (
    <>
      <Section id="solutions" icon="puzzle" title={CATALOG_TEXT.solutions} description={CATALOG_TEXT.solutionsWhy}>
        {solutions.length === 0 ? (
          <EmptyState title={CATALOG_TEXT.noSolutions} description={CATALOG_TEXT.emptyBundle} />
        ) : (
          <div className="flex flex-col gap-sm">
            {solutions.map(({ solution, items }) => (
              <div key={solution.id} className="flex flex-wrap items-baseline gap-xs">
                <span className="text-foreground font-medium">{solution.name}</span>
                <span className="mono text-muted-foreground text-xs">{solution.solutionCode}</span>
                <StatusBadge tone="neutral">{CATALOG_TEXT.solutionItems(items.length)}</StatusBadge>
                <span className="text-muted-foreground text-xs">
                  {items.map((i) => `${productName.get(i.productId) ?? i.productId} x${i.quantity}`).join(" · ")}
                </span>
              </div>
            ))}
          </div>
        )}
        {canSolution ? <SolutionForm products={products} onSave={onSaveSolution} /> : null}
      </Section>
    </>
  );
}

export function PriceSection({
  products,
  prices,
  canPrice,
  onSavePrice,
}: Pick<CatalogPanelsProps, "products" | "prices" | "canPrice" | "onSavePrice">) {
  const { CATALOG_TEXT, DATA_TABLE_LABELS } = useMessages();
  const productName = new Map(products.map((p) => [p.id, p.name]));
  return (
    <>
      <Section id="pricebook" icon="currency-cny" title={CATALOG_TEXT.pricebook} description={CATALOG_TEXT.pricebookWhy}>
        {prices.length === 0 ? (
          <EmptyState title={CATALOG_TEXT.noPrices} description={CATALOG_TEXT.pricebookWhy} />
        ) : (
          <DataTable
            labels={DATA_TABLE_LABELS}
            leadingSpacer
            indexStart={1}
            rowKey={(r: PriceEntryRecord) => r.id}
            rows={[...prices]}
            columns={[
              {
                id: "product",
                header: CATALOG_TEXT.colName,
                cell: (r: PriceEntryRecord) => productName.get(r.productId) ?? r.productId,
              },
              { id: "currency", header: CATALOG_TEXT.colCurrency, cell: (r: PriceEntryRecord) => r.currency },
              { id: "list", header: CATALOG_TEXT.colList, align: "right" as const, cell: (r: PriceEntryRecord) => r.listPrice.toLocaleString() },
              {
                id: "floor",
                header: CATALOG_TEXT.colFloor,
                align: "right" as const,
                // The floor reads as the decision it is. Equal to list means
                // "not discountable", which is worth seeing at a glance rather
                // than working out by comparing two columns.
                cell: (r: PriceEntryRecord) => (
                  <span className={r.floorPrice === r.listPrice ? "text-(color:--warning-text)" : undefined}>
                    {r.floorPrice.toLocaleString()}
                  </span>
                ),
              },
              {
                id: "effective",
                header: CATALOG_TEXT.colEffective,
                cell: (r: PriceEntryRecord) => r.effectiveAt.toISOString().slice(0, 10),
              },
            ]}
          />
        )}
        {canPrice ? <PriceForm products={products} onSave={onSavePrice} /> : (
          <p className="text-muted-foreground mt-sm text-xs">{CATALOG_TEXT.priceDenied}</p>
        )}
      </Section>
    </>
  );
}


function ProductForm({
  onSave,
}: {
  readonly onSave: CatalogPanelsProps["onSaveProduct"];
}) {
  const { CATALOG_ERROR, CATALOG_TEXT } = useMessages();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="mt-md flex flex-wrap items-end gap-md">
      <Field>
        <FieldLabel>{CATALOG_TEXT.colCode}</FieldLabel>
        <Input value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{CATALOG_TEXT.colName}</FieldLabel>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{CATALOG_TEXT.colCategory}</FieldLabel>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} />
      </Field>
      <Field>
        {/* Required, and the rule layer refuses without it. See the section
            description for why a unit-less product produces a meaningless
            number rather than a merely untidy row. */}
        <FieldLabel>{CATALOG_TEXT.colUnit}</FieldLabel>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
      </Field>
      <Button
        disabled={pending || !code.trim() || !name.trim() || !unit.trim()}
        onClick={() =>
          start(() => {
            void onSave({
              productCode: code,
              name,
              category: category.trim() || null,
              unit,
            }).then((r) => {
              setErr(r.ok ? null : (CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied));
              setDone(r.ok);
              if (r.ok) {
                setCode("");
                setName("");
                setCategory("");
                setUnit("");
              }
            });
          })
        }
      >
        {CATALOG_TEXT.saveProduct}
      </Button>
      <span className="text-muted-foreground text-xs">{CATALOG_TEXT.codeHint}</span>
      {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
      {done && !err ? <StatusBadge tone="success">{CATALOG_TEXT.productSaved}</StatusBadge> : null}
    </div>
  );
}

function SolutionForm({
  products,
  onSave,
}: {
  readonly products: readonly ProductRecord[];
  readonly onSave: CatalogPanelsProps["onSaveSolution"];
}) {
  const { CATALOG_ERROR, CATALOG_TEXT } = useMessages();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  // One row per product line. The rule refuses an empty list ("a solution with
  // no products is a name, not a bundle"), so the form starts with one row
  // rather than a bare add-button - the shape of the data teaches the shape of
  // the rule.
  const [items, setItems] = useState<readonly { productId: string; quantity: string }[]>([
    { productId: "", quantity: "1" },
  ]);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const active = products.filter((pr) => pr.status === "active");
  function patch(i: number, next: Partial<{ productId: string; quantity: string }>) {
    setItems(items.map((it, j) => (j === i ? { ...it, ...next } : it)));
  }
  const parsed = items
    .filter((it) => it.productId !== "")
    .map((it) => ({ productId: it.productId, quantity: Number(it.quantity) }));
  const ready =
    code.trim() !== "" &&
    name.trim() !== "" &&
    parsed.length > 0 &&
    parsed.every((it) => Number.isFinite(it.quantity) && it.quantity > 0);

  return (
    <div className="mt-md flex flex-col gap-sm">
      <div className="flex flex-wrap items-end gap-md">
        <Field>
          <FieldLabel>{CATALOG_TEXT.colCode}</FieldLabel>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{CATALOG_TEXT.colName}</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{CATALOG_TEXT.solutionSummary}</FieldLabel>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </div>
      {items.map((it, i) => (
        /* Index as key is safe here: rows are only appended or removed from a
           local draft, never reordered, and each row's state lives in `items`
           itself rather than in the row component. */
        <div key={i} className="flex flex-wrap items-end gap-md">
          <Field>
            <FieldLabel>{CATALOG_TEXT.solutionProduct}</FieldLabel>
            <NativeSelect value={it.productId} onChange={(e) => patch(i, { productId: e.target.value })}>
              <option value="">{CATALOG_TEXT.pickProduct}</option>
              {active.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{CATALOG_TEXT.solutionQuantity}</FieldLabel>
            <Input
              type="number"
              min={1}
              value={it.quantity}
              onChange={(e) => patch(i, { quantity: e.target.value })}
            />
          </Field>
          {items.length > 1 ? (
            <Button variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              {CATALOG_TEXT.removeItem}
            </Button>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-md">
        <Button
          variant="secondary"
          onClick={() => setItems([...items, { productId: "", quantity: "1" }])}
        >
          {CATALOG_TEXT.addItem}
        </Button>
        <Button
          disabled={pending || !ready}
          onClick={() =>
            start(() => {
              void onSave({
                solutionCode: code.trim(),
                name: name.trim(),
                summary: summary.trim() === "" ? null : summary.trim(),
                items: parsed,
              }).then((r) => {
                setErr(r.ok ? null : (CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied));
                setDone(r.ok);
                if (r.ok) {
                  setCode("");
                  setName("");
                  setSummary("");
                  setItems([{ productId: "", quantity: "1" }]);
                }
              });
            })
          }
        >
          {CATALOG_TEXT.saveSolution}
        </Button>
        {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
        {done && !err ? <StatusBadge tone="success">{CATALOG_TEXT.solutionSaved}</StatusBadge> : null}
      </div>
    </div>
  );
}

function PriceForm({
  products,
  onSave,
}: {
  readonly products: readonly ProductRecord[];
  readonly onSave: CatalogPanelsProps["onSavePrice"];
}) {
  const { CATALOG_ERROR, CATALOG_TEXT } = useMessages();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [list, setList] = useState("");
  const [floor, setFloor] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const l = Number(list);
  const f = Number(floor);
  const ready =
    productId !== "" &&
    list.trim() !== "" &&
    floor.trim() !== "" &&
    Number.isFinite(l) &&
    Number.isFinite(f);

  return (
    <div className="mt-md flex flex-wrap items-end gap-md">
      <Field>
        <FieldLabel>{CATALOG_TEXT.colName}</FieldLabel>
        <NativeSelect value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel>{CATALOG_TEXT.colList}</FieldLabel>
        <Input type="number" min="0" value={list} onChange={(e) => setList(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{CATALOG_TEXT.colFloor}</FieldLabel>
        <Input type="number" min="0" value={floor} onChange={(e) => setFloor(e.target.value)} />
      </Field>
      <Button
        disabled={!ready || pending}
        onClick={() =>
          start(() => {
            void onSave({ productId, currency: "CNY", listPrice: l, floorPrice: f }).then((r) => {
              setErr(r.ok ? null : (CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied));
              setDone(r.ok);
              if (r.ok) {
                setList("");
                setFloor("");
              }
            });
          })
        }
      >
        {CATALOG_TEXT.setPrice}
      </Button>
      {/* Said BEFORE they submit, not after it succeeds. Equal-to-list is legal
          and meaningful, and a person typing it should know the product is
          telling them it read the choice correctly. */}
      {ready && l === f ? (
        <StatusBadge tone="warning">{CATALOG_TEXT.floorEqualsList}</StatusBadge>
      ) : null}
      {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
      {done && !err ? <StatusBadge tone="success">{CATALOG_TEXT.priceSaved}</StatusBadge> : null}
    </div>
  );
}
