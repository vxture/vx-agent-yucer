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
  FormPage,
  splitListField,
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
  const [regions, setRegions] = useState("");
  const submit = useFormSubmit("/territory");

  // THE CODE IS THE IDENTITY - typing an existing code edits that territory
  // (upsert-by-anchor, ADR-017's shape). The page keeps that semantic and adds
  // the load: picking a code fills the form with what that territory says now.
  function pick(id: string) {
    const t = rows.find((r) => r.id === id);
    if (!t) return;
    setCode(t.territoryCode);
    setName(t.name);
    setRegions(t.regions.join(", "));
    setStatus(t.status);
  }

  const gaps = useMemo(() => uncoveredRegions(accountRegions, rows), [accountRegions, rows]);
  const inField = new Set(splitListField(regions));

  const suggestions: AssistSuggestion[] = gaps
    .filter((g) => !inField.has(g.region))
    .slice(0, 3)
    .map((g) => ({
      id: `region-${g.region}`,
      label: ASSIST_TEXT.uncoveredRegion(g.region, g.accounts),
      // The reason is the routing rule itself: leads route territory-first, so
      // ground no territory covers is ground where every lead is unroutable.
      reason: ASSIST_TEXT.uncoveredRegionWhy,
      apply: () => setRegions((r) => (r.trim() === "" ? g.region : `${r}, ${g.region}`)),
    }));

  const ready = code.trim() !== "" && name.trim() !== "";
  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - repeating it in the Section
        // rendered the same sentence twice within one viewport.
        <Section icon="map-pin">
          <div className="flex max-w-xl flex-col gap-md">
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
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryCode}</FieldLabel>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{PLANNING_TEXT.territoryName}</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              {/* The field the inline panel never had. Comma-separated in either
                  language's comma; the rule layer refuses sloppy lists. */}
              <FieldLabel>{PLANNING_TEXT.territoryRegions}</FieldLabel>
              <Input
                value={regions}
                placeholder={PLANNING_TEXT.territoryRegionsHint}
                onChange={(e) => setRegions(e.target.value)}
              />
            </Field>
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
                        regions: splitListField(regions),
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
