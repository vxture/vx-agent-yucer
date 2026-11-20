"use client";
import { useRef } from "react";
import { FormDraftAssistant } from "../components/form-draft-assistant";
import { useMessages } from "../lib/i18n/provider";
import type { PlanningDraftContext } from "../../domains/planning/plan-assist-draft";
import type { PlanContent } from "../../domains/planning/plan-model";
import { assistPlanningDraft } from "./assist-action";

export function PlanDraftAssistant({ content, context, edit, disabled, onBusy }: {
  content: PlanContent; context: PlanningDraftContext; edit: (c: PlanContent) => void; disabled: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const { PLAN_WORKSPACE_TEXT: W, PLAN_VERSION_ERROR: E } = useMessages();
  const current = useRef(content); current.current = content;
  const values = { name: [String(context.year), content.regions.find(r => r.id === context.regionId)?.name].filter(Boolean).join(" \u00b7 "), content };
  return <FormDraftAssistant enabled={!disabled} values={values} onBusy={onBusy} example={W.assistantExample} task={W.assistantTask} welcome={W.assistantWelcome}
    errorOf={code => E[code] ?? W.assistantError}
    onAssist={async input => {
      const requested = input.values.content;
      const result = await assistPlanningDraft({ ...context, text: input.text, values: requested, sessionId: input.sessionId, retryMessageId: input.retryMessageId });
      if (result.ok && JSON.stringify(current.current) !== JSON.stringify(requested)) return { ok: false as const, error: "draft_conflict" };
      return result;
    }}
    onApply={(next: PlanContent) => edit(next)}/>;
}
