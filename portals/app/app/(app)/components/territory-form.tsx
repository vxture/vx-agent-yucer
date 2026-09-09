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
  onSave,
}: {
  readonly rows: readonly {
    readonly id: string;
    readonly territoryCode: string;
    readonly name: string;
    readonly regions: readonly string[];
    readonly status: string;
  }[];
  readonly accountRegions: readonly (string | null)[];
  /* 大区 THIS WORKSPACE HAS, in its own order (incr/0036). The field used to be
     free text with "如：华东, 华南" under it, which is how the second
     vocabulary kept coming back: routing matches these strings against
     `account.region`, so a typed 华东 produced a territory that covered
     nothing and routed nothing, silently. You can only tick what exists. */
  readonly divisions: readonly string[];
  readonly onSave: (input: {
    territoryCode: string;
    name: string;
    parentId: string | null;
    ownerSub: string | null;
    status: string;
    regions: readonly string[];
  }) => Promise<Saved>;
}) {
  const { PLANNING_TEXT, TERRITORY_ERROR, ASSIST_TEXT } = useMessages();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [ownerSub, setOwnerSub] = useState("");
  const [status, setStatus] = useState("active");
  const [regions, setRegions] = useState<readonly string[]>([]);
  const submit = useFormSubmit("/planning");

  // THE CODE IS THE IDENTITY - typing an existing code edits that territory
  // (upsert-by-anchor, ADR-017's shape). The page keeps that semantic and adds
  // the load: picking a code fills the form with what that territory says now.
  function pick(id: string) {
    const t = rows.find((r) => r.id === id);
    if (!t) return;
    setCode(t.territoryCode);
    setName(t.name);
    setRegions(t.regions);
    setStatus(t.status);
  }

  const gaps = useMemo(() => uncoveredRegions(accountRegions, rows), [accountRegions, rows]);
  const inField = new Set(regions);

  /* WHAT THE WORKSPACE CARVES, PLUS WHATEVER THIS TERRITORY ALREADY SAYS.
     A division can be renamed or dropped after a territory named it, and
     hiding the orphan would let a save quietly delete coverage the reader
     never saw. It stays tickable, and stays visibly not one of the current
     carve's names. */
  const covers = useMemo(() => {
    const extra = regions.filter((r) => !divisions.includes(r));
    return [
      ...divisions.map((name) => ({ name, known: true })),
      ...extra.map((name) => ({ name, known: false })),
    ];
  }, [divisions, regions]);

  const toggleRegion = (name: string) =>
    setRegions((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));

  const suggestions: AssistSuggestion[] = gaps
    .filter((g) => !inField.has(g.region))
    .slice(0, 3)
    .map((g) => ({
      id: `region-${g.region}`,
      label: ASSIST_TEXT.uncoveredRegion(g.region, g.accounts),
      // The reason is the routing rule itself: leads route territory-first, so
      // ground no territory covers is ground where every lead is unroutable.
      reason: ASSIST_TEXT.uncoveredRegionWhy,
      apply: () => setRegions((r) => (r.includes(g.region) ? r : [...r, g.region])),
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
              {covers.length === 0 ? (
                <p className="text-muted-foreground text-body-sm">
                  {PLANNING_TEXT.territoryRegionsNone}
                </p>
              ) : (
                <div className="gap-2xs md:grid-cols-3 grid grid-cols-2">
                  {covers.map((c) => (
                    <label className="gap-2xs flex items-center" key={c.name}>
                      <input
                        type="checkbox"
                        checked={inField.has(c.name)}
                        onChange={() => toggleRegion(c.name)}
                      />
                      <span className="text-body-sm">{c.name}</span>
                      {c.known ? null : (
                        <span className="text-warning text-body-sm">
                          {PLANNING_TEXT.territoryRegionGone}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
              <span className="text-muted-foreground text-body-sm">
                {PLANNING_TEXT.territoryRegionsHint}
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
                        regions,
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
