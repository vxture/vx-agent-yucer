"use client";
import { useRef } from "react";
import { FormDraftAssistant } from "../components/form-draft-assistant";
import type { FocusAssistInput, FocusDraftFields } from "../../domains/planning/focus-assist";
import { useMessages } from "../lib/i18n/provider";
import { assistFocusDraft } from "./assist-action";
export function FocusDraftAssistant({ context, values, name, disabled, onApply, onBusy }: Readonly<{
  context: Omit<FocusAssistInput, "values" | "text" | "sessionId" | "retryMessageId">; values: FocusDraftFields; name: string; disabled: boolean; onApply: (value: Partial<FocusDraftFields>) => void; onBusy: (value: boolean) => void;
}>) {
  const { FOCUS_TEXT: T, PLAN_VERSION_ERROR: E } = useMessages(), current = useRef(values); current.current = values;
  return <FormDraftAssistant values={{ name, fields: values }} enabled={!disabled} onBusy={onBusy} example={T.assistantExample} task={T.assistantTask} welcome={T.assistantWelcome} errorOf={code => E[code] ?? T.assistantError}
    onAssist={async input => {
      const requested = input.values.fields;
      const result = await assistFocusDraft({ ...context, text: input.text, values: requested, sessionId: input.sessionId, retryMessageId: input.retryMessageId });
      if (result.ok && JSON.stringify(current.current) !== JSON.stringify(requested)) return { ok: false as const, error: "draft_conflict" };
      return result;
    }} onApply={onApply}/>;
}
