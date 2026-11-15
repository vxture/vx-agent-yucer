"use client";

import { type FormEvent, type ReactNode } from "react";
import { Banner, Button, Card, Field, FieldLabel, Icon, Input } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { AssistantComposer, AssistantMessage, AssistantTranscript } from "./assistant-conversation";
import { TitleHelp } from "./title-help";
import type { RegistrationSource } from "../../domains/account/lib/registration-draft";

export interface RegistrationMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly sources?: readonly RegistrationSource[];
}

/** Two views over the same form-owned thread; neither owns a separate draft. */
export function AccountRegistrationAssistant({
  dock = false, compact = false, canAssist, busy, assisting, messages, text,
  error, status, customerName, customerTierLabel, onTextChange, onSend, onReview, relations,
}: {
  readonly dock?: boolean;
  readonly compact?: boolean;
  readonly canAssist: boolean;
  readonly busy: boolean;
  readonly assisting: boolean;
  readonly messages: readonly RegistrationMessage[];
  readonly text: string;
  readonly error?: string;
  readonly status: string;
  readonly customerName: string;
  readonly customerTierLabel: string;
  readonly onTextChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onReview: () => void;
  readonly relations: ReactNode;
}) {
  const { ACCOUNT_REGISTRATION_TEXT: T, ACCOUNT_BASICS_TEXT: B } = useMessages();
  const send = (event: FormEvent) => { event.preventDefault(); onSend(); };
  const id = dock ? "registration-dock-question" : "registration-question";
  const shown = compact ? messages.slice(-1) : messages;
  const composer = dock ? <AssistantComposer id={id} value={text} onChange={onTextChange} onSend={onSend}
    disabled={!canAssist} busy={busy} placeholder={messages.length ? T.dockPlaceholder : T.assistPlaceholder}
    extra={customerName.trim() ? <Button type="button" size="md" variant="secondary" disabled={busy} onClick={onReview}>{T.reviewSubmit}</Button> : null} />
    : <form onSubmit={send} className="flex shrink-0 items-end gap-sm">
      <Field className="min-w-0 flex-1"><FieldLabel htmlFor={id} className="sr-only">{T.assistHint}</FieldLabel>
        <Input id={id} maxLength={4000} value={text} onChange={event => onTextChange(event.target.value)} placeholder={T.assistPlaceholder} disabled={busy} />
      </Field>
      <Button type="submit" size="xl" disabled={busy || !text.trim()}><Icon name="magic-wand" size="sm" />
        {error ? T.assistRetry : messages.length ? T.assistSend : T.assistBegin}
      </Button>
    </form>;
  const content = <>
    {shown.map((message, index) => <AssistantMessage key={index} role={message.role}>
      <p className="whitespace-pre-wrap break-words">{message.text}</p>
      {message.sources?.length ? <div className="mt-xs flex flex-wrap gap-x-sm gap-y-xs text-body-small text-muted-foreground">
        {message.sources.map((source, sourceIndex) => source.url
          ? <a key={sourceIndex} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-xs hover:text-primary" title={source.excerpt}>
            <Icon name="link" size="sm" />{T.researchSource(sourceIndex + 1)}
          </a>
          : <span key={sourceIndex} title={source.excerpt}>{T.researchSource(sourceIndex + 1)}</span>)}
      </div> : null}
    </AssistantMessage>)}
    {!shown.length && dock ? <p className="text-body-small leading-relaxed text-muted-foreground">{T.dockWelcome}</p> : null}
    {error ? <Banner tone="warning" title={error} /> : null}
    {relations}
    {status ? <span className="text-body-small text-muted-foreground" role="status">{status}</span> : null}
  </>;
  const Frame = dock ? "div" : Card;
  return <Frame className={dock ? "flex h-full min-h-0 flex-1 flex-col gap-md" : "flex flex-col gap-md border-primary/10 bg-primary/5 p-lg"}
    data-registration-assistant={dock ? "dock" : "inline"} data-business-form>
    {!dock ? <div className="flex shrink-0 items-center gap-xs"><Icon name="magic-wand" size="md" className="shrink-0 text-primary" />
      <h2 className="min-w-0 truncate text-label-medium">{T.assistStart}</h2><TitleHelp topic={T.assistStart}>{T.assistHelp}</TitleHelp>
    </div> : null}
    {dock ? <div className="flex shrink-0 items-center gap-sm text-body-small">
      <span className="shrink-0 text-muted-foreground">{B.createTitle}</span>
      {customerName ? <span className="min-w-0 truncate text-foreground" title={customerName}>{customerName}</span> : null}
      <span className="ml-auto shrink-0 text-muted-foreground">{customerTierLabel}</span>
    </div> : null}
    {canAssist ? <>
      {dock ? <AssistantTranscript revision={messages.length} busy={assisting}>{content}</AssistantTranscript>
        : <div className="flex max-h-64 min-h-0 flex-col gap-md overflow-y-auto">{content}</div>}
      {composer}
    </> : <p className="text-body-small text-muted-foreground">{T.assistDenied}</p>}
  </Frame>;
}
