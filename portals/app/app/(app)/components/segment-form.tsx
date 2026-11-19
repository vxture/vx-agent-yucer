"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Banner, Button, Card, Field, FieldError, FieldLabel, Icon, Input, NativeSelect, Section, SectionHeader, Textarea, Tooltip, TooltipContent, TooltipTrigger } from "@vxture/design-ui";
import { SegmentOfferings } from "./segment-offerings";
import { FormFields, FormPage, useFormSubmit } from "./form-page";
import { SegmentChoices } from "./segment-choices";
import { usePageAssistantSlot } from "./form-assist-slot";
import { AssistantComposer, AssistantMessage, AssistantTranscript } from "./assistant-conversation";
import { useMessages } from "../lib/i18n/provider";
import type { SegmentCriteria } from "../../domains/strategy/lib/lifecycle";
import { SEGMENT_TEXT_FIELDS, segmentFillValues, type SegmentFillField, type SegmentFillValues, type SegmentVocabulary } from "../../domains/strategy/lib/segment-draft";
import { SEGMENT_TEXT_LIMITS, type SegmentTextField } from "../../domains/strategy/lib/segment-text-limits";
import type { SegmentAssistInput, SegmentAssistResult } from "../../domains/strategy/segment-assist-service";

export interface SegmentFormRow {
  readonly id: string; readonly segmentCode: string; readonly name: string; readonly priority: number; readonly status: string;
  readonly criteria: SegmentCriteria; readonly solutionIds?: readonly string[]; readonly productIds?: readonly string[];
}

/** Concise inline guidance; DS tooltip supports keyboard focus as well as hover. */
function SegmentHelp({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>
    <Button type="button" variant="ghost" size="icon-md" data-control-size="compact" className="shrink-0 text-muted-foreground" aria-label={label}>
      <Icon name="help" size="xs" />
    </Button>
  </TooltipTrigger><TooltipContent side="bottom" align="start" collisionPadding={12} className="w-[min(18rem,calc(100dvw-24px))] break-words leading-relaxed">
    {children}
  </TooltipContent></Tooltip>;
}

export function SegmentForm({ original, generatedCode, vocabulary, canAssist, onAssist, onSave }: {
  readonly original?: SegmentFormRow; readonly generatedCode: string; readonly vocabulary: SegmentVocabulary;
  readonly canAssist: boolean;
  readonly onAssist: (input: SegmentAssistInput) => Promise<SegmentAssistResult>;
  readonly onSave: (input: { editId?: string; name: string; priority: number; status: string; criteria: SegmentCriteria; solutionIds?: readonly string[]; productIds?: readonly string[] }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { SEGMENT_FORM_TEXT: T, SEGMENT_ERROR, HEADER_TEXT: H } = useMessages();
  const id = useId();
  const code = original?.segmentCode ?? generatedCode;
  const [priority, setPriority] = useState(String(original?.priority ?? 0));
  const [status, setStatus] = useState(original?.status ?? "active");
  const [values, setValues] = useState<SegmentFillValues>(() => segmentFillValues(original?.name ?? "", original?.criteria ?? { industries: [], regions: [] }, original?.solutionIds, original?.productIds));
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [assisting, setAssisting] = useState(false);
  const [assistError, setAssistError] = useState("");
  const [changed, setChanged] = useState<SegmentFillField[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [recovery, setRecovery] = useState<{ sessionId: string; messageId: string; text: string }>();
  const manual = useRef(new Set<SegmentFillField>());
  const hasAssisted = useRef(false);
  const inFlight = useRef(false);
  const slot = usePageAssistantSlot();
  const returnTo = original ? `/segment/${encodeURIComponent(original.id)}` : "/segment";
  const submit = useFormSubmit(returnTo);
  const busy = assisting || submit.pending;
  const textOverLimit = SEGMENT_TEXT_FIELDS.some(key => values[key].length > SEGMENT_TEXT_LIMITS[key]);
  const ready = !textOverLimit && !!values.name.trim() && Number.isInteger(Number(priority)) && Number(priority) >= 0 && Number(priority) <= 9999;
  function change<K extends SegmentFillField>(key: K, value: SegmentFillValues[K]) {
    if (hasAssisted.current) manual.current.add(key);
    setValues(current => ({ ...current, [key]: value }));
  }
  async function send() {
    const question = text.trim();
    if (!canAssist || !question || busy || inFlight.current) return;
    inFlight.current = true; setAssisting(true); setAssistError(""); setChanged([]);
    const retry = recovery?.text === question ? recovery : undefined;
    if (!retry) setMessages(current => [...current, { role: "user", text: question }]);
    try {
      const result = await onAssist({ text: question, editId: original?.id, sessionId: retry?.sessionId ?? sessionId, retryMessageId: retry?.messageId, values, manualFields: [...manual.current] });
      if (!result.ok) {
        if (result.sessionId) setSessionId(result.sessionId);
        if (result.recovery) { setSessionId(result.recovery.sessionId); setRecovery({ ...result.recovery, text: question }); }
        setAssistError(SEGMENT_ERROR[result.error] ?? SEGMENT_ERROR.turn_failed);
        return;
      }
      setSessionId(result.sessionId); setRecovery(undefined); hasAssisted.current = true;
      setValues(current => ({ ...current, ...result.patch })); setText("");
      const fields = Object.keys(result.patch) as SegmentFillField[];
      setChanged(fields);
      setMessages(current => [...current, { role: "assistant", text: result.message || (fields.length ? T.assistUpdated : T.assistNoChange) }]);
    } catch { setAssistError(SEGMENT_ERROR.turn_failed); }
    finally { inFlight.current = false; setAssisting(false); }
  }
  const label = (key: keyof typeof T.help, required = false) => <div className="flex items-center gap-xs">
    <FieldLabel htmlFor={`${id}-${key}`} required={required}>{T[key]}</FieldLabel>
    <SegmentHelp label={`${T[key]} \u00b7 ${H.help}`}>{T.help[key]}</SegmentHelp>
  </div>;
  const overLimit = (key: SegmentTextField) => values[key].length > SEGMENT_TEXT_LIMITS[key];
  const textCount = (key: SegmentTextField) => <span id={`${id}-${key}-count`} data-segment-text-count={key} className={`ml-auto text-body-small tabular-nums ${overLimit(key) ? "text-destructive-text" : "text-muted-foreground"}`}>{values[key].length}/{SEGMENT_TEXT_LIMITS[key]}</span>;
  const textError = (key: SegmentTextField) => overLimit(key) ? <FieldError id={`${id}-${key}-error`} role="alert">{T.tooLong(SEGMENT_TEXT_LIMITS[key])}</FieldError> : null;
  const textAttributes = (key: SegmentTextField) => ({ "aria-invalid": overLimit(key) || undefined, "aria-describedby": [`${id}-${key}-count`, ...(overLimit(key) ? [`${id}-${key}-error`] : [])].join(" ") });
  const changedLabel = (field: SegmentFillField) => field === "productIds" || field === "solutionIds" ? T.offerings : T[field];
  const feedback = <>
    {assistError ? <Banner tone="warning" title={assistError} /> : null}
    {changed.length ? <p role="status" className="text-body-small text-muted-foreground">{T.changed}: {[...new Set(changed.map(changedLabel))].join(" / ")}</p> : null}
  </>;
  const assistant = slot ? createPortal(<div className="flex min-h-0 flex-1 flex-col gap-md" data-segment-assistant="dock">
    <p className="shrink-0 text-body-small text-muted-foreground">{T.assistTask}{values.name ? ` \u00b7 ${values.name}` : ""}</p>
    <AssistantTranscript revision={messages.length} busy={assisting}>
      {!messages.length ? <p className="text-body-small leading-relaxed text-muted-foreground">{T.assistWelcome}</p> : null}
      {messages.map((message, i) => <AssistantMessage key={i} role={message.role}><p className="whitespace-pre-wrap break-words">{message.text}</p></AssistantMessage>)}
      {feedback}
    </AssistantTranscript>
    <AssistantComposer id={`${id}-dock`} value={text} onChange={setText} onSend={() => void send()} disabled={!canAssist} busy={busy} placeholder={T.assistExample} extra={<span className="mr-auto text-body-small tabular-nums text-muted-foreground">{text.length}/4000</span>} />
  </div>, slot) : null;
  const title = (key: "basic" | "conditions" | "insights", icon: "clipboard" | "filter" | "lightbulb") =>
    <SectionHeader title={T[key]} icon={icon} />;
  return <>
    {assistant}
    <FormPage form={<div className="flex flex-col gap-xl" data-segment-form>
      <Card className="flex flex-col gap-md border-primary/10 bg-primary/5 p-lg" data-segment-assistant="inline">
        <div className="flex items-center gap-xs"><Icon name="magic-wand" size="md" className="text-primary" /><h2 className="text-label-medium">{T.assist}</h2><SegmentHelp label={T.assist}>{T.help.assist}</SegmentHelp></div>
        {canAssist ? <>
          <form className="flex items-end gap-sm" onSubmit={event => { event.preventDefault(); void send(); }}>
            <Field className="min-w-0 flex-1"><FieldLabel htmlFor={`${id}-assist`} className="sr-only">{T.assist}</FieldLabel><Input id={`${id}-assist`} placeholder={T.assistExample} value={text} maxLength={4000} disabled={busy} onChange={event => setText(event.target.value)} /></Field>
            <Button size="xl" type="submit" disabled={busy || !text.trim()}><Icon name={assisting ? "spinner" : "magic-wand"} size="sm" className={assisting ? "animate-spin" : undefined} />{assistError ? T.retry : messages.length ? T.send : T.begin}</Button>
          </form>
          <p className="text-right text-body-small tabular-nums text-muted-foreground">{text.length}/4000</p>
          {!slot ? <div className="flex max-h-48 flex-col gap-sm overflow-y-auto">{messages.map((message, i) => <AssistantMessage key={i} role={message.role}>{message.text}</AssistantMessage>)}{feedback}</div> : null}
        </> : <p className="text-body-small text-muted-foreground">{T.assistDenied}</p>}
      </Card>
      <form className="flex flex-col gap-xl pb-[calc(3rem+env(safe-area-inset-bottom))]" onSubmit={event => {
        event.preventDefault(); if (!ready || busy) return;
        submit.run(() => onSave({ editId: original?.id, name: values.name.trim(), priority: Number(priority), status,
          criteria: { industries: values.industries, regions: values.regions, sizes: values.sizes, needSummary: values.needSummary, customerNeed: values.customerNeed, buyingScenario: values.buyingScenario, expectedOutcome: values.expectedOutcome, entryBarrier: values.entryBarrier },
          ...(vocabulary.solutions === null ? {} : { solutionIds: values.solutionIds }), ...(vocabulary.products === null ? {} : { productIds: values.productIds }),
        }), key => SEGMENT_ERROR[key] ?? SEGMENT_ERROR.denied);
      }}>
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-xl">
          <Section>{title("basic", "clipboard")}
            <FormFields>
              <Field data-invalid={overLimit("name") || undefined}><div className="flex items-center gap-xs">{label("name", true)}{textCount("name")}</div><Input id={`${id}-name`} required {...textAttributes("name")} placeholder={T.examples.name} value={values.name} onChange={e => change("name", e.target.value)} />{textError("name")}</Field>
              <Field>{label("code")}<Input id={`${id}-code`} readOnly value={code} /></Field>
              <div className="grid grid-cols-2 items-start gap-md">
              <Field>{label("status", true)}<NativeSelect id={`${id}-status`} required value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(T.statusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</NativeSelect></Field>
              <Field>{label("priority", true)}<Input id={`${id}-priority`} required type="number" min={0} max={9999} step={1} placeholder={T.examples.priority} value={priority} onChange={e => setPriority(e.target.value)} /></Field>
              </div>
            </FormFields>
          </Section>
          <Section>{title("conditions", "filter")}
            <FormFields>{(["industries", "sizes", "regions"] as const).map(key => <Field key={key}>{label(key)}<SegmentChoices id={`${id}-${key}`} label={T[key]} values={values[key]} options={vocabulary[key]} disabled={busy} onChange={v => change(key, v)} /></Field>)}</FormFields>
            <p className="text-body-small text-muted-foreground">{values.industries.length || values.regions.length || values.sizes.length ? T.conditionRule : T.noConditions}</p>
          </Section>
          <Section>{title("insights", "lightbulb")}
            <div className="@container"><div className="grid min-w-0 grid-cols-1 gap-lg @xl:grid-cols-2">
              <Field className="col-span-full" data-invalid={overLimit("needSummary") || undefined} data-segment-summary-field>
                <div className="flex items-center gap-xs"><Icon name="clipboard" size="xs" className="shrink-0 text-muted-foreground" aria-hidden="true" />{label("needSummary")}{textCount("needSummary")}</div>
                <Input id={`${id}-needSummary`} {...textAttributes("needSummary")} placeholder={T.examples.needSummary} value={values.needSummary} onChange={e => change("needSummary", e.target.value)} />{textError("needSummary")}
              </Field>
              {(["customerNeed", "buyingScenario", "expectedOutcome", "entryBarrier"] as const).map(key => <Field key={key} data-invalid={overLimit(key) || undefined}><div className="flex items-center gap-xs">{label(key)}{textCount(key)}</div><Textarea id={`${id}-${key}`} rows={3} {...textAttributes(key)} placeholder={T.examples[key]} value={values[key]} onChange={e => change(key, e.target.value)} />{textError(key)}</Field>)}</div></div>
          </Section>
          <SegmentOfferings vocabulary={vocabulary} selection={values} disabled={busy}
            help={<SegmentHelp label={T.offerings}>{T.help.offerings}</SegmentHelp>}
            onChange={next => {
              if (next.productIds !== values.productIds) change("productIds", next.productIds);
              if (next.solutionIds !== values.solutionIds) change("solutionIds", next.solutionIds);
            }} />
        </fieldset>
        <div className="flex items-center justify-end gap-sm border-t border-dashed border-border pt-lg">
          <Button type="button" size="xl" variant="secondary" disabled={busy} asChild><a href={returnTo}>{T.cancel}</a></Button>
          <Button type="submit" size="xl" disabled={busy || !ready}>{T.save}</Button>
        </div>
        {submit.err ? <Banner tone="danger" title={submit.err} /> : null}
      </form>
    </div>} />
  </>;
}
