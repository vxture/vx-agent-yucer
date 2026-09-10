"use client";

import { useMemo, useState } from "react";
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
import {
  AssistPanel,
  FormFields,
  FormFieldWide,
  FormPage,
  useFormSubmit,
  type AssistSuggestion,
} from "./form-page";
import { uncoveredRegions } from "../../domains/planning/lib/suggest";

// 新建/编辑销售区域 - a page since 2026-09-05, and the move FIXES A GAP: the
// inline panel never sent `regions`, so every UI-created territory covered
// nothing and could route no lead. The page carries the field, and the
// assistant leads with the regions that have customers and no coverage.
//
// ONE FORM PER FILE - see plan-form.tsx for why the guard demands it.

type Saved = { ok: boolean; error?: string };

export function TerritoryForm({
  rows,
  accountRegions,
  divisions,
  units,
  onSave,
}: {
  readonly rows: readonly {
    readonly id: string;
    readonly territoryCode: string;
    readonly name: string;
    readonly parentId: string | null;
    readonly ownerSub: string | null;
    readonly regions: readonly string[];
    readonly divisionIds: readonly string[];
    readonly unitIds: readonly string[];
    readonly status: string;
  }[];
  readonly accountRegions: readonly (string | null)[];
  /* 大区 THIS WORKSPACE HAS, in its own order (incr/0036), BY ID since 0052.
     The field used to be free text with "如：华东, 华南" under it, which is
     how the second vocabulary kept coming back: routing matches names
     against `account.region`, so a typed 华东 produced a territory that
     covered nothing and routed nothing, silently. You can only tick what
     exists - and since the tick is an id, renaming a 大区 no longer empties
     the territories that named it. */
  readonly divisions: readonly { readonly id: string; readonly name: string }[];
  /* THE UNITS THAT MAY WORK IT (0052): the organisation in tree order,
     indented. Several may share a territory (owner: 一个区域可挂多个单位). */
  readonly units: readonly { readonly id: string; readonly name: string; readonly depth: number }[];
  readonly onSave: (input: {
    territoryCode: string;
    name: string;
    parentId: string | null;
    ownerSub: string | null;
    status: string;
    divisionIds: readonly string[];
    unitIds: readonly string[];
  }) => Promise<Saved>;
}) {
  const { ORG_TEXT, PLANNING_TEXT, TERRITORY_ERROR, ASSIST_TEXT } = useMessages();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [ownerSub, setOwnerSub] = useState("");
  const [status, setStatus] = useState("active");
  const [divisionIds, setDivisionIds] = useState<readonly string[]>([]);
  const [unitIds, setUnitIds] = useState<readonly string[]>([]);
  const submit = useFormSubmit("/planning");

  // THE CODE IS THE IDENTITY - typing an existing code edits that territory
  // (upsert-by-anchor, ADR-017's shape). The page keeps that semantic and adds
  // the load: picking a code fills the form with what that territory says now.
  function pick(id: string) {
    const t = rows.find((r) => r.id === id);
    if (!t) return;
    setCode(t.territoryCode);
    setName(t.name);
    setParentId(t.parentId ?? "");
    setOwnerSub(t.ownerSub ?? "");
    setDivisionIds(t.divisionIds);
    setUnitIds(t.unitIds);
    setStatus(t.status);
  }

  const gaps = useMemo(() => uncoveredRegions(accountRegions, rows), [accountRegions, rows]);
  const inField = new Set(divisionIds);
  const idOfName = useMemo(() => new Map(divisions.map((d) => [d.name, d.id])), [divisions]);
  const chosenNames = new Set(divisionIds.map((id) => divisions.find((d) => d.id === id)?.name));

  const toggleDivision = (id: string) =>
    setDivisionIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  const toggleUnit = (id: string) =>
    setUnitIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  /* The assistant still speaks in the customers' region NAMES - that is what
     the gap is measured on - and a suggestion taken ticks the 大区 of that
     name. A name no current 大区 carries is a gap nothing here can close. */
  const suggestions: AssistSuggestion[] = gaps
    .filter((g) => !chosenNames.has(g.region) && idOfName.has(g.region))
    .slice(0, 3)
    .map((g) => ({
      id: `region-${g.region}`,
      label: ASSIST_TEXT.uncoveredRegion(g.region, g.accounts),
      // The reason is the routing rule itself: leads route territory-first, so
      // ground no territory covers is ground where every lead is unroutable.
      reason: ASSIST_TEXT.uncoveredRegionWhy,
      apply: () => {
        const id = idOfName.get(g.region);
        if (id) setDivisionIds((r) => (r.includes(id) ? r : [...r, id]));
      },
    }));

  const ready = code.trim() !== "" && name.trim() !== "";
  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - repeating it in the Section
        // rendered the same sentence twice within one viewport.
        <Section icon="map-pin">
          <div className="gap-xl flex flex-col">
            <FormFields>
            {/* WHICH TERRITORY - the choice of what the fields describe. */}
            <FormFieldWide>
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryEditing}</FieldLabel>
              <NativeSelect value="" onChange={(e) => e.target.value && pick(e.target.value)}>
                <option value="">{PLANNING_TEXT.territoryNew}</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.territoryCode} - {r.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            </FormFieldWide>
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryCode}</FieldLabel>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryName}</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {/* A GRID OF CHECKBOXES takes the row: it is a list, not a
                control, and half a row would wrap it into a column. */}
            <FormFieldWide>
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryRegions}</FieldLabel>
              {divisions.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">
                  {PLANNING_TEXT.territoryRegionsNone}
                </p>
              ) : (
                <div className="gap-2xs md:grid-cols-3 grid grid-cols-2">
                  {divisions.map((d) => (
                    <label className="gap-2xs flex items-center" key={d.id}>
                      <input
                        type="checkbox"
                        checked={inField.has(d.id)}
                        onChange={() => toggleDivision(d.id)}
                      />
                      <span className="text-body-sm">{d.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <span className="text-muted-foreground text-body-sm">
                {PLANNING_TEXT.territoryRegionsHint}
              </span>
            </Field>
            </FormFieldWide>
            {/* WHO WORKS IT (0052): the organisation's units, tree order,
                indented; several may share one ground. */}
            <FormFieldWide>
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryUnits}</FieldLabel>
              {units.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">
                  {PLANNING_TEXT.territoryUnitsNone}
                </p>
              ) : (
                <div className="gap-2xs md:grid-cols-3 grid grid-cols-2">
                  {units.map((u) => (
                    <label className="gap-2xs flex items-center" key={u.id}>
                      <input
                        type="checkbox"
                        checked={unitIds.includes(u.id)}
                        onChange={() => toggleUnit(u.id)}
                      />
                      <span className="text-body-sm">{ORG_TEXT.optionIndent(u.depth, u.name)}</span>
                    </label>
                  ))}
                </div>
              )}
              <span className="text-muted-foreground text-body-sm">
                {PLANNING_TEXT.territoryUnitsHint}
              </span>
            </Field>
            </FormFieldWide>
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryParent}</FieldLabel>
              <NativeSelect value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">{PLANNING_TEXT.territoryNoParent}</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryOwner}</FieldLabel>
              <Input value={ownerSub} onChange={(e) => setOwnerSub(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryStatus}</FieldLabel>
              <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">{PLANNING_TEXT.territoryActive}</option>
                <option value="retired">{PLANNING_TEXT.territoryRetired}</option>
              </NativeSelect>
            </Field>
            </FormFields>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave({
                        territoryCode: code.trim(),
                        name: name.trim(),
                        parentId: parentId === "" ? null : parentId,
                        ownerSub: ownerSub.trim() === "" ? null : ownerSub.trim(),
                        status,
                        divisionIds,
                        unitIds,
                      }),
                    (c) => TERRITORY_ERROR[c] ?? TERRITORY_ERROR.denied,
                  )
                }
              >
                {PLANNING_TEXT.territorySave}
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
