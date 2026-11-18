"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Banner, Button, Card, Icon, Input } from "@vxture/design-ui";
import { usePageAssistantSlot } from "./form-assist-slot";
import {
  AssistantComposer,
  AssistantMessage,
  AssistantTranscript,
} from "./assistant-conversation";
import { useMessages } from "../lib/i18n/provider";
import type { PlanEdit } from "../../domains/strategy/lib/lifecycle";
import type {
  PlanAssistInput,
  PlanAssistResult,
} from "../../domains/strategy/plan-assist-service";
export function StrategyDraftAssistant({
  values,
  editId,
  enabled,
  onAssist,
  onApply,
  onBusy,
}: {
  readonly values: PlanEdit;
  readonly editId?: string;
  readonly enabled: boolean;
  readonly onAssist: (input: PlanAssistInput) => Promise<PlanAssistResult>;
  readonly onApply: (values: PlanEdit) => void;
  readonly onBusy: (busy: boolean) => void;
}) {
  const { STRATEGY_RESULT_TEXT: T, PLAN_ERROR } = useMessages();
  const slot = usePageAssistantSlot();
  const [text, setText] = useState(""),
    [messages, setMessages] = useState<
      { role: "user" | "assistant"; text: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string>(),
    [recovery, setRecovery] = useState<{
      sessionId: string;
      messageId: string;
      text: string;
    }>();
  const running = useRef(false);
  async function send() {
    if (!enabled || !text.trim() || running.current) return;
    running.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    const question = text.trim();
    const retry = recovery?.text === question ? recovery : undefined;
    if (!retry) setMessages((m) => [...m, { role: "user", text: question }]);
    try {
      const result = await onAssist({
        text: question,
        editId,
        values,
        sessionId: retry?.sessionId ?? sessionId,
        retryMessageId: retry?.messageId,
      });
      if (!result.ok) {
        setError(PLAN_ERROR[result.error] ?? T.assistError);
        if (result.recovery)
          setRecovery({ ...result.recovery, text: question });
        return;
      }
      setSessionId(result.sessionId);
      setRecovery(undefined);
      onApply(result.patch);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: result.message || T.assistUpdated },
      ]);
      setText("");
    } catch {
      setError(T.assistError);
    } finally {
      running.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  const feedback = error ? <Banner tone="warning" title={error} /> : null;
  return (
    <>
      <Card className="flex flex-col gap-md border-primary/10 bg-primary/5 p-lg">
        <div className="flex items-center gap-sm text-body">
          <Icon name="magic-wand" size="sm" className="text-primary-text" />
          {T.assist}
        </div>
        <form
          className="flex items-center gap-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input
            value={text}
            maxLength={4000}
            placeholder={T.assistExample}
            aria-label={T.assist}
            disabled={!enabled || busy}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            type="submit"
            size="md"
            disabled={!enabled || busy || !text.trim()}
          >
            <Icon
              name={busy ? "spinner" : "magic-wand"}
              size="sm"
              className={busy ? "animate-spin" : undefined}
            />
            {T.assist}
          </Button>
        </form>
        {!slot ? (
          <div className="flex max-h-64 flex-col gap-md overflow-y-auto">
            {messages.map((m, i) => (
              <AssistantMessage key={i} role={m.role}>
                {m.text}
              </AssistantMessage>
            ))}
            {feedback}
          </div>
        ) : null}
      </Card>
      {slot
        ? createPortal(
            <div className="flex min-h-0 flex-1 flex-col gap-md">
              <p className="text-body-small text-muted-foreground">
                {T.assistTask}
                {values.name ? ` \u00b7 ${values.name}` : ""}
              </p>
              <AssistantTranscript revision={messages.length} busy={busy}>
                {!messages.length ? (
                  <p className="text-body-small text-muted-foreground">
                    {T.assistWelcome}
                  </p>
                ) : null}
                {messages.map((m, i) => (
                  <AssistantMessage key={i} role={m.role}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </AssistantMessage>
                ))}
                {feedback}
              </AssistantTranscript>
              <AssistantComposer
                id="strategy-draft-assistant"
                value={text}
                onChange={setText}
                onSend={() => void send()}
                disabled={!enabled}
                busy={busy}
                placeholder={T.assistExample}
              />
            </div>,
            slot,
          )
        : null}
    </>
  );
}
