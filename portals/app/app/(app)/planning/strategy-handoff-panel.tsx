"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, CardContent, Drawer, Field, FieldLabel, Input, NativeSelect, StatusBadge } from "@vxture/design-ui";
import { Section } from "../components/help-section";
import { MemberPicker } from "../components/member-picker";
import { MemberName } from "../lib/member-names";
import { useMessages, useLocale } from "../lib/i18n/provider";
import type { PlanContent } from "../../domains/planning/plan-model";
import type { PlanSources } from "./plan-data";
import { validateStrategyAcceptances, type StrategyAcceptance } from "../../domains/planning/strategy-handoff";
import { allocateStrategicTarget } from "../../domains/planning/strategy-autofill";
import { expectationWindow } from "../../domains/strategy/lib/expectations";

export function StrategyHandoffPanel({ content, sources, edit, regionId, disabled, lockedPeriods = [] }: { content: PlanContent; sources: PlanSources; edit: ((c: PlanContent) => void) | null; regionId?: string | null; disabled?: boolean; lockedPeriods?: string[] }) {
  const { STRATEGY_HANDOFF_TEXT: T } = useMessages(), locale = useLocale();
  const [draft, setDraft] = useState<StrategyAcceptance | null>(null);
  const [error, setError] = useState("");
  // The selected view owns presentation; releaseScope only guards edits.
  const company = !regionId;
  const canEdit = !!edit && (company ? content.releaseScope !== "regions" : content.releaseScope !== "company");
  const rows = (content.strategyAcceptances ?? []).filter(x => !regionId || x.allocations.some(a => a.regionId === regionId));
  const options = (sources.strategies ?? []).filter(p => expectationWindow(p.period, content.year)).flatMap(p => (p.expectations ?? []).map(e => ({ p, e, value: `${p.id}|${e.id}` })));
  const format = (value: string) => Number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  const start = (value: string) => {
    const o = options.find(x => x.value === value); if (!o) return;
    const existing = (content.strategyAcceptances ?? []).find(x => x.lineageId === (o.p.lineageId ?? o.p.id) && x.expectation.metric === o.e.metric);
    const revenue = content.targets.find(t => t.scope === "workspace" && t.period === `Y${content.year}` && t.metric === "revenue" && t.currency === o.e.currency);
    const used = (content.strategyAcceptances ?? []).filter(x => x.key !== existing?.key && x.expectation.metric === "revenue" && x.expectation.currency === o.e.currency).reduce((n,x) => n + Number(x.amount), 0);
    const w = expectationWindow(o.p.period, content.year)!;
    // A multi-year expectation is proposed pro-rata; users explicitly accept the annual value.
    const annualDays = (Date.parse(w.end) - Date.parse(w.start)) / 86400000 + 1;
    const full = o.p.period.includes("/") ? o.p.period.split("/") : null;
    const fullDays = full ? (Date.parse(full[1]!) - Date.parse(full[0]!)) / 86400000 + 1 : annualDays;
    const proposed = Math.round(Number(o.e.amount) * annualDays / fullDays * 100) / 100;
    const amount = o.e.metric === "revenue" ? Math.max(0, Math.min(proposed, Number(revenue?.target ?? 0) - used)) : Math.floor(proposed);
    setDraft({ key: existing?.key ?? crypto.randomUUID(), strategyId: o.p.id, lineageId: o.p.lineageId ?? o.p.id, version: o.p.versionNo!, name: o.p.name, period: o.p.period, expectation: o.e, amount: existing?.amount ?? String(amount), ownerSub: existing?.ownerSub ?? o.p.ownerSub ?? sources.currentSub ?? null, note: existing?.note ?? "", allocations: existing?.allocations ?? [] });
  };
  const allocationCells = draft ? content.regions.filter(r => r.included).flatMap(r => content.periods.filter(p => {
    const window = expectationWindow(draft.period, content.year);
    return window && p.parent === `Y${content.year}` && p.start <= window.end && window.start < p.end;
  }).map(p => ({ regionId:r.id,period:p.key,name:r.name,ownerSub:r.ownerSub }))) : [];
  const unallocatedCells = allocationCells.filter(cell => !lockedPeriods.includes(cell.period) && !draft?.allocations.some(a => a.regionId === cell.regionId && a.period === cell.period));
  const upsert = (x: StrategyAcceptance) => {
    const previous = content.strategyAcceptances ?? [];
    const next = { ...content, strategyAcceptances:previous.some(y => y.key === x.key) ? previous.map(y => y.key === x.key ? x : y) : [...previous,x] };
    if (!canEdit || disabled) return;
    try { validateStrategyAcceptances(next, false); edit?.(next); setError(""); setDraft(null); }
    catch { setError(T.validation); }
  };
  const groups = [...new Set(rows.map(x => x.strategyId))].map(id => rows.filter(x => x.strategyId === id));
  return <Section className="@container" title={T.handoff} icon="workflow" help={company ? T.companyHelp : T.allocationHelp} action={canEdit && company && sources.canStrategy ? <Button size="md" variant="secondary" disabled={disabled || !options.length} onClick={() => start(options[0]?.value ?? "")}>{T.accept}</Button> : undefined}>
    {rows.length ? <div className="grid gap-md" data-strategy-acceptances>{groups.map(group => {
      const first = group[0]!;
      const latest = sources.strategies?.find(p => (p.lineageId ?? p.id) === first.lineageId);
      return <Card key={first.strategyId}><CardContent className="flex flex-col gap-lg pt-lg">
        <div className="flex flex-wrap items-center justify-between gap-md"><Link href={`/strategy/${first.strategyId}`} className="text-body font-medium transition-colors hover:text-primary">{first.name}<span className="ml-sm text-body-small text-muted-foreground">V{first.version} · {first.period}</span></Link>
          <div className="flex items-center gap-md"><MemberName sub={first.ownerSub}/>{latest && latest.id !== first.strategyId ? <span className="text-body-small text-muted-foreground" title={T.updated}>{T.newVersion}</span> : null}</div></div>
        <div className="grid gap-xl @3xl:grid-cols-3">{group.map(x => {
          const allocated = x.allocations.filter(a => !regionId || a.regionId === regionId).reduce((n,a) => n+Number(a.amount),0);
          return <div key={x.key} className="flex min-w-0 flex-col gap-sm" data-strategy-acceptance-metric>
            <div className="flex items-center justify-between gap-sm"><span className="text-body-small text-muted-foreground">{x.expectation.metric === "revenue" ? T.revenueTarget : T[x.expectation.metric]}</span><Button size="sm" variant="ghost" disabled={disabled} onClick={() => {setError(""); setDraft(structuredClone(x));}}>{canEdit ? (company ? T.edit : T.editAllocation) : (company ? T.acceptanceDetails : T.details)}</Button></div>
            <strong className="text-heading-3 tabular-nums">{format(regionId ? String(allocated) : x.amount)}<span className="ml-sm text-body-small font-normal text-muted-foreground">{x.expectation.currency ?? T.count}</span></strong>
            <div className="flex flex-wrap gap-x-lg gap-y-xs text-body-small text-muted-foreground"><span>{T.expected} {format(x.expectation.amount)}</span>{company ? <span>{T.accepted} {format(x.amount)}</span> : <><span>{T.allocated} {format(String(allocated))}</span><span>{T.unallocated} {format(String(Math.max(0,Number(x.amount)-x.allocations.reduce((n,a) => n+Number(a.amount),0))))}</span></>}</div>
          </div>;
        })}</div>
      </CardContent></Card>;
    })}</div> : <p className="text-body-small text-muted-foreground">{sources.canStrategy ? (options.length ? T.none : T.noSources) : T.sourceDenied}</p>}
    <Drawer open={!!draft} onClose={() => setDraft(null)} title={company ? (canEdit ? T.accept : T.acceptanceDetails) : T.allocation} width="md">
      {draft ? <div className="flex flex-col gap-lg pb-xl">
        {company ? <Field><FieldLabel htmlFor="handoff-source">{T.source}</FieldLabel><NativeSelect id="handoff-source" disabled={!canEdit || disabled} value={`${draft.strategyId}|${draft.expectation.id}`} onChange={e => start(e.target.value)}><option value={`${draft.strategyId}|${draft.expectation.id}`}>{draft.name} · V{draft.version} · {T[draft.expectation.metric]}</option>{options.filter(o => o.value !== `${draft.strategyId}|${draft.expectation.id}`).map(o => <option key={o.value} value={o.value}>{o.p.name} · V{o.p.versionNo} · {T[o.e.metric]}</option>)}</NativeSelect></Field> : <p className="text-body">{draft.name} · {T[draft.expectation.metric]}</p>}
        <div className="grid grid-cols-2 gap-md"><Field><FieldLabel htmlFor="handoff-amount">{T.accepted}</FieldLabel><Input id="handoff-amount" inputMode="decimal" disabled={!canEdit || !company || disabled} value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })}/></Field><Field><FieldLabel>{T.owner}</FieldLabel><MemberPicker label={T.owner} value={draft.ownerSub ?? ""} options={sources.members.map(m => ({ value:m.sub,label:m.name }))} onValueChange={sub => setDraft({ ...draft, ownerSub: sub || null })} disabled={!canEdit || !company || disabled}/></Field></div>
        {company ? <Field><FieldLabel htmlFor="handoff-note">{draft.expectation.metric === "revenue" ? T.note : T.criterion}</FieldLabel><Input id="handoff-note" placeholder={draft.expectation.metric === "revenue" ? undefined : draft.expectation.criterion || T.criterionExample} disabled={!canEdit || disabled} maxLength={1000} value={draft.note} onChange={e => setDraft({ ...draft, note:e.target.value })}/></Field> : <>
          <div className="flex flex-wrap items-center justify-between gap-sm"><span className="text-body-small text-muted-foreground">{T.allocation}</span>{canEdit ? <div className="flex gap-sm"><Button size="md" variant="secondary" disabled={disabled || !!lockedPeriods.length} onClick={() => setDraft(allocateStrategicTarget(content, draft, () => crypto.randomUUID()))}>{T.auto}</Button><Button size="md" variant="secondary" disabled={disabled || !unallocatedCells.length} onClick={() => { const cell = unallocatedCells[0]; if (cell) setDraft({ ...draft,allocations:[...draft.allocations,{key:crypto.randomUUID(),regionId:cell.regionId,period:cell.period,amount:"0",ownerSub:cell.ownerSub ?? draft.ownerSub}] }); }}>{T.addAllocation}</Button></div> : null}</div>
          <div className="flex flex-col gap-md">{draft.allocations.map(a => {
            const locked = lockedPeriods.includes(a.period);
            return <div key={a.key} className="flex flex-col gap-md rounded-lg border border-border p-md">
              <div className="flex items-center gap-sm"><NativeSelect aria-label={T.allocation} disabled={!canEdit || locked || disabled} value={`${a.regionId}|${a.period}`} onChange={e => { const [regionId,period] = e.target.value.split("|"); if (regionId && period) setDraft({ ...draft,allocations:draft.allocations.map(y => y.key === a.key ? {...y,regionId,period} : y) }); }}>{allocationCells.filter(cell => cell.regionId === a.regionId && cell.period === a.period || !lockedPeriods.includes(cell.period) && !draft.allocations.some(y => y.key !== a.key && y.regionId === cell.regionId && y.period === cell.period)).map(cell => <option key={`${cell.regionId}|${cell.period}`} value={`${cell.regionId}|${cell.period}`}>{cell.name} · {cell.period}</option>)}</NativeSelect>{canEdit ? <Button size="sm" variant="ghost" disabled={locked || disabled} onClick={() => setDraft({...draft,allocations:draft.allocations.filter(y => y.key !== a.key)})}>{T.removeAllocation}</Button> : null}</div>
              <div className="grid grid-cols-2 gap-md"><Field><FieldLabel>{T.value}</FieldLabel><Input disabled={!canEdit || locked || disabled} aria-label={`${T.value} ${a.period}`} inputMode="decimal" value={a.amount} onChange={e => setDraft({ ...draft, allocations: draft.allocations.map(y => y.key === a.key ? { ...y, amount:e.target.value } : y) })}/></Field><Field><FieldLabel>{T.owner}</FieldLabel><MemberPicker label={T.owner} disabled={!canEdit || locked || disabled} value={a.ownerSub ?? ""} options={sources.members.map(m => ({ value:m.sub,label:m.name }))} onValueChange={sub => setDraft({ ...draft, allocations:draft.allocations.map(y => y.key === a.key ? { ...y, ownerSub:sub || null } : y) })}/></Field></div>
            </div>;
          })}</div>
        </>}
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
        <div className="flex flex-wrap gap-sm">{canEdit ? <Button size="md" disabled={disabled} onClick={() => upsert(draft)}>{T.save}</Button> : null}<Button size="md" variant="secondary" onClick={() => setDraft(null)}>{T.cancel}</Button>{canEdit && company && !draft.allocations.length ? <Button size="md" variant="ghost" disabled={disabled} onClick={() => { edit?.({ ...content, strategyAcceptances:(content.strategyAcceptances ?? []).filter(x => x.key !== draft.key) }); setDraft(null); }}>{T.remove}</Button> : null}</div>
      </div> : null}
    </Drawer>
  </Section>;
}
