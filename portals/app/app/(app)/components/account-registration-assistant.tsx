"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Banner, Button, Card, Field, FieldLabel, Icon, Input, Textarea } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { TitleHelp } from "./title-help";

export interface RegistrationMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
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
  const { ACCOUNT_REGISTRATION_TEXT: T, ACCOUNT_BASICS_TEXT: B, COPILOT_TEXT } = useMessages();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dock) end.current?.scrollIntoView({ block: "nearest" });
  }, [dock, messages.length, assisting]);
  const send = (event: FormEvent) => { event.preventDefault(); onSend(); };
  const id = dock ? "registration-dock-question" : "registration-question";
  const shown = compact ? messages.slice(-1) : messages;
  const composer = <form onSubmit={send} className="flex shrink-0 flex-col gap-sm">
    <div className={dock ? "flex flex-col gap-sm" : "flex flex-col items-end gap-sm sm:flex-row"}>
      <Field className="min-w-0 flex-1 self-stretch"><FieldLabel htmlFor={id} className={dock ? undefined : "sr-only"}>{T.assistHint}</FieldLabel>
        {dock ? <Textarea id={id} rows={3} maxLength={4000} value={text} onChange={event => onTextChange(event.target.value)}
          placeholder={messages.length ? T.dockPlaceholder : T.assistPlaceholder} disabled={busy} className="resize-none" />
          : <Input id={id} maxLength={4000} value={text} onChange={event => onTextChange(event.target.value)} placeholder={T.assistPlaceholder} disabled={busy} />}
      </Field>
      <div className="ml-auto flex items-center gap-sm">
        {dock && customerName.trim() ? <Button type="button" size="xl" variant="secondary" disabled={busy} onClick={onReview}>{T.reviewSubmit}</Button> : null}
        <Button type="submit" size="xl" disabled={busy || !text.trim()}><Icon name={dock ? "paperplane-tilt" : "magic-wand"} size="sm" />
          {error ? T.assistRetry : messages.length ? T.assistSend : T.assistBegin}
        </Button>
      </div>
    </div>
  </form>;
  return <Card className={dock ? "flex min-h-0 flex-1 flex-col gap-md p-sm" : "flex flex-col gap-md border-primary/10 bg-primary/5 p-lg"}
    data-registration-assistant={dock ? "dock" : "inline"} data-business-form>
    {!dock ? <div className="flex shrink-0 items-center gap-xs"><Icon name="magic-wand" size="md" className="shrink-0 text-primary" />
      <h2 className="min-w-0 truncate text-label-medium">{T.assistStart}</h2><TitleHelp topic={T.assistStart}>{T.assistHelp}</TitleHelp>
    </div> : null}
    {dock ? <div className="flex shrink-0 items-center gap-sm border-b border-dashed border-border pb-sm text-body-small">
      <span className="shrink-0 text-muted-foreground">{B.createTitle}</span>
      {customerName ? <span className="min-w-0 truncate text-foreground" title={customerName}>{customerName}</span> : null}
      <span className="ml-auto shrink-0 text-muted-foreground">{customerTierLabel}</span>
    </div> : null}
    {canAssist ? <>
      {dock || shown.length || error || status ? <div className={dock ? "flex min-h-0 flex-1 flex-col gap-md overflow-y-auto" : "flex flex-col gap-md"}>
        {shown.length ? <div role="log" aria-label={dock ? B.createTitle : T.assistStart} aria-live={dock ? "polite" : "off"} aria-busy={assisting}
          className={`flex min-w-0 flex-col gap-sm text-body ${dock ? "" : "max-h-64 overflow-y-auto"}`}>
          {shown.map((message, index) => <div key={index} data-role={message.role}
            className={message.role === "user" ? "ml-lg self-end rounded-md bg-accent px-md py-sm" : "min-w-0 leading-relaxed text-foreground"}>
            {dock ? <p className="mb-xs text-body-small text-muted-foreground">{message.role === "user" ? COPILOT_TEXT.you : COPILOT_TEXT.assistant}</p> : null}
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          </div>)}
        </div> : dock ? <p className="text-body-small leading-relaxed text-muted-foreground">{T.dockWelcome}</p> : null}
        {error ? <Banner tone="warning" title={error} /> : null}
        {relations}
        {status ? <span className="text-body-small text-muted-foreground" role="status">{status}</span> : null}
        {dock ? <div ref={end} /> : null}
      </div> : null}
      <div className={dock ? "shrink-0 border-t border-dashed border-border pt-md" : ""}>{composer}</div>
    </> : <p className="text-body-small text-muted-foreground">{T.assistDenied}</p>}
  </Card>;
}
