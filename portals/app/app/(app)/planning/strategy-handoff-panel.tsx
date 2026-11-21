"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, CardContent } from "@vxture/design-ui";
import { Section } from "../components/help-section";
import { MemberName } from "../lib/member-names";
import { useMessages, useLocale } from "../lib/i18n/provider";
import type { PlanContent } from "../../domains/planning/plan-model";
import type { PlanSources } from "./plan-data";
import { validateStrategyAcceptances, type StrategyAcceptance } from "../../domains/planning/strategy-handoff";
import { expectationWindow } from "../../domains/strategy/lib/expectations";
import metricLayout from "../components/strategy-metric-groups.module.css";
import { StrategyHandoffDrawer } from "./strategy-handoff-drawer";

export function StrategyHandoffPanel({ content, sources, edit, regionId, disabled, lockedPeriods = [] }: { content: PlanContent; sources: PlanSources; edit: ((c: PlanContent) => void) | null; regionId?: string | null; disabled?: boolean; lockedPeriods?: string[] }) {
  const { STRATEGY_HANDOFF_TEXT: T } = useMessages(), locale = useLocale();
  const [draft, setDraft] = useState<StrategyAcceptance | null>(null);
  const [error, setError] = useState("");
  // The selected view owns presentation; releaseScope only guards edits.
  const company = !regionId;
  const canEdit = !!edit && (company ? content.releaseScope !== "regions" : content.releaseScope !== "company");
  const rows = (content.strategyAcceptances ?? []).filter(x => !regionId || canEdit || x.allocations.some(a => a.regionId === regionId));
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
        <div className={metricLayout.groups}>{group.map(x => {
          const allocated = x.allocations.filter(a => !regionId || a.regionId === regionId).reduce((n,a) => n+Number(a.amount),0);
          return <div key={x.key} className="flex min-w-0 flex-col gap-sm" data-strategy-acceptance-metric>
            <div className="flex items-center justify-between gap-sm"><span className="text-body-small text-muted-foreground">{x.expectation.metric === "revenue" ? T.revenueTarget : T[x.expectation.metric]}</span><Button size="sm" variant="ghost" disabled={disabled} onClick={() => {setError(""); setDraft(structuredClone(x));}}>{canEdit ? (company ? T.edit : T.editAllocation) : (company ? T.acceptanceDetails : T.details)}</Button></div>
            <strong className="text-heading-3 tabular-nums">{format(regionId ? String(allocated) : x.amount)}<span className="ml-sm text-body-small font-normal text-muted-foreground">{x.expectation.currency ?? T.count}</span></strong>
            <div className="flex flex-wrap gap-x-lg gap-y-xs text-body-small text-muted-foreground"><span>{T.expected} {format(x.expectation.amount)}</span>{company ? <span>{T.accepted} {format(x.amount)}</span> : <><span>{T.allocated} {format(String(allocated))}</span><span>{T.unallocated} {format(String(Math.max(0,Number(x.amount)-x.allocations.reduce((n,a) => n+Number(a.amount),0))))}</span></>}</div>
          </div>;
        })}</div>
      </CardContent></Card>;
    })}</div> : <p className="text-body-small text-muted-foreground">{sources.canStrategy ? (options.length ? T.none : T.noSources) : T.sourceDenied}</p>}
    {draft ? <StrategyHandoffDrawer draft={draft} content={content} members={sources.members} regionId={regionId}
      options={options.map(o => ({ value: o.value, label: `${o.p.name} \u00b7 V${o.p.versionNo} \u00b7 ${T[o.e.metric]}` }))}
      canEdit={canEdit} disabled={disabled} lockedPeriods={lockedPeriods} error={error}
      onChange={setDraft} onSourceChange={start} onSave={() => upsert(draft)} onClose={() => setDraft(null)}
      onRemove={() => { edit?.({ ...content, strategyAcceptances: (content.strategyAcceptances ?? []).filter(x => x.key !== draft.key) }); setDraft(null); }}/>
    : null}
  </Section>;
}
