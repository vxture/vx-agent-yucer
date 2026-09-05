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

// 新建战略计划 - a page since 2026-09-05 (owner ruling: content-rich operations
// get a page, with the assistant beside the work).
//
// ONE FORM PER FILE, deliberately: reachable-codes.test.ts associates error
// dictionaries with actions at FILE granularity, so a file holding two forms
// would demand every action's codes exist in every dictionary the file
// mentions. The constraint is the guard's, and it is a good one - it keeps
// "which dictionary translates this refusal" answerable by looking at one file.
//
// NO STATUS FIELD: a new plan is a draft, and the lifecycle table owns every
// move after that - offering status here would be a way to reach "approved"
// without the transition that records it.

type Saved = { ok: boolean; error?: string };

export function NewPlanForm({
  existingPlanNos,
  existingPeriods,
  onCreate,
}: {
  readonly existingPlanNos: readonly string[];
  readonly existingPeriods: readonly string[];
  readonly onCreate: (input: {
    planNo: string;
    name: string;
    period: string;
    objective: string | null;
    ownerSub: string | null;
  }) => Promise<Saved>;
}) {
  const { STRATEGY_TEXT, PLAN_ERROR, ASSIST_TEXT } = useMessages();
  const [planNo, setPlanNo] = useState("");
  const [name, setName] = useState("");
  const [period, setPeriod] = useState("");
  const [objective, setObjective] = useState("");
  const [ownerSub, setOwnerSub] = useState("");
  const submit = useFormSubmit("/strategy");

  const nextNo = useMemo(() => suggestNextCode(existingPlanNos), [existingPlanNos]);
  const periods = useMemo(() => knownValues(existingPeriods), [existingPeriods]);

  const suggestions: AssistSuggestion[] = [];
  if (nextNo && planNo.trim() === "") {
    suggestions.push({
      id: "no",
      label: ASSIST_TEXT.codeNext(nextNo),
      reason: ASSIST_TEXT.codeNextWhy,
      apply: () => setPlanNo(nextNo),
    });
  }
  // The period format the workspace already writes ("2026H2", "2026-Q3"...).
  // Suggesting the EXISTING spelling is the point: two spellings of one period
  // split every report that groups by it - the same argument as categories.
  if (period.trim() === "" && periods.length > 0) {
    suggestions.push({
      id: "period",
      label: ASSIST_TEXT.periodKnown(periods[0]!),
      reason: ASSIST_TEXT.periodKnownWhy,
      apply: () => setPeriod(periods[0]!),
    });
  }

  const ready = planNo.trim() !== "" && name.trim() !== "" && period.trim() !== "";
  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - repeating it in the Section
        // rendered the same sentence twice within one viewport.
        <Section icon="flag">
          <div className="flex max-w-xl flex-col gap-md">
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanNo}</FieldLabel>
              <Input value={planNo} onChange={(e) => setPlanNo(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanName}</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanPeriod}</FieldLabel>
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanOwner}</FieldLabel>
              <Input value={ownerSub} onChange={(e) => setOwnerSub(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanObjective}</FieldLabel>
              <Input value={objective} onChange={(e) => setObjective(e.target.value)} />
            </Field>
            {/* The number is the anchor: workspace-unique, no UPDATE grant, so
                it cannot be corrected later. Said before the first attempt. */}
            <p className="text-muted-foreground text-body-sm">{STRATEGY_TEXT.newPlanAnchor}</p>
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(
                    () =>
                      onCreate({
                        planNo: planNo.trim(),
                        name: name.trim(),
                        period: period.trim(),
                        objective: objective.trim() === "" ? null : objective.trim(),
                        ownerSub: ownerSub.trim() === "" ? null : ownerSub.trim(),
                      }),
                    (c) => PLAN_ERROR[c] ?? PLAN_ERROR.denied,
                  )
                }
              >
                {STRATEGY_TEXT.newPlanSave}
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
