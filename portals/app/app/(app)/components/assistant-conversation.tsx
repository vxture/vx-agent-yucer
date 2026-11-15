"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Icon, Textarea } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useAssistantInteraction } from "./assistant-interaction";
import styles from "./assistant-conversation.module.css";

/** Follow new turns only while the reader is already at the end. */
export function AssistantTranscript({ children, revision, busy = false }: {
  readonly children: ReactNode;
  readonly revision: number;
  readonly busy?: boolean;
}) {
  const { ASSISTANT_PANEL_TEXT: T } = useMessages();
  const viewport = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (atEnd.current) node.scrollTop = node.scrollHeight;
    else setUnread(true);
  }, [revision, busy]);
  return <div className="relative flex min-h-0 flex-1 flex-col">
    <div ref={viewport} role="log" aria-label={T.conversation} aria-live="polite" aria-busy={busy}
      tabIndex={0} data-assistant-transcript className={`${styles.transcript} flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto`}
      onScroll={event => {
        const node = event.currentTarget;
        atEnd.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        if (atEnd.current) setUnread(false);
      }}>{children}</div>
    {unread ? <Button type="button" size="md" variant="secondary" className="absolute bottom-xs self-center"
      onClick={() => { const node = viewport.current; if (node) node.scrollTop = node.scrollHeight; atEnd.current = true; setUnread(false); }}>
      <Icon name="arrow-down" size="xs" />{T.newMessages}
    </Button> : null}
  </div>;
}

export function AssistantMessage({ role, children }: { readonly role: "user" | "assistant"; readonly children: ReactNode }) {
  return <div data-role={role} className={role === "user" ? "ml-lg flex max-w-[90%] self-end items-start gap-xs" : "min-w-0 w-full text-foreground"}>
    <div className={role === "user" ? "min-w-0 rounded-lg bg-primary-muted px-md py-sm text-body leading-relaxed" : "min-w-0 text-body leading-relaxed"}>{children}</div>
    {role === "user" ? <Icon name="user-circle" size="sm" className="mt-xs shrink-0 text-muted-foreground" /> : null}
  </div>;
}

/** Shared composer: IME-safe Enter, growing input and a stable send affordance. */
export function AssistantComposer({ id, value, onChange, onSend, disabled, sendDisabled, busy, placeholder, extra }: {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly disabled?: boolean;
  readonly sendDisabled?: boolean;
  readonly busy?: boolean;
  readonly placeholder: string;
  readonly extra?: ReactNode;
}) {
  const { ASSISTANT_PANEL_TEXT: T } = useMessages();
  const interaction = useAssistantInteraction();
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const hadText = useRef(!!value.trim());
  useEffect(() => {
    hadText.current = !!value.trim();
    const node = input.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);
  return <form className="flex shrink-0 flex-col gap-xs" data-assistant-composer onSubmit={event => {
    event.preventDefault();
    if (!disabled && !sendDisabled && !busy && value.trim()) onSend();
  }}>
    <Textarea ref={input} id={id} rows={2} maxLength={4000} value={value} placeholder={placeholder} aria-label={placeholder}
      disabled={disabled || busy} className={`${styles.composer} resize-none bg-card`}
      onChange={event => { onChange(event.target.value); const hasText = !!event.target.value.trim(); if (hasText && !hadText.current) interaction?.onInput(); hadText.current = hasText; }}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }} />
    <div className="flex items-center justify-end gap-xs">
      {extra}
      <Button type="submit" size="icon-xl" disabled={disabled || sendDisabled || busy || !value.trim()} aria-label={T.send} title={T.send}>
        <Icon name={busy ? "spinner" : "arrow-up"} size="sm" className={busy ? "animate-spin" : undefined} />
      </Button>
    </div>
  </form>;
}
