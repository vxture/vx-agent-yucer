"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, CardContent, Drawer, Field, FieldLabel, Input, NativeSelect, Progress, StatusBadge } from "@vxture/design-ui";
import { Section } from "./help-section";
import { MemberName } from "../lib/member-names";
import { useMessages, useLocale } from "../lib/i18n/provider";
import type { FulfillmentRow } from "../lib/strategy-fulfillment";
import { recordStrategicResult } from "../attainment/strategy-actions";
import metricLayout from "./strategy-metric-groups.module.css";

export function StrategyFulfillmentPanel({ rows, canRecord = false }: { rows: FulfillmentRow[] | null; canRecord?: boolean }) {
  const { STRATEGY_HANDOFF_TEXT: T, PLAN_VERSION_ERROR: E } = useMessages(), locale = useLocale();
  const [selected, setSelected] = useState<FulfillmentRow | null>(null), [allocation,setAllocation] = useState("");
  const [achievedOn,setDate] = useState(new Date().toISOString().slice(0,10)), [url,setUrl] = useState(""), [note,setNote] = useState(""), [error,setError] = useState("");
  const [pending,start] = useTransition(); const router = useRouter();
  if (rows === null || rows.length === 0) return null;
  const format = (v:string) => Number(v).toLocaleString(locale,{maximumFractionDigits:2});
  const submit = (voidsId?:string) => {
    if (!selected) return;
    const old = selected.evidence.find(e => e.id === voidsId);
    start(async () => {
      setError("");
      try {
        const result = await recordStrategicResult({ id:crypto.randomUUID(),year:selected.year,revisionId:old?.revisionId ?? selected.revisionId,acceptanceKey:old?.acceptanceKey ?? selected.acceptance.key,allocationKey:old?.allocationKey ?? allocation,achievedOn,evidenceUrl:url,note:note.trim(),voidsId });
        if (!result.ok) { setError(E[result.error ?? ""] ?? T.error); return; }
        setSelected(null); setUrl(""); setNote(""); router.refresh();
      } catch { setError(T.error); }
    });
  };
  return <Section className="@container" title={T.progress} icon="flag" help={T.resultHelp}>
    <div className="grid gap-md" data-strategic-fulfillment>{[...new Set(rows.map(r => r.revisionId+"|"+r.acceptance.lineageId))].map(key => {
      const group = rows.filter(r => r.revisionId+"|"+r.acceptance.lineageId === key), first = group[0]!;
      return <Card key={key}><CardContent className="flex flex-col gap-lg pt-lg">
        <div className="flex flex-wrap items-center justify-between gap-md"><Link href={`/strategy/${first.acceptance.strategyId}`} className="text-body font-medium transition-colors hover:text-primary">{first.acceptance.name}<span className="ml-sm text-body-small font-normal text-muted-foreground">{first.year} · V{first.acceptance.version}</span></Link><div className="flex items-center gap-md"><MemberName sub={first.acceptance.ownerSub}/><Button asChild variant="ghost" size="md"><Link href={`/planning?year=${first.year}&revision=${first.revisionId}`}>{T.openPlan}</Link></Button></div></div>
        <div className={metricLayout.groups}>{group.map(row => {const x=row.acceptance,pct=row.actual !== null && Number(row.target)>0 ? Number(row.actual)/Number(row.target)*100 : 0; return <div key={x.key} className="flex min-w-0 flex-col gap-sm" data-strategic-fulfillment-metric>
          <div className="flex h-control-sm items-center justify-between gap-md text-body-small text-muted-foreground"><span>{x.expectation.metric === "revenue" ? T.won : T[x.expectation.metric]}</span>{x.expectation.metric !== "revenue" ? <Button size="sm" variant="ghost" onClick={() => {setSelected(row);setAllocation(row.allocations[0]?.key ?? "");setError("");setNote("");}}>{T.results}</Button> : null}</div>
          <div className="text-heading-3 tabular-nums">{row.actual === null ? T.unknown : format(row.actual)} <span className="text-body-small font-normal text-muted-foreground">/ {format(row.target)} {x.expectation.currency ?? T.count}</span></div><Progress value={row.actual === null ? null : Math.min(100,pct)} aria-label={T.progress}/>
        </div>;})}</div>
      </CardContent></Card>;
    })}</div>
    <Drawer open={!!selected} onClose={() => setSelected(null)} width="md" title={T.results}>
      {selected ? <div className="flex flex-col gap-lg pb-xl"><p className="text-body">{selected.acceptance.name} · {T[selected.acceptance.expectation.metric]}</p><p className="text-body-small text-muted-foreground">{selected.acceptance.note || selected.acceptance.expectation.criterion}</p>
        {canRecord && selected.allocations.length ? <>
          <Field><FieldLabel htmlFor="result-allocation">{T.allocation}</FieldLabel><NativeSelect id="result-allocation" value={allocation} onChange={e => setAllocation(e.target.value)}>{selected.allocations.map(a => <option key={a.key} value={a.key}>{a.regionName} · {a.period}</option>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="result-date">{T.date}</FieldLabel><Input id="result-date" type="date" max={new Date().toISOString().slice(0,10)} value={achievedOn} onChange={e => setDate(e.target.value)}/></Field>
          <Field><FieldLabel htmlFor="result-evidence">{T.evidence}</FieldLabel><Input id="result-evidence" type="url" placeholder={T.evidenceExample} maxLength={2000} value={url} onChange={e => setUrl(e.target.value)}/></Field>
          <Field><FieldLabel htmlFor="result-note">{T.memo}</FieldLabel><Input id="result-note" maxLength={2000} value={note} onChange={e => setNote(e.target.value)}/></Field>
          <Button data-control-kind="drawer-action" size="xl" disabled={pending || !allocation || !url.trim() || !note.trim()} onClick={() => submit()}>{T.record}</Button>
        </> : canRecord ? <p className="text-body-small text-muted-foreground">{T.allocateFirst}</p> : null}
        {canRecord && !selected.allocations.length && selected.evidence.some(e => !e.voidsId) ? <Field><FieldLabel htmlFor="result-note">{T.memo}</FieldLabel><Input id="result-note" maxLength={2000} value={note} onChange={e => setNote(e.target.value)}/></Field> : null}
        {error ? <StatusBadge tone="danger">{error}</StatusBadge> : null}
        <div className="flex flex-col gap-md border-t border-dashed border-border pt-lg">{selected.evidence.length ? selected.evidence.filter(e => !e.voidsId).map(e => { const revoked = selected.evidence.some(v => v.voidsId === e.id); return <div key={e.id} className="flex items-start justify-between gap-md"><div className="flex min-w-0 flex-col gap-xs"><a href={e.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-body transition-colors hover:text-primary">{e.note}</a><span className="text-body-small text-muted-foreground">{e.achievedOn} · <MemberName sub={e.actorSub}/>{revoked ? ` · ${T.revoke}` : ""}</span></div>{canRecord && !revoked ? <Button size="md" variant="ghost" disabled={pending || !note.trim()} title={T.memo} onClick={() => submit(e.id)}>{T.revoke}</Button> : null}</div>; }) : <p className="text-body-small text-muted-foreground">{T.noEvidence}</p>}</div>
      </div> : null}
    </Drawer>
  </Section>;
}
