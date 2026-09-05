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
import { knownValues, suggestNextCode } from "../../domains/shared/suggest";

// 新建/编辑细分市场 - a page since 2026-09-05. One page for both because the
// write IS one act (upsert-by-anchor): picking an existing code loads it and
// locks the code field, since accounts point at the code by string.
//
// ONE FORM PER FILE - see plan-form.tsx for why the guard demands it.

export interface SegmentFormRow {
  readonly segmentCode: string;
  readonly name: string;
  readonly planId: string | null;
  readonly priority: number;
  readonly status: string;
  readonly criteria: { industries: readonly string[]; regions: readonly string[] };
}

type Saved = { ok: boolean; error?: string };

export function SegmentForm({
  rows,
  plans,
  accountIndustries,
  accountRegions,
  statusLabel,
  onSave,
}: {
  readonly rows: readonly SegmentFormRow[];
  readonly plans: readonly { readonly id: string; readonly name: string }[];
  /** What the customer base actually looks like - the criteria vocabulary. */
  readonly accountIndustries: readonly (string | null)[];
  readonly accountRegions: readonly (string | null)[];
  readonly statusLabel: Record<string, string>;
  readonly onSave: (input: {
    segmentCode: string;
    name: string;
    planId: string | null;
    priority: number;
    status: string;
    criteria: { industries: readonly string[]; regions: readonly string[] };
  }) => Promise<Saved>;
}) {
  const { STRATEGY_TEXT, SEGMENT_ERROR, ASSIST_TEXT } = useMessages();
  const BLANK = {
    segmentCode: "",
    name: "",
    planId: "",
    priority: "0",
    status: "active",
    industries: "",
    regions: "",
  };
  const [form, setForm] = useState(BLANK);
  const submit = useFormSubmit("/segment");

  const editing = form.segmentCode !== "" && rows.some((r) => r.segmentCode === form.segmentCode);

  // UPSERT-BY-ANCHOR SURVIVES THE MOVE TO A PAGE. Picking an existing code
  // loads that segment; the code field then locks, because accounts point at it
  // by string and a rename would break them silently.
  function pick(code: string) {
    if (code === "") return setForm(BLANK);
    const g = rows.find((r) => r.segmentCode === code);
    if (!g) return setForm(BLANK);
    setForm({
      segmentCode: g.segmentCode,
      name: g.name,
      planId: g.planId ?? "",
      priority: String(g.priority),
      status: g.status,
      industries: g.criteria.industries.join(", "),
      regions: g.criteria.regions.join(", "),
    });
  }

  // The criteria vocabulary comes from the ACCOUNTS, not from other segments: a
  // segment is a cut of the actual market, and an industry no customer carries
  // is a cut of nothing. Top values not already in the field, one click each.
  const industries = useMemo(() => knownValues(accountIndustries), [accountIndustries]);
  const regions = useMemo(() => knownValues(accountRegions), [accountRegions]);
  const inField = new Set(splitListField(form.industries));
  const inRegions = new Set(splitListField(form.regions));

  const suggestions: AssistSuggestion[] = [];
  for (const ind of industries.filter((i) => !inField.has(i)).slice(0, 2)) {
    suggestions.push({
      id: `ind-${ind}`,
      label: ASSIST_TEXT.industryKnown(ind),
      reason: ASSIST_TEXT.criteriaWhy,
      apply: () =>
        setForm((f) => ({
          ...f,
          industries: f.industries.trim() === "" ? ind : `${f.industries}, ${ind}`,
        })),
    });
  }
  for (const reg of regions.filter((r) => !inRegions.has(r)).slice(0, 2)) {
    suggestions.push({
      id: `reg-${reg}`,
      label: ASSIST_TEXT.regionKnown(reg),
      reason: ASSIST_TEXT.criteriaWhy,
      apply: () =>
        setForm((f) => ({
          ...f,
          regions: f.regions.trim() === "" ? reg : `${f.regions}, ${reg}`,
        })),
    });
  }

  const priority = Number(form.priority);
  const ready =
    form.segmentCode.trim() !== "" &&
    form.name.trim() !== "" &&
    Number.isInteger(priority) &&
    priority >= 0;

  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - repeating it in the Section
        // rendered the same sentence twice within one viewport.
        <Section icon="target">
          <div className="flex max-w-(--vx-container-xl) flex-col gap-md">
            <Field>
              <FieldLabel>{STRATEGY_TEXT.segmentEditing}</FieldLabel>
              <NativeSelect value={editing ? form.segmentCode : ""} onChange={(e) => pick(e.target.value)}>
                <option value="">{STRATEGY_TEXT.segmentNew}</option>
                {rows.map((r) => (
                  <option key={r.segmentCode} value={r.segmentCode}>
                    {r.segmentCode} - {r.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.segmentCodeHeader}</FieldLabel>
              <Input
                value={form.segmentCode}
                disabled={editing}
                onChange={(e) => setForm({ ...form, segmentCode: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.segmentNameHeader}</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.segmentPlanHeader}</FieldLabel>
              <NativeSelect value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
                <option value="">{STRATEGY_TEXT.segmentNoPlan}</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.segmentIndustries}</FieldLabel>
              <Input
                value={form.industries}
                placeholder={STRATEGY_TEXT.segmentListHint}
                onChange={(e) => setForm({ ...form, industries: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.segmentRegions}</FieldLabel>
              <Input
                value={form.regions}
                placeholder={STRATEGY_TEXT.segmentListHint}
                onChange={(e) => setForm({ ...form, regions: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.segmentPriorityHeader}</FieldLabel>
              <Input
                type="number"
                min={0}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.segmentStatusHeader}</FieldLabel>
              <NativeSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(statusLabel).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onSave({
                        segmentCode: form.segmentCode.trim(),
                        name: form.name.trim(),
                        planId: form.planId === "" ? null : form.planId,
                        priority,
                        status: form.status,
                        criteria: {
                          industries: splitListField(form.industries),
                          regions: splitListField(form.regions),
                        },
                      }),
                    (c) => SEGMENT_ERROR[c] ?? SEGMENT_ERROR.denied,
                  )
                }
              >
                {STRATEGY_TEXT.segmentSave}
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
