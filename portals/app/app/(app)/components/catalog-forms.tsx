"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AssistPanel, FormPage, type AssistSuggestion } from "./form-page";
import { suggestFloor, unpricedProducts } from "../../domains/catalog/lib/suggest";
import { knownValues, suggestNextCode } from "../../domains/shared/suggest";
import type { PriceEntryRecord, ProductRecord } from "../../domains/catalog/store";

// The catalogue's three CREATION PAGES - owner ruling 2026-09-05.
//
// These forms lived inline under the list tables (catalog-panels.tsx) and are
// now pages of their own: a page can afford labelled rows, room to breathe and
// an assistant beside the work, where the inline version was a cramped strip
// under a table. The lists keep a single entry button; the tables stay pure
// display.
//
// ON SUCCESS, BACK TO THE LIST. A creation page is an errand, not a place: the
// person came from the list and the finished row is best seen in it. Staying
// here after saving would ask them to find their own way back.

type Saved = { ok: boolean; error?: string };

function useSubmit(onDone: string) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return {
    err,
    pending,
    run(fn: () => Promise<Saved>, errorOf: (code: string) => string) {
      start(() => {
        void fn().then((r) => {
          if (r.ok) {
            router.push(onDone);
            router.refresh();
          } else {
            setErr(errorOf(r.error ?? "denied"));
          }
        });
      });
    },
  };
}

// --- 新建产品 ---------------------------------------------------------------

export function NewProductForm({
  products,
  onSave,
}: {
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: {
    productCode: string;
    name: string;
    category: string | null;
    unit: string;
  }) => Promise<Saved>;
}) {
  const { CATALOG_TEXT, CATALOG_ERROR, ASSIST_TEXT } = useMessages();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const submit = useSubmit("/catalog");

  // Everything the assistant says here is read off the rows the page already
  // loaded - see domains/catalog/lib/suggest.ts for what each one refuses to
  // guess about.
  const nextCode = useMemo(
    () => suggestNextCode(products.map((p) => p.productCode)),
    [products],
  );
  const categories = useMemo(() => knownValues(products.map((p) => p.category)), [products]);
  const units = useMemo(() => knownValues(products.map((p) => p.unit)), [products]);

  const suggestions: AssistSuggestion[] = [];
  if (nextCode && code.trim() === "") {
    suggestions.push({
      id: "code",
      label: ASSIST_TEXT.codeNext(nextCode),
      reason: ASSIST_TEXT.codeNextWhy,
      apply: () => setCode(nextCode),
    });
  }
  for (const c of categories.slice(0, 3)) {
    if (category.trim() === "" || c === category) continue;
    suggestions.push({
      id: `cat-${c}`,
      label: ASSIST_TEXT.categoryKnown(c),
      reason: ASSIST_TEXT.categoryKnownWhy,
      apply: () => setCategory(c),
    });
  }
  if (unit.trim() === "" && units.length > 0) {
    suggestions.push({
      id: "unit",
      label: ASSIST_TEXT.unitKnown(units[0]!),
      reason: ASSIST_TEXT.unitKnownWhy,
      apply: () => setUnit(units[0]!),
    });
  }

  const ready = code.trim() !== "" && name.trim() !== "" && unit.trim() !== "";
  return (
    <FormPage
      form={
        <Section icon="stack" title={CATALOG_TEXT.newProduct} description={CATALOG_TEXT.codeHint}>
          <div className="flex max-w-xl flex-col gap-md">
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
              {/* Required, and the rule layer refuses without it: a unit-less
                  product makes every quantity on every quote a meaningless
                  number. */}
              <FieldLabel>{CATALOG_TEXT.colUnit}</FieldLabel>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </Field>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave({
                        productCode: code.trim(),
                        name: name.trim(),
                        category: category.trim() || null,
                        unit: unit.trim(),
                      }),
                    (c) => CATALOG_ERROR[c] ?? CATALOG_ERROR.denied,
                  )
                }
              >
                {CATALOG_TEXT.saveProduct}
              </Button>
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
          </div>
        </Section>
      }
      assist={<AssistPanel suggestions={suggestions} />}
    />
  );
}

// --- 新建方案 ---------------------------------------------------------------

export function NewSolutionForm({
  products,
  onSave,
}: {
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: {
    solutionCode: string;
    name: string;
    summary: string | null;
    items: readonly { productId: string; quantity: number }[];
  }) => Promise<Saved>;
}) {
  const { CATALOG_TEXT, CATALOG_ERROR, ASSIST_TEXT } = useMessages();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  // Starts with one row: the rule refuses an empty list ("a solution with no
  // products is a name, not a bundle"), and the blank row teaches that.
  const [items, setItems] = useState<readonly { productId: string; quantity: string }[]>([
    { productId: "", quantity: "1" },
  ]);
  const submit = useSubmit("/solution");

  const active = products.filter((p) => p.status === "active");
  const chosen = new Set(items.map((i) => i.productId).filter(Boolean));

  const suggestions: AssistSuggestion[] = [];
  // The actives NOT yet in the bundle, most recently added first - the likely
  // next line, one click instead of a scroll through the select.
  for (const p of active.filter((p) => !chosen.has(p.id)).slice(0, 3)) {
    suggestions.push({
      id: `add-${p.id}`,
      label: ASSIST_TEXT.bundleAdd(p.name),
      reason: ASSIST_TEXT.bundleAddWhy,
      apply: () =>
        setItems((prev) => {
          const blank = prev.findIndex((i) => i.productId === "");
          if (blank >= 0) {
            return prev.map((it, j) => (j === blank ? { ...it, productId: p.id } : it));
          }
          return [...prev, { productId: p.id, quantity: "1" }];
        }),
    });
  }

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
    <FormPage
      form={
        <Section icon="puzzle" title={CATALOG_TEXT.newSolution} description={CATALOG_TEXT.emptyBundle}>
          <div className="flex max-w-xl flex-col gap-md">
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
            {items.map((it, i) => (
              /* Index as key is safe: rows are appended or removed from a local
                 draft, never reordered, and each row's state lives in `items`. */
              <div key={i} className="flex flex-wrap items-end gap-md">
                <Field>
                  <FieldLabel>{CATALOG_TEXT.solutionProduct}</FieldLabel>
                  <NativeSelect
                    value={it.productId}
                    onChange={(e) => patch(i, { productId: e.target.value })}
                  >
                    <option value="">{CATALOG_TEXT.pickProduct}</option>
                    {active.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
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
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave({
                        solutionCode: code.trim(),
                        name: name.trim(),
                        summary: summary.trim() === "" ? null : summary.trim(),
                        items: parsed,
                      }),
                    (c) => CATALOG_ERROR[c] ?? CATALOG_ERROR.denied,
                  )
                }
              >
                {CATALOG_TEXT.saveSolution}
              </Button>
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
          </div>
        </Section>
      }
      assist={<AssistPanel suggestions={suggestions} />}
    />
  );
}

// --- 设定价格 ---------------------------------------------------------------

export function NewPriceForm({
  products,
  prices,
  onSave,
}: {
  readonly products: readonly ProductRecord[];
  readonly prices: readonly PriceEntryRecord[];
  readonly onSave: (input: {
    productId: string;
    currency: string;
    listPrice: number;
    floorPrice: number;
  }) => Promise<Saved>;
}) {
  const { CATALOG_TEXT, CATALOG_ERROR, ASSIST_TEXT } = useMessages();
  const unpriced = useMemo(() => unpricedProducts(products, prices), [products, prices]);
  const [productId, setProductId] = useState("");
  const [list, setList] = useState("");
  const [floor, setFloor] = useState("");
  const submit = useSubmit("/pricebook");

  const l = Number(list);
  const f = Number(floor);

  const suggestions: AssistSuggestion[] = [];
  // The unpriced actives lead: a product that cannot be quoted is the gap this
  // page exists to close, and naming it beats scrolling a select.
  if (productId === "" && unpriced.length > 0) {
    for (const p of unpriced.slice(0, 3)) {
      suggestions.push({
        id: `unpriced-${p.id}`,
        label: ASSIST_TEXT.unpriced(p.name),
        reason: ASSIST_TEXT.unpricedWhy,
        apply: () => setProductId(p.id),
      });
    }
  }
  const floorHint = suggestFloor(l, prices);
  if (floorHint && floor.trim() === "") {
    suggestions.push({
      id: "floor",
      label: ASSIST_TEXT.floorRatio(floorHint.floor.toLocaleString()),
      // The reason names the evidence: the workspace's own median ratio. The
      // floor stays a commercial decision (ADR-019) - this fills a field, the
      // person still signs it.
      reason: ASSIST_TEXT.floorRatioWhy(floorHint.ratioPct),
      apply: () => setFloor(String(floorHint.floor)),
    });
  }

  const ready =
    productId !== "" && list.trim() !== "" && floor.trim() !== "" && Number.isFinite(l) && Number.isFinite(f);

  return (
    <FormPage
      form={
        <Section icon="currency-cny" title={CATALOG_TEXT.newPrice} description={CATALOG_TEXT.pricebookWhy}>
          <div className="flex max-w-xl flex-col gap-md">
            <Field>
              <FieldLabel>{CATALOG_TEXT.colName}</FieldLabel>
              <NativeSelect value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">{CATALOG_TEXT.pickProduct}</option>
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
            <div className="flex flex-wrap items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () => onSave({ productId, currency: "CNY", listPrice: l, floorPrice: f }),
                    (c) => CATALOG_ERROR[c] ?? CATALOG_ERROR.denied,
                  )
                }
              >
                {CATALOG_TEXT.setPrice}
              </Button>
              {/* Said BEFORE submitting: equal-to-list is legal and meaningful
                  ("not discountable"), and the person typing it should see the
                  product read the choice correctly. */}
              {ready && l === f ? (
                <StatusBadge tone="warning">{CATALOG_TEXT.floorEqualsList}</StatusBadge>
              ) : null}
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
          </div>
        </Section>
      }
      assist={<AssistPanel suggestions={suggestions} />}
    />
  );
}
