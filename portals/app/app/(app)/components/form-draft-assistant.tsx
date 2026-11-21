"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Banner, Button, Card, Icon, Input } from "@vxture/design-ui";
import { usePageAssistantSlot } from "./form-assist-slot";
import { useRequestLifetime } from "./use-request-lifetime";
import {
  AssistantComposer,
  AssistantMessage,
  AssistantTranscript,
} from "./assistant-conversation";
import { useMessages } from "../lib/i18n/provider";
type DraftRequest<V> = { text: string; values: V; editId?: string; sessionId?: string; retryMessageId?: string };
type DraftReply<P> = { ok: true; sessionId: string; message: string; patch: P } |
  { ok: false; error: string; recovery?: { sessionId: string; messageId: string } };
export function FormDraftAssistant<V extends { name?: string }, P>({
  values,
  editId,
  enabled,
  onAssist,
  onApply,
  onBusy,
  example, task, welcome, describeApplied, errorOf,
}: {
  readonly values: V;
  readonly editId?: string;
  readonly enabled: boolean;
  readonly onAssist: (input: DraftRequest<V>) => Promise<DraftReply<P>>;
  readonly onApply: (values: P) => void;
  readonly onBusy: (busy: boolean) => void;
  readonly errorOf?: (code: string) => string;
  readonly describeApplied?: (patch: P) => string;
  readonly example?: string; readonly task?: string; readonly welcome?: string;
}) {
  const { STRATEGY_RESULT_TEXT: T } = useMessages();
  const slot = usePageAssistantSlot();
  const [text, setText] = useState(""),
    [messages, setMessages] = useState<
      { id: string; role: "user" | "assistant"; text: string }[]
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
  const lifetime = useRequestLifetime(() => { if (running.current) onBusy(false); });
  async function send() {
    if (!enabled || !text.trim() || running.current) return;
    running.current = true;
    const signal = lifetime.current.signal;
    setBusy(true);
    onBusy(true);
    setError("");
    const question = text.trim();
    const retry = recovery?.text === question ? recovery : undefined;
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, text: question };
    if (!retry) setMessages((m) => [...m, userMessage]);
    try {
      const result = await onAssist({
        text: question,
        editId,
        values,
        sessionId: retry?.sessionId ?? sessionId,
        retryMessageId: retry?.messageId,
      });
      if (signal.aborted) return;
      if (!result.ok) {
        setError(errorOf?.(result.error) ?? T.assistError);
        if (result.recovery)
          setRecovery({ ...result.recovery, text: question });
        return;
      }
      setSessionId(result.sessionId);
      setRecovery(undefined);
      onApply(result.patch);
      const assistantMessageId = crypto.randomUUID();
      setMessages((m) => [
        ...m,
        { id: assistantMessageId, role: "assistant", text: [result.message, describeApplied?.(result.patch)].filter(Boolean).join("\n") || T.assistUpdated },
      ]);
      setText("");
    } catch {
      if (!signal.aborted) setError(T.assistError);
    } finally {
      if (!signal.aborted) {
        running.current = false;
        setBusy(false);
        onBusy(false);
      }
    }
  }
  const feedback = error ? <Banner tone="warning" title={error} /> : null;
  return (
    <>
      <Card className="flex flex-col gap-md border-primary/10 bg-primary/5 p-lg" data-form-draft-assistant="inline">
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
            placeholder={example ?? T.assistExample}
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
            {messages.map((m) => (
              <AssistantMessage key={m.id} role={m.role}>
                {m.text}
              </AssistantMessage>
            ))}
            {feedback}
          </div>
        ) : null}
      </Card>
      {slot
        ? createPortal(
            <div className="flex min-h-0 flex-1 flex-col gap-md" data-form-draft-assistant="dock">
              <p className="text-body-small text-muted-foreground">
                {task ?? T.assistTask}
                {values.name ? ` \u00b7 ${values.name}` : ""}
              </p>
              <AssistantTranscript revision={messages.length} busy={busy}>
                {!messages.length ? (
                  <p className="text-body-small text-muted-foreground">
                    {welcome ?? T.assistWelcome}
                  </p>
                ) : null}
                {messages.map((m) => (
                  <AssistantMessage key={m.id} role={m.role}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </AssistantMessage>
                ))}
                {feedback}
              </AssistantTranscript>
              <AssistantComposer
                id="form-draft-assistant"
                value={text}
                onChange={setText}
                onSend={() => void send()}
                disabled={!enabled}
                busy={busy}
                placeholder={example ?? T.assistExample}
              />
            </div>,
            slot,
          )
        : null}
    </>
  );
}
