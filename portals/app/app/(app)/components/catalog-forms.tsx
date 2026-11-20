"use client";

import { StrategyInfoCard as Card, StrategyInfoContent as CardContent } from "./strategy-info-card";

import { Section } from "./help-section";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  StatusBadge,
} from "@vxture/design-ui";
import { ProductPriceValues } from "./product-price-values";
import { solutionPricingFacts } from "../lib/solution-prices";
import type { PriceValues } from "../lib/product-prices";
import { useMessages } from "../lib/i18n/provider";
import { FormFields, FormPage, useFormSubmit } from "./form-page";
import { FormDraftAssistant } from "./form-draft-assistant";
import type { CatalogAssistInput, CatalogAssistResult } from "../../domains/catalog/catalog-assist-service";
import type { CatalogDraftField } from "../../domains/catalog/lib/catalog-draft";
import type {
  ProductRecord,
  ProductStatusRecord,
  ProductUnitRecord,
  ProductTypeRecord,
  SolutionItemRecord,
  SolutionRecord,
} from "../../domains/catalog/store";

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

function useCatalogManualEdits() {
  const applied = useRef(false), manual = useRef(new Set<CatalogDraftField>());
  return { manual, applied: () => { applied.current = true; }, touch: (field: CatalogDraftField) => {
    if (applied.current) manual.current.add(field);
  } };
}
type CatalogAssistProps = {
  readonly canAssist: boolean;
  readonly onAssist: (input: CatalogAssistInput) => Promise<CatalogAssistResult>;
};

// --- 新建产品 ---------------------------------------------------------------

export function NewProductForm({
  generatedCode,
  types,
  statuses,
  units,
  initial,
  onSave,
  canAssist, onAssist,
}: CatalogAssistProps & {
  readonly generatedCode: string;
  /** The workspace's type vocabulary - the type field selects from it. */
  readonly types: readonly ProductTypeRecord[];
  /** The status vocabulary - the birth choice selects from it. */
  readonly statuses: readonly ProductStatusRecord[];
  /** 计价单位 (incr/0037). A picker since the unit stopped being free text:
   *  套 typed here and 台 typed there were two units nobody could group by. */
  readonly units: readonly ProductUnitRecord[];
  /** Status transitions remain in the list; either form can set the number. */
  readonly initial?: ProductRecord;
  readonly onSave: (input: {
    novelty?:"existing"|"new"|null;
    editId?: string;
    productCode: string;
    name: string;
    typeId: string | null;
    unitId: string;
    statusId?: string;
  }) => Promise<Saved>;
}) {
  const { STRATEGY_RESULT_TEXT:R, CATALOG_TEXT, CATALOG_ERROR } = useMessages();
  const editing = initial !== undefined;
  const [code, setCode] = useState(initial?.productCode ?? generatedCode);
  const [novelty,setNovelty]=useState<"existing"|"new"|null>(initial?.novelty??null);
  const [name, setName] = useState(initial?.name ?? "");
  // TWO FIELDS, ONE TYPE (incr/0100; owner, 2026-09-29: 两个字段，连接显示).
  // 一级类 first, then an optional 二级类 under it; the product carries the
  // more specific one - either level is allowed.
  const parentOf = (id: string | null | undefined) => types.find((t) => t.id === id)?.parentId ?? null;
  const [level1Id, setLevel1Id] = useState(() => parentOf(initial?.typeId) ?? initial?.typeId ?? "");
  const [level2Id, setLevel2Id] = useState(() => (parentOf(initial?.typeId) ? (initial?.typeId ?? "") : ""));
  const typeId = level2Id || level1Id;
  const usable = (t: ProductTypeRecord) => t.status === "active" || t.id === typeId || t.id === level1Id;
  const level1Options = types.filter((t) => t.parentId === null && usable(t)).sort((a, b) => a.typeNo.localeCompare(b.typeNo));
  const level2Options = types.filter((t) => t.parentId === level1Id && level1Id !== "" && usable(t)).sort((a, b) => a.typeNo.localeCompare(b.typeNo));
  const [unitId, setUnitId] = useState(
    /* The first row of the vocabulary on a new product - a unit is required
       and every workspace has one, so an empty select would be a field the
       reader has to open to say the obvious. An edit keeps what the row has. */
    () => initial?.unitId ?? units[0]?.id ?? "",
  );
  // The birth choice: any status except the shelf - born-retired is a record
  // error the service refuses. An edit never sends status at all; transitions
  // belong to the roster's row menu.
  const birthable = statuses.filter((r) => r.statusCode !== "retired");
  const [statusId, setStatusId] = useState(
    () => statuses.find((r) => r.statusCode === "active")?.id ?? "",
  );
  const submit = useFormSubmit("/catalog");
  const [assisting, setAssisting] = useState(false);
  const edits = useCatalogManualEdits();
  const busy = submit.pending || assisting;

  const ready = (!editing || code.trim() !== "") && name.trim() !== "" && unitId !== "";
  const savedCode = !editing && code.trim() === generatedCode ? "" : code.trim();
  const currentStatus = statuses.find(row => row.id === initial?.statusId);
  return (
    <FormPage
      form={
        <div className="flex flex-col gap-xl pb-[calc(3rem+env(safe-area-inset-bottom))]" onChangeCapture={e => {
          const input = e.target;
          if (!(input instanceof HTMLElement)) return;
          const field = input.id === "product-name" ? "name" : input.id === "product-unit" ? "unitId"
            : input.id === "product-novelty" ? "novelty" : input.tagName === "SELECT" && !input.id ? "typeId" : null;
          if (field) edits.touch(field);
        }}>
          <FormDraftAssistant values={{ name, novelty, typeId, unitId }} editId={initial?.id}
            enabled={canAssist && !submit.pending} example={CATALOG_TEXT.productAssistExample} task={CATALOG_TEXT.productAssistTask} welcome={CATALOG_TEXT.catalogAssistWelcome}
            onAssist={input => onAssist({ ...input, manualFields: [...edits.manual.current] })}
            errorOf={code => CATALOG_ERROR[code] ?? R.assistError}
            describeApplied={patch => CATALOG_TEXT.catalogAssistApplied(Object.keys(patch).length)}
            onBusy={setAssisting} onApply={patch => {
              if (patch.name !== undefined) setName(patch.name);
              if (patch.novelty !== undefined) setNovelty(patch.novelty);
              if (patch.unitId !== undefined) setUnitId(patch.unitId);
              if (patch.typeId !== undefined) { setLevel1Id(parentOf(patch.typeId) ?? patch.typeId); setLevel2Id(parentOf(patch.typeId) ? patch.typeId : ""); }
              edits.applied();
            }}/>

          <Card data-product-basic-card><CardContent>
            <FormFields>
              <Field>
                <FieldLabel htmlFor="product-name">{CATALOG_TEXT.colName} <span aria-hidden="true">*</span></FieldLabel>
                <Input id="product-name" aria-required="true" value={name} placeholder={CATALOG_TEXT.productNameExample} disabled={busy} onChange={e => setName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="product-code">{CATALOG_TEXT.productNumber}{editing && <span aria-hidden="true"> *</span>}</FieldLabel>
                <Input id="product-code" value={code} placeholder={generatedCode} title={CATALOG_TEXT.productNumberHint} maxLength={64} aria-required={editing} disabled={busy} onChange={e => setCode(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="product-unit">{CATALOG_TEXT.colUnit} <span aria-hidden="true">*</span></FieldLabel>
                <NativeSelect id="product-unit" aria-required="true" value={unitId} disabled={busy} onChange={e => setUnitId(e.target.value)}>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </NativeSelect>
              </Field>
            <Field className="@xl:col-span-2">
              <FieldLabel>{CATALOG_TEXT.colType}</FieldLabel>
              {/* A select over the vocabulary, valued by the type's uuid -
                  internal joins are uuid, and the id never renders. New kinds
                  are minted on the config page, where minting is a decision. */}
              <div className="flex items-center gap-sm">
                <NativeSelect
                  value={level1Id}
                  aria-label={CATALOG_TEXT.typeLevel1}
                  disabled={busy}
                  onChange={(e) => {
                    setLevel1Id(e.target.value);
                    setLevel2Id("");
                  }}
                >
                  <option value="">{CATALOG_TEXT.noCategory}</option>
                  {level1Options.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  value={level2Id}
                  aria-label={CATALOG_TEXT.typeLevel2}
                  disabled={busy || level2Options.length === 0}
                  onChange={(e) => setLevel2Id(e.target.value)}
                >
                  <option value="">{CATALOG_TEXT.typeLevel2None}</option>
                  {level2Options.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="product-status">{CATALOG_TEXT.newStatus}</FieldLabel>
              {editing ? <Input id="product-status" readOnly value={currentStatus?.name ?? "-"} /> : (
                <NativeSelect id="product-status" value={statusId} disabled={busy} onChange={e => setStatusId(e.target.value)}>
                  {birthable.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
                </NativeSelect>
              )}
            </Field>
            <Field><FieldLabel htmlFor="product-novelty">{R.catalogNovelty}</FieldLabel><NativeSelect id="product-novelty" value={novelty??""} disabled={busy} onChange={e=>setNovelty(e.target.value as "existing"|"new"||null)}><option value="">{R.unmarked}</option><option value="existing">{R.existing}</option><option value="new">{R.new}</option></NativeSelect></Field>
</FormFields>
          </CardContent></Card>
            <div className="flex flex-wrap items-center justify-end gap-sm">
              <Button asChild size="md" variant="secondary"><Link href="/catalog">{CATALOG_TEXT.cancelProductEdit}</Link></Button>
              <Button size="xl"
                disabled={busy || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave({
                        novelty,
                        editId: initial?.id,
                        productCode: savedCode,
                        name: name.trim(),
                        typeId: typeId || null,
                        unitId,
                        // An edit never sends status: the row menu owns
                        // transitions and the service keeps what the row has.
                        ...(editing ? {} : { statusId }),
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
      }
    />
  );
}

// --- 新建方案 ---------------------------------------------------------------

export function NewSolutionForm({
  products,
  generatedCode,
  statuses,
  currentPrices,
  currency,
  initial,
  onSave,
  canAssist, onAssist,
}: CatalogAssistProps & {
  readonly generatedCode: string;
  readonly products: readonly ProductRecord[];
  readonly statuses: readonly ProductStatusRecord[];
  readonly currentPrices: Readonly<Record<string, PriceValues>>;
  readonly currency: string;
  /** Present = EDIT mode (?code= on the page): the anchor locks and the
   * composition arrives filled in. */
  readonly initial?: {
    readonly solution: SolutionRecord;
    readonly items: readonly SolutionItemRecord[];
  };
  readonly onSave: (input: {
    novelty?:"existing"|"new"|null;
    editId?: string;
    name: string;
    summary: string | null;
    scenario: string | null;
    items: readonly {
      productId: string;
      quantity: number;
      optional: boolean;
      note: string | null;
    }[];
  }) => Promise<Saved>;
}) {
  const { STRATEGY_RESULT_TEXT:R, CATALOG_TEXT, CATALOG_ERROR } = useMessages();
  const code = initial?.solution.solutionCode ?? generatedCode;
  const [novelty,setNovelty]=useState<"existing"|"new"|null>(initial?.solution.novelty??null);
  const [name, setName] = useState(initial?.solution.name ?? "");
  const [summary, setSummary] = useState(initial?.solution.summary ?? "");
  const [scenario, setScenario] = useState(initial?.solution.scenario ?? "");
  // A row carries the product and the quantity (the COMBINATION) and whether
  // it is standard, plus what is tailored about it (the CUSTOMISATION). Both
  // halves are edited in the same place because a line is only understandable
  // as both at once.
  type Row = { productId: string; quantity: string; optional: boolean; note: string };
  const [items, setItems] = useState<readonly Row[]>(
    initial
      ? initial.items.map((i) => ({
          productId: i.productId,
          quantity: String(i.quantity),
          optional: i.optional,
          note: i.note ?? "",
        }))
      : // Starts with one row: the rule refuses an empty list ("a solution
        // with no products is a name, not a bundle"), and the blank row
        // teaches that.
        [{ productId: "", quantity: "1", optional: false, note: "" }],
  );
  const submit = useFormSubmit("/solution");
  const [assisting, setAssisting] = useState(false);
  const edits = useCatalogManualEdits();
  const busy = submit.pending || assisting;

  const onSaleId = statuses.find((r) => r.statusCode === "active")?.id ?? null;
  const active = products.filter((p) => p.statusId === onSaleId);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  function patch(i: number, next: Partial<Row>) {
    edits.touch("items");
    setItems(items.map((it, j) => (j === i ? { ...it, ...next } : it)));
  }
  const parsed = items
    .filter((it) => it.productId !== "")
    .map((it) => ({
      productId: it.productId,
      quantity: Number(it.quantity),
      optional: it.optional,
      note: it.note.trim() === "" ? null : it.note.trim(),
    }));
  const totals = solutionPricingFacts(
    parsed.filter((it) => Number.isFinite(it.quantity) && it.quantity > 0),
    new Map(), [], new Map(Object.entries(currentPrices)),
  );
  const ready =
    name.trim() !== "" &&
    parsed.length > 0 &&
    parsed.every((it) => Number.isFinite(it.quantity) && it.quantity > 0) &&
    // Mirrors planSolution's rule so the button does not offer a refusal.
    parsed.some((it) => !it.optional);

  return (
    <FormPage
      form={
        /* No heading of its own: the page's header already says 新建方案 /
           修改方案 and what a solution is (owner 2026-09-28: 标题重复). */
        <Section>
          <FormDraftAssistant values={{ name, novelty, summary, scenario, items: parsed.map(item => ({ ...item, note: item.note ?? "" })) }} editId={initial?.solution.id}
            enabled={canAssist && !submit.pending} example={CATALOG_TEXT.solutionAssistExample} task={CATALOG_TEXT.solutionAssistTask} welcome={CATALOG_TEXT.catalogAssistWelcome}
            onAssist={input => onAssist({ ...input, manualFields: [...edits.manual.current] })}
            errorOf={code => CATALOG_ERROR[code] ?? R.assistError}
            describeApplied={patch => CATALOG_TEXT.catalogAssistApplied(Object.keys(patch).length)}
            onBusy={setAssisting} onApply={patch => {
              if (patch.name !== undefined) setName(patch.name);
              if (patch.novelty !== undefined) setNovelty(patch.novelty);
              if (patch.summary !== undefined) setSummary(patch.summary);
              if (patch.scenario !== undefined) setScenario(patch.scenario);
              if (patch.items !== undefined) setItems(patch.items.map(item => ({ ...item, quantity: String(item.quantity) })));
              edits.applied();
            }}/>
          <fieldset onChangeCapture={e => {
            const input = e.target;
          if (!(input instanceof HTMLElement)) return;
            const field = input.id === "sol-name" ? "name" : input.id === "sol-summary" ? "summary" : input.id === "sol-scenario" ? "scenario"
              : input.id === "solution-novelty" ? "novelty" : input.id.startsWith("sol-") && input.id !== "sol-code" ? "items" : null;
            if (field) edits.touch(field);
          }} disabled={busy} className="min-w-0 pb-[calc(3rem+env(safe-area-inset-bottom))]">
          <FormFields>
            <Field>
              <FieldLabel htmlFor="sol-code">{CATALOG_TEXT.colCode}</FieldLabel>
              <Input
                id="sol-code"
                value={code}
                readOnly
              />

            </Field>
            <Field>
              <FieldLabel htmlFor="sol-name">{CATALOG_TEXT.colSolutionName}</FieldLabel>
              <Input id="sol-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="sol-summary">{CATALOG_TEXT.solutionSummary}</FieldLabel>
              <Input
                id="sol-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
              <FieldDescription>{CATALOG_TEXT.summaryHint}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="sol-scenario">{CATALOG_TEXT.colScenario}</FieldLabel>
              <Input
                id="sol-scenario"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              />
              <FieldDescription>{CATALOG_TEXT.scenarioHint}</FieldDescription>
            </Field>
          <Field><FieldLabel htmlFor="solution-novelty">{R.catalogNovelty}</FieldLabel><NativeSelect id="solution-novelty" value={novelty??""} disabled={busy} onChange={e=>setNovelty(e.target.value as "existing"|"new"||null)}><option value="">{R.unmarked}</option><option value="existing">{R.existing}</option><option value="new">{R.new}</option></NativeSelect></Field>
</FormFields>

          {/* THE COMBINATION, and the customisation of each line beside it. */}
          <div className="mt-lg flex flex-col gap-md">
            {items.map((it, i) => (
              /* Index as key is safe: rows are appended or removed from a
                 local draft, never reordered, and each row's state lives in
                 `items`. */
              <div key={i} className="border-border flex flex-col gap-sm rounded-md border p-md">
                <div className="flex flex-wrap items-end gap-md">
                  <Field className="min-w-0 basis-48 flex-1">
                    <FieldLabel htmlFor={`sol-product-${i}`}>{CATALOG_TEXT.solutionProduct}</FieldLabel>
                    <NativeSelect
                      id={`sol-product-${i}`}
                      className="h-control-xl"
                      value={it.productId}
                      onChange={(e) => patch(i, { productId: e.target.value })}
                    >
                      <option value="">{CATALOG_TEXT.pickProduct}</option>
                      {active
                        .concat(
                          // A retired product already in the bundle stays
                          // selectable so an edit does not silently drop it -
                          // the dock's check is what asks you to deal with it.
                          products.filter(
                            (p) => p.id === it.productId && p.statusId !== onSaleId,
                          ),
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {productName.get(p.id) ?? p.name}
                          </option>
                        ))}
                    </NativeSelect>
                  </Field>
                  <Field className="w-28">
                    <FieldLabel htmlFor={`sol-quantity-${i}`}>{CATALOG_TEXT.solutionQuantity}</FieldLabel>
                    <Input
                      id={`sol-quantity-${i}`}
                      className="h-control-xl"
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => patch(i, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field className="w-32">
                    <FieldLabel htmlFor={`sol-optional-${i}`}>{CATALOG_TEXT.colOptional}</FieldLabel>
                    <NativeSelect
                      id={`sol-optional-${i}`}
                      className="h-control-xl"
                      value={it.optional ? "optional" : "standard"}
                      onChange={(e) => patch(i, { optional: e.target.value === "optional" })}
                    >
                      <option value="standard">{CATALOG_TEXT.optionalNo}</option>
                      <option value="optional">{CATALOG_TEXT.optionalYes}</option>
                    </NativeSelect>
                  </Field>
                  {items.length > 1 ? (
                    <Button
                      size="md"
                      variant="ghost"
                      onClick={() => { edits.touch("items"); setItems(items.filter((_, j) => j !== i)); }}
                    >
                      {CATALOG_TEXT.removeItem}
                    </Button>
                  ) : null}
                </div>
                {it.productId ? (
                  <div className="flex flex-col gap-xs max-w-(--vx-container-sm)">
                    <p className="text-body-small text-muted-foreground">{CATALOG_TEXT.solutionUnitPrices} / {currency}</p>
                    <ProductPriceValues price={currentPrices[it.productId]} currency={currency} />
                  </div>
                ) : null}
                <Field>
                  <FieldLabel htmlFor={`sol-note-${i}`}>{CATALOG_TEXT.colItemNote}</FieldLabel>
                  <Input id={`sol-note-${i}`} className="h-control-xl" value={it.note} onChange={(e) => patch(i, { note: e.target.value })} />
                  <FieldDescription>{CATALOG_TEXT.itemNoteHint}</FieldDescription>
                </Field>
              </div>
            ))}

            <Section id="solution-price-preview" title={`${CATALOG_TEXT.solutionPrices} / ${currency}`}
              help={CATALOG_TEXT.solutionPricesHint}
              action={<Button asChild variant="ghost" size="md">
                <a href="/catalog" target="_blank" rel="noopener noreferrer">{CATALOG_TEXT.manageProductPrices}</a>
              </Button>}>
              <div className="max-w-(--vx-container-sm)" aria-live="polite">
                <ProductPriceValues price={totals.prices} missing={totals.missing} currency={currency} />
              </div>
            </Section>
            <div className="flex flex-wrap items-center gap-md">
              <Button
                size="xl"
                variant="secondary"
                onClick={() => {
                  edits.touch("items"); setItems([...items, { productId: "", quantity: "1", optional: false, note: "" }]);
                }}
              >
                {CATALOG_TEXT.addItem}
              </Button>
              <Button
                size="xl"
                disabled={busy || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave({
                        novelty,
                        editId: initial?.solution.id,
                        name: name.trim(),
                        summary: summary.trim() === "" ? null : summary.trim(),
                        scenario: scenario.trim() === "" ? null : scenario.trim(),
                        items: parsed,
                      }),
                    (c) => CATALOG_ERROR[c] ?? CATALOG_ERROR.denied,
                  )
                }
              >
                {CATALOG_TEXT.saveSolution}
              </Button>
              {parsed.length > 0 && !parsed.some((it) => !it.optional) ? (
                <StatusBadge tone="warning">{CATALOG_TEXT.standardCoreHint}</StatusBadge>
              ) : null}
              {submit.err ? <StatusBadge tone="danger">{submit.err}</StatusBadge> : null}
            </div>
          </div>
          </fieldset>
        </Section>
      }
    />
  );
}

// --- 设定价格 ---------------------------------------------------------------
