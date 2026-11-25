"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Combobox, Drawer, EmptyState,
  Field, FieldLabel, Icon, Input, LabeledValue, NativeSelect, PanelCard, PanelList,
  Section, SegmentedControl, StatusBadge, Textarea, useListPagination } from "@vxture/design-ui";
import { formatNumber } from "@vxture/shared";
import { ActionMenu, FilterBar } from "./business-controls";
import { PaginationFooter, SearchSlot, FilterSlot } from "./table-fittings";
import { Tag } from "./tag";
import { ScoreRing } from "./score-ring";
import { COLLAPSED_PANEL_CLASS } from "../lib/collapsed-panel";
import { confidenceTone } from "../lib/view-model";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { filterSignalInbox, type QueueSignal, type SignalScope } from "../lib/signal-inbox";
import { isPendingSignal, SIGNAL_INPUT_LIMITS, signalSourceUrl, signalText, type SignalRegistration } from "../../domains/signal/lib/intelligence";
import { SIGNAL_TYPES } from "../../domains/signal/lib/scoring";
import { SIGNAL_DISMISS_REASONS, type ExitReason } from "../../domains/shared/funnel-exit";
import type { SignalActionResult } from "../signal/actions";
import { proposeAccountMatches, type AccountMatchProposal } from "../../domains/signal/lib/scout";

export type { QueueSignal } from "../lib/signal-inbox";
export type SignalAction = "duplicate" | "rescore";
type Account = { id: string; name: string };
type LeadLink = { id: string; name: string; no: string };
type Dialog = { kind: "register" | "promote" | "match" | "dismiss"; signal?: QueueSignal; suggestedId?: string };

export interface SignalQueueProps {
  readonly groups: readonly { key: string; title: string; why: string; items: readonly QueueSignal[] }[];
  readonly accounts: readonly Account[];
  readonly leadBySignal: Readonly<Record<string, LeadLink>>;
  readonly campaignNames: Readonly<Record<string, string>>;
  readonly relatedReadFailed: boolean;
  readonly canTriage: boolean;
  readonly canPromote: boolean;
  readonly canRescore: boolean;
  readonly canSync: boolean;
  readonly feedConfigured: boolean;
  readonly focusId?: string;
  readonly onAct: (id: string, action: SignalAction) => Promise<SignalActionResult>;
  readonly onPromote: (id: string, companyName: string) => Promise<SignalActionResult>;
  readonly onDismiss: (id: string, reason: ExitReason, note: string | null) => Promise<SignalActionResult>;
  readonly onRegister: (input: SignalRegistration) => Promise<SignalActionResult>;
  readonly onMatch: (id: string, accountId: string) => Promise<SignalActionResult>;
  readonly onSync: () => Promise<SignalActionResult>;
}

export function SignalQueue(props: SignalQueueProps) {
  const { SIGNAL_TEXT: T, SIGNAL_WORKSPACE_TEXT: W, SIGNAL_TYPE_LABEL, SIGNAL_ACTION_ERROR: ERR, TABLE_TOOLBAR_TEXT } = useMessages();
  const all = useMemo(() => props.groups.flatMap(g => g.items), [props.groups]);
  const names = useMemo(() => Object.fromEntries(props.accounts.map(a => [a.id, a.name])), [props.accounts]);
  const suggestions = useMemo(() => proposeAccountMatches(all.map(({ record }) => ({ ...record,
    companyName: signalText(record.payload, "company_name", "companyName") })), props.accounts), [all, props.accounts]);
  const focus = all.find(s => s.record.id === props.focusId);
  const [scope, setScope] = useState<SignalScope>(focus && !isPendingSignal(focus.record) ? "all" : "pending");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [match, setMatch] = useState("");
  const filtered = useMemo(() => filterSignalInbox(all, { scope, query, type, match }, names), [all, scope, query, type, match, names]);
  const pagination = useListPagination(filtered, 20);
  const shown = new Set(pagination.pageRows.map(s => s.record.id));
  const [openId, setOpenId] = useState(props.focusId ?? "");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SignalActionResult | null>(null);
  useEffect(() => {
    if (!props.focusId) return;
    const index = filtered.findIndex(s => s.record.id === props.focusId);
    if (index >= 0) pagination.onPageChange(Math.floor(index / pagination.pageSize) + 1);
    // Only an incoming focus changes the reader's page, never a later filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focusId]);
  useEffect(() => {
    if (props.focusId) document.getElementById(`signal-${props.focusId}`)?.scrollIntoView({ block: "center" });
  }, [props.focusId, pagination.page]);

  function errorText(code?: string) {
    const special: Record<string, string> = { signal_input_invalid: W.inputInvalid, company_required: W.companyRequired,
      signal_changed: W.signalChanged, signal_feed_disabled: W.syncDisabled, signal_sync_failed: W.syncFailed };
    return special[code ?? ""] ?? ERR[code ?? "save_failed"] ?? W.saveFailed;
  }
  function run(work: () => Promise<SignalActionResult>, done?: () => void) {
    setError(null); setReceipt(null);
    start(async () => {
      try {
        const result = await work();
        if (result.recorded !== undefined) setReceipt(result);
        if (result.ok) { setReceipt(result); done?.(); }
        else setError(errorText(result.error));
      } catch { setError(W.saveFailed); }
    });
  }
  const pendingCount = all.filter(s => isPendingSignal(s.record)).length;
  const openDialog = (next: Dialog) => { setError(null); setDialog(next); };
  return <Section>
    <FilterBar heading={{ title: TABLE_TOOLBAR_TEXT.signals, icon: "newspaper" }} count={filtered.length}
      scope={<SegmentedControl ariaLabel={TABLE_TOOLBAR_TEXT.signals} value={scope} onChange={value => { setScope(value); pagination.resetPage(); }} items={[
        { value: "pending", label: W.pending, count: pendingCount },
        { value: "processed", label: W.processed, count: all.length - pendingCount },
        { value: "all", label: W.all, count: all.length },
      ]} />}
      search={<SearchSlot><Input type="search" value={query} placeholder={W.search} aria-label={W.search}
        onChange={e => { setQuery(e.target.value); pagination.resetPage(); }} /></SearchSlot>}
      onReset={query || type || match ? () => { setQuery(""); setType(""); setMatch(""); pagination.resetPage(); } : undefined}
      actions={<>
        <Button size="xl" variant="outline" disabled={pending || !props.canSync || !props.feedConfigured}
          title={!props.feedConfigured ? W.syncDisabled : undefined} onClick={() => run(props.onSync)}><Icon name="refresh" size="xs" />{W.sync}</Button>
        <Button size="xl" disabled={pending || !props.canTriage} onClick={() => openDialog({ kind: "register" })}><Icon name="plus" size="xs" />{W.register}</Button>
      </>}>
      <FilterSlot><NativeSelect value={type} aria-label={W.allTypes} onChange={e => { setType(e.target.value); pagination.resetPage(); }}>
        <option value="">{W.allTypes}</option>{SIGNAL_TYPES.map(t => <option key={t} value={t}>{SIGNAL_TYPE_LABEL[t]}</option>)}
      </NativeSelect></FilterSlot>
      <FilterSlot><NativeSelect value={match} aria-label={W.allAccounts} onChange={e => { setMatch(e.target.value); pagination.resetPage(); }}>
        <option value="">{W.allAccounts}</option><option value="unmatched">{W.unmatched}</option><option value="matched">{W.matched}</option>
      </NativeSelect></FilterSlot>
    </FilterBar>
    <p className="text-body-small text-muted-foreground" title={W.feedHint}>{props.feedConfigured ? W.feedReady : W.feedOff}</p>
    {props.relatedReadFailed ? <p role="status" className="text-body-small text-muted-foreground">{W.dataUnavailable}</p> : null}
    {error && !dialog ? <p role="alert" className="text-body-small text-destructive">{error}</p> : null}
    {receipt?.leadId ? <p role="status" className="flex items-center gap-sm text-body-small text-success-text">{W.promoteSuccess}
      <Button asChild size="xl" variant="outline"><Link href={`/lead?search=${encodeURIComponent(receipt.leadNo ?? "")}`}>{W.openLead}</Link></Button></p> : null}
    {receipt?.recorded !== undefined ? <p role="status" className="text-body-small text-muted-foreground">{W.sync} +{receipt.recorded} / {T.markDuplicate} {receipt.duplicates ?? 0}</p> : null}
    {filtered.length === 0 ? <EmptyState title={all.length ? W.filteredEmpty : W.empty} description={all.length ? W.filteredEmptyHint : W.emptyHint} /> : null}
    {props.groups.map(g => ({ ...g, items: g.items.filter(s => shown.has(s.record.id)) })).filter(g => g.items.length).map(g => (
      <Collapsible key={g.key} defaultOpen><PanelCard className={COLLAPSED_PANEL_CLASS} title={g.title} description={g.why}
        action={<CollapsibleTrigger asChild><Button size="xl" variant="ghost">{T.groupCount(g.items.length)}<Icon name="chevron-down" size="xs" /></Button></CollapsibleTrigger>}>
        <CollapsibleContent><PanelList>{g.items.map(s => <SignalRow key={s.record.id} signal={s} props={props} names={names}
          suggestion={suggestions.find(match => match.signalId === s.record.id)}
          open={openId === s.record.id} pending={pending} onToggle={() => setOpenId(openId === s.record.id ? "" : s.record.id)}
          onDialog={kind => openDialog({ kind, signal: s, suggestedId: suggestions.find(match => match.signalId === s.record.id)?.accountId })} onAct={action => run(() => props.onAct(s.record.id, action))} />)}</PanelList></CollapsibleContent>
      </PanelCard></Collapsible>
    ))}
    {filtered.length ? <PaginationFooter pagination={pagination} total={all.length} filteredTotal={filtered.length} /> : null}
    {dialog ? <SignalDialog key={`${dialog.kind}-${dialog.signal?.record.id ?? "new"}`} dialog={dialog} accounts={props.accounts}
      pending={pending} error={error} onClose={() => { if (!pending) { setDialog(null); setError(null); } }}
      onSubmit={input => run(() => dialog.kind === "register" ? props.onRegister(input)
        : dialog.kind === "promote" ? props.onPromote(dialog.signal!.record.id, input.companyName)
        : dialog.kind === "match" ? props.onMatch(dialog.signal!.record.id, input.accountId!)
        : props.onDismiss(dialog.signal!.record.id, input.reason as ExitReason, input.note || null), () => setDialog(null))} /> : null}
  </Section>;
}

function SignalRow({ signal: s, props, names, suggestion, open, pending, onToggle, onDialog, onAct }: {
  signal: QueueSignal; props: SignalQueueProps; names: Readonly<Record<string, string>>;
  suggestion?: AccountMatchProposal;
  open: boolean; pending: boolean; onToggle: () => void;
  onDialog: (kind: "match" | "promote" | "dismiss") => void; onAct: (action: SignalAction) => void;
}) {
  const { SIGNAL_TEXT: T, SIGNAL_WORKSPACE_TEXT: W, SIGNAL_STATUS_LABEL, SIGNAL_TYPE_LABEL, SIGNAL_PANEL_TEXT } = useMessages();
  const locale = useLocale();
  const r = s.record, active = isPendingSignal(r);
  const score = s.recomputed, tone = confidenceTone(score);
  const brief = signalText(r.payload, "summary", "abstract", "description", "brief");
  const company = (r.accountId ? names[r.accountId] : null) ?? signalText(r.payload, "company_name", "companyName");
  const sourceUrl = signalSourceUrl(r);
  const sourceName = r.source === "manual" ? W.manual : r.source === "campaign" ? props.campaignNames[r.sourceRef ?? ""] ?? SIGNAL_PANEL_TEXT.sourceLabel.campaign
    : sourceUrl ? new URL(sourceUrl).host : SIGNAL_PANEL_TEXT.sourceLabel[r.source] ?? W.evidence;
  const amount = r.payload.amount ?? r.payload.budget;
  const deadline = signalText(r.payload, "deadline", "bid_deadline");
  const lead = props.leadBySignal[r.id];
  const needsScore = r.status !== "scored" || r.score === null;
  return <div id={`signal-${r.id}`} className="flex min-w-0 items-start gap-md py-sm">
    <ScoreRing score={score} tone={tone} label={`${W.currentScore} ${score ?? "-"}`} />
    <div className="flex min-w-0 flex-1 flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-xs">
        <Tag>{SIGNAL_TYPE_LABEL[r.signalType]}</Tag>{active ? <StatusBadge tone="info">{SIGNAL_STATUS_LABEL[r.status]}</StatusBadge> : <Tag>{SIGNAL_STATUS_LABEL[r.status]}</Tag>}
        {!r.accountId ? <StatusBadge tone="brand">{W.unmatched}</StatusBadge> : null}
        <p className="min-w-0 text-body text-foreground">{r.subject}</p>
      </div>
      {company ? <p className="text-body-small text-muted-foreground">{company}</p> : r.accountId ? <p className="text-body-small text-muted-foreground">{W.accountUnavailable}</p> : null}
      <p className="max-w-(--vx-container-2xl) line-clamp-2 text-body-small text-muted-foreground">{brief ?? W.evidenceMissing}</p>
      {suggestion ? <div className="flex flex-wrap items-center gap-sm text-body-small text-muted-foreground"><span>{T.scoutMatch(suggestion.accountName)}</span>
        <Button size="md" variant="secondary" disabled={pending || !props.canTriage} onClick={() => onDialog("match")}>{T.scoutMatchAccept}</Button></div> : null}
      <div className="flex flex-wrap items-center gap-x-md gap-y-xs text-body-small text-muted-foreground">
        <span>{r.detectedAt.toISOString().slice(0, 10)} · {sourceName}</span>
        {deadline ? <span>{T.fieldDeadline(deadline)}</span> : null}
        {typeof amount === "number" && Number.isFinite(amount) ? <span>{T.fieldAmount(formatNumber(amount, locale))}</span> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-xs pt-2xs">
        {sourceUrl ? <Button asChild size="xl" variant="ghost"><a href={sourceUrl} target="_blank" rel="noopener noreferrer">{W.source}<Icon name="external-link" size="xs" /></a></Button> : null}
        <Button size="xl" variant="ghost" aria-expanded={open} onClick={onToggle}>{W.evidence}<Icon name={open ? "chevron-up" : "chevron-down"} size="xs" /></Button>
        {active ? <>
          {needsScore ? <Button size="xl" variant="outline" disabled={pending || !props.canRescore} title={!props.canRescore ? T.noRescorePermission : undefined} onClick={() => onAct("rescore")}>{T.rescore}</Button> : null}
          <Button size="xl" disabled={pending || !props.canPromote || needsScore}
            title={needsScore ? W.promoteNeedsScore : !props.canPromote ? W.promoteNoPermission : undefined} onClick={() => onDialog("promote")}>{T.promote}</Button>
          <Button size="xl" variant="outline" disabled={pending || !props.canTriage} onClick={() => onDialog("dismiss")}>{T.dismiss}</Button>
          <ActionMenu label={T.rowMenu} align="end" items={[
            { id: "match", label: W.match, icon: "users", disabled: pending || !props.canTriage || !props.accounts.length, onSelect: () => onDialog("match") },
            { id: "duplicate", label: T.markDuplicate, icon: "copy", disabled: pending || !props.canTriage, onSelect: () => onAct("duplicate") },
            { id: "rescore", label: T.rescore, icon: "refresh", disabled: pending || !props.canRescore, hint: props.canRescore ? undefined : T.noRescorePermission, onSelect: () => onAct("rescore") },
          ]} />
        </> : lead ? <Button asChild size="xl" variant="outline"><Link href={`/lead?search=${encodeURIComponent(lead.no)}`}>{W.openLead}</Link></Button> : <span className="text-body-small text-muted-foreground">{W.completed}</span>}
      </div>
      {open ? <div className="mt-xs rounded-md border border-border bg-muted/40 p-md">
        {brief ? <p className="mb-sm whitespace-pre-wrap text-body-small text-foreground">{brief}</p> : null}
        <p className="text-body-small text-muted-foreground">{W.ruleHint}</p>
        <div className="mt-sm grid grid-cols-2 gap-md lg:grid-cols-4">
          <LabeledValue label={W.currentScore} value={score ?? "-"} tone={tone} />
          <LabeledValue label={W.recordedScore} value={r.score ?? "-"} />
          <LabeledValue label={T.bdAge} value={Math.floor(s.ageDays)} />
          <LabeledValue label={W.account} value={r.accountId ? names[r.accountId] ?? W.accountUnavailable : W.unmatched} />
        </div>
        <p className="mt-sm border-t border-border pt-sm text-body-small text-muted-foreground">{T.scoreExplain(s.baseWeight, s.decay, s.bonus)}</p>
      </div> : null}
    </div>
  </div>;
}

type DialogInput = SignalRegistration & { reason: string; note: string };
function SignalDialog({ dialog, accounts, pending, error, onClose, onSubmit }: {
  dialog: Dialog; accounts: readonly Account[]; pending: boolean; error: string | null;
  onClose: () => void; onSubmit: (input: DialogInput) => void;
}) {
  const { DS_LABELS, SIGNAL_WORKSPACE_TEXT: W, SIGNAL_TEXT: T, SIGNAL_TYPE_LABEL, EXIT_REASON_LABEL } = useMessages();
  const [form, setForm] = useState<DialogInput>(() => ({
    requestId: crypto.randomUUID(), subject: "", signalType: "intent", summary: "",
    companyName: accounts.find(a => a.id === dialog.signal?.record.accountId)?.name ?? signalText(dialog.signal?.record.payload ?? {}, "company_name", "companyName") ?? "",
    accountId: dialog.signal?.record.accountId ?? dialog.suggestedId ?? "", detectedAt: new Date().toISOString().slice(0, 10), reason: "", note: "",
  }));
  const update = <K extends keyof DialogInput>(key: K, value: DialogInput[K]) => setForm(f => ({ ...f, [key]: value }));
  const titles = { register: W.register, promote: W.promoteTitle, match: W.matchTitle, dismiss: T.dismiss };
  const descriptions = { register: W.registerHint, promote: W.promoteHint, match: W.matchHint, dismiss: T.dismissWhy };
  const labels = { register: W.register, promote: W.promoteConfirm, match: W.matchConfirm, dismiss: T.dismiss };
  const count = (value: string, max: number) => <span className="text-body-small text-muted-foreground tabular-nums">{value.length}/{max}</span>;
  const disabled = pending || (dialog.kind === "match" ? !form.accountId : dialog.kind === "dismiss" ? !form.reason || (form.reason === "other" && !form.note.trim()) : !form.companyName.trim());
  return <Drawer open width="md" title={titles[dialog.kind]} description={descriptions[dialog.kind]} onClose={onClose}
    footer={<div className="flex items-center justify-end gap-sm pb-[calc(var(--space-6xl)-var(--space-lg)+env(safe-area-inset-bottom,0px))]">
      <Button size="xl" variant="secondary" disabled={pending} onClick={onClose}>{DS_LABELS.confirmCancel}</Button>
      {dialog.kind === "dismiss" ? <Button size="xl" type="submit" form="signal-decision-form" disabled={disabled}
        variant="destructive" confirmExempt={descriptions.dismiss}>{pending ? DS_LABELS.confirmPending : labels.dismiss}</Button>
        : <Button size="xl" type="submit" form="signal-decision-form" disabled={disabled}>{pending ? DS_LABELS.confirmPending : labels[dialog.kind]}</Button>}
    </div>}>
    <form id="signal-decision-form" data-business-fields className="flex flex-col gap-md pb-[calc(var(--space-6xl)+env(safe-area-inset-bottom,0px))]" onSubmit={e => { e.preventDefault(); if (!disabled) onSubmit(form); }}>
    {error ? <p role="alert" className="text-body-small text-destructive">{error}</p> : null}
    {dialog.kind === "register" || dialog.kind === "match" ? <Field><FieldLabel>{W.account}</FieldLabel>
      <Combobox items={[{ value: "", label: W.chooseAccount }, ...accounts.map(a => ({ value: a.id, label: a.name }))]}
        value={form.accountId ?? ""} placeholder={W.chooseAccount} onValueChange={id => {
          setForm(f => ({ ...f, accountId: id, companyName: accounts.find(a => a.id === id)?.name ?? f.companyName }));
        }} /></Field> : null}
    {dialog.kind === "register" || dialog.kind === "promote" ? <Field>
      <FieldLabel className="flex justify-between">{W.company} * {count(form.companyName, SIGNAL_INPUT_LIMITS.companyName)}</FieldLabel>
      <Input required maxLength={SIGNAL_INPUT_LIMITS.companyName} value={form.companyName} aria-label={W.company} onChange={e => update("companyName", e.target.value)} />
    </Field> : null}
    {dialog.kind === "register" ? <>
      <Field><FieldLabel className="flex justify-between">{W.subject} * {count(form.subject, SIGNAL_INPUT_LIMITS.subject)}</FieldLabel>
        <Input required maxLength={SIGNAL_INPUT_LIMITS.subject} value={form.subject} aria-label={W.subject} onChange={e => update("subject", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-md">
        <Field><FieldLabel>{T.columnType}</FieldLabel><NativeSelect value={form.signalType} aria-label={T.columnType} onChange={e => update("signalType", e.target.value as SignalRegistration["signalType"])}>
          {SIGNAL_TYPES.map(type => <option key={type} value={type}>{SIGNAL_TYPE_LABEL[type]}</option>)}</NativeSelect></Field>
        <Field><FieldLabel>{W.detectedAt} *</FieldLabel><Input required type="date" value={form.detectedAt} aria-label={W.detectedAt} onChange={e => update("detectedAt", e.target.value)} /></Field>
      </div>
      <Field><FieldLabel className="flex justify-between">{W.summary} * {count(form.summary, SIGNAL_INPUT_LIMITS.summary)}</FieldLabel>
        <Textarea required rows={3} maxLength={SIGNAL_INPUT_LIMITS.summary} value={form.summary} aria-label={W.summary} onChange={e => update("summary", e.target.value)} /></Field>
      <Field><FieldLabel>{W.sourceUrl}</FieldLabel><Input type="url" maxLength={SIGNAL_INPUT_LIMITS.sourceUrl} value={form.sourceUrl ?? ""} aria-label={W.sourceUrl} onChange={e => update("sourceUrl", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-md">
        <Field><FieldLabel>{W.deadline}</FieldLabel><Input type="date" value={form.deadline ?? ""} aria-label={W.deadline} onChange={e => update("deadline", e.target.value)} /></Field>
        <Field><FieldLabel>{W.amount}</FieldLabel><Input type="number" min="0" step="0.01" value={form.amount ?? ""} aria-label={W.amount} onChange={e => update("amount", e.target.value)} /></Field>
      </div>
    </> : null}
    {dialog.kind === "dismiss" ? <>
      <Field><FieldLabel>{T.dismissReason} *</FieldLabel><NativeSelect required value={form.reason} aria-label={T.dismissReason} onChange={e => update("reason", e.target.value)}>
        <option value="">{T.dismissReasonPick}</option>{SIGNAL_DISMISS_REASONS.map(reason => <option key={reason} value={reason}>{EXIT_REASON_LABEL[reason]}</option>)}</NativeSelect></Field>
      <Field><FieldLabel className="flex justify-between">{T.dismissNote}{count(form.note, 500)}</FieldLabel><Textarea rows={2} maxLength={500} required={form.reason === "other"}
        value={form.note} aria-label={T.dismissNote} onChange={e => update("note", e.target.value)} /></Field>
    </> : null}
    </form>
  </Drawer>;
}
