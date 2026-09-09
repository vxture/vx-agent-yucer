"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import {
  AssistPanel,
  FormFields,
  FormPage,
  useFormSubmit,
  type AssistSuggestion,
} from "./form-page";
import { knownValues, suggestNextCode } from "../../domains/shared/suggest";

// 新建 / 修改战略计划 - a page since 2026-09-05 (owner ruling: content-rich
// operations get a page, with the assistant beside the work).
//
// ONE FORM PER FILE, deliberately: reachable-codes.test.ts associates error
// dictionaries with actions at FILE granularity, so a file holding two forms
// would demand every action's codes exist in every dictionary the file
// mentions. The constraint is the guard's, and it is a good one - it keeps
// "which dictionary translates this refusal" answerable by looking at one file.
//
// NO STATUS FIELD, in either mode: a new plan is a draft, and the lifecycle
// table owns every move after that. Offering status here would be a way to
// reach "approved" without the transition that records it - the same argument
// the create rule and the edit rule each make on their own side.
//
// THE NUMBER IS EDITABLE ONLY WHILE IT DOES NOT EXIST. It is the anchor every
// downstream record quotes and it carries no UPDATE grant, so in edit mode it
// is shown as the identity of the thing being edited rather than as a field
// that would be silently dropped.

type Saved = { ok: boolean; error?: string };

export interface PlanFormInitial {
  readonly id: string;
  readonly planNo: string;
  readonly name: string;
  readonly period: string;
  readonly objective: string | null;
  readonly ownerSub: string | null;
}

export function NewPlanForm({
  existingPlanNos,
  existingPeriods,
  initial,
  onCreate,
  onSave,
}: {
  readonly existingPlanNos: readonly string[];
  readonly existingPeriods: readonly string[];
  /** Present edits that plan; absent creates one. */
  readonly initial?: PlanFormInitial;
  readonly onCreate: (input: {
    planNo: string;
    name: string;
    period: string;
    objective: string | null;
    ownerSub: string | null;
  }) => Promise<Saved>;
  readonly onSave: (
    id: string,
    input: {
      name: string;
      period: string;
      objective: string | null;
      ownerSub: string | null;
    },
  ) => Promise<Saved>;
}) {
  const { STRATEGY_TEXT, PLAN_ERROR, ASSIST_TEXT } = useMessages();
  const [planNo, setPlanNo] = useState(initial?.planNo ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [period, setPeriod] = useState(initial?.period ?? "");
  const [objective, setObjective] = useState(initial?.objective ?? "");
  const [ownerSub, setOwnerSub] = useState(initial?.ownerSub ?? "");
  const submit = useFormSubmit("/strategy");

  const nextNo = useMemo(() => suggestNextCode(existingPlanNos), [existingPlanNos]);
  const periods = useMemo(() => knownValues(existingPeriods), [existingPeriods]);

  const suggestions: AssistSuggestion[] = [];
  if (!initial && nextNo && planNo.trim() === "") {
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

  const ready =
    name.trim() !== "" && period.trim() !== "" && (initial ? true : planNo.trim() !== "");

  return (
    <FormPage
      form={
        // The page ViewHeader owns the title - repeating it in the Section
        // rendered the same sentence twice within one viewport.
        <Section icon="flag">
          <div className="gap-xl flex flex-col">
            <FormFields>
            <Field>
              <FieldLabel>{STRATEGY_TEXT.newPlanNo}</FieldLabel>
              {initial ? (
                <>
                  <p className="text-foreground mono text-body">{initial.planNo}</p>
                  <FieldDescription>{STRATEGY_TEXT.planNoFixed}</FieldDescription>
                </>
              ) : (
                <Input value={planNo} onChange={(e) => setPlanNo(e.target.value)} />
              )}
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
            </FormFields>
            {/* The number is the anchor: workspace-unique, no UPDATE grant, so
                it cannot be corrected later. Said before the first attempt. */}
            {initial ? null : (
              <p className="text-muted-foreground text-body-sm">{STRATEGY_TEXT.newPlanAnchor}</p>
            )}
            <div className="flex items-center gap-md">
              <Button
                disabled={submit.pending || !ready}
                onClick={() =>
                  submit.run(() => {
                    const fields = {
                      name: name.trim(),
                      period: period.trim(),
                      objective: objective.trim() === "" ? null : objective.trim(),
                      ownerSub: ownerSub.trim() === "" ? null : ownerSub.trim(),
                    };
                    return initial
                      ? onSave(initial.id, fields)
                      : onCreate({ planNo: planNo.trim(), ...fields });
                  }, (c) => PLAN_ERROR[c] ?? PLAN_ERROR.denied)
                }
              >
                {initial ? STRATEGY_TEXT.planSave : STRATEGY_TEXT.newPlanSave}
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
