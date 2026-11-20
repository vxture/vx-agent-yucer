"use client";
import { useRef } from "react";
import { changedPlanFields, type PlanManualField } from "../../domains/strategy/lib/plan-manual-fields";
import { FormDraftAssistant } from "./form-draft-assistant";
import { useMessages } from "../lib/i18n/provider";
import type { PlanEdit } from "../../domains/strategy/lib/lifecycle";
import type { PlanAssistInput, PlanAssistResult } from "../../domains/strategy/plan-assist-service";

export function StrategyDraftAssistant(props: {
  readonly values: PlanEdit; readonly editId?: string; readonly enabled: boolean;
  readonly onAssist: (input: PlanAssistInput) => Promise<PlanAssistResult>;
  readonly onApply: (value: PlanEdit) => void; readonly onBusy: (busy: boolean) => void;
}) {
  const { PLAN_ERROR, STRATEGY_RESULT_TEXT: T } = useMessages();
  const applied = useRef<PlanEdit | null>(null), manual = useRef(new Set<PlanManualField>());
  return <FormDraftAssistant {...props} errorOf={code => PLAN_ERROR[code] ?? T.assistError}
    onAssist={input => {
      if (applied.current) for (const field of changedPlanFields(input.values, applied.current)) manual.current.add(field);
      return props.onAssist({ ...input, manualFields: [...manual.current] });
    }} onApply={value => { applied.current = structuredClone(value); props.onApply(value); }} />;
}
