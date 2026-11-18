"use client";
import { Card, CardContent, Field, FieldLabel, Input } from "@vxture/design-ui";
import { Section } from "./help-section";
import { useMessages, useLocale } from "../lib/i18n/provider";
import { STRATEGIC_METRICS, type StrategicExpectation, type StrategicMetric } from "../../domains/strategy/lib/expectations";

export function StrategyExpectations({ value, onChange }: { value: readonly StrategicExpectation[]; onChange?: (value: readonly StrategicExpectation[]) => void }) {
  const { STRATEGY_HANDOFF_TEXT: T } = useMessages();
  const locale = useLocale();
  const change = (metric: StrategicMetric, patch: Partial<StrategicExpectation>) => {
    const old = value.find(x => x.metric === metric);
    const next = { id: old?.id ?? crypto.randomUUID(), metric, amount: "0", currency: metric === "revenue" ? "CNY" : null, criterion: "", ...old, ...patch };
    onChange?.([...value.filter(x => x.metric !== metric), ...(next.amount === "" ? [] : [next])]);
  };
  return <Section className="@container" title={T.title} icon="chart-line-up" help={T.help}>
    <div className="grid gap-lg @3xl:grid-cols-3" data-strategy-expectations>
      {STRATEGIC_METRICS.map(metric => { const x = value.find(x => x.metric === metric); return <Card key={metric}><CardContent className="flex flex-col gap-md pt-lg">
        <div className="text-body-small text-muted-foreground">{T[metric]}</div>
        {onChange ? <>
          <Field><FieldLabel htmlFor={`expectation-${metric}`}>{T.amount}</FieldLabel><Input id={`expectation-${metric}`} inputMode="decimal" placeholder={metric === "revenue" ? "1000000" : "2"} value={x?.amount ?? ""} onChange={e => change(metric, { amount: e.target.value })}/></Field>
          {metric === "revenue" ? <Field><FieldLabel htmlFor="expectation-currency">{T.currency}</FieldLabel><Input id="expectation-currency" maxLength={3} value={x?.currency ?? "CNY"} onChange={e => change(metric, { currency: e.target.value.toUpperCase() })}/></Field> : null}
          <Field><FieldLabel htmlFor={`criterion-${metric}`}>{T.criterion}</FieldLabel><Input id={`criterion-${metric}`} maxLength={1000} placeholder={T.criterionExample} value={x?.criterion ?? ""} onChange={e => change(metric, { criterion: e.target.value })}/></Field>
        </> : <><span className="text-heading-3 tabular-nums">{x ? Number(x.amount).toLocaleString(locale) : "-"}<span className="ml-sm text-body-small text-muted-foreground">{x?.currency ?? (x ? T.count : "")}</span></span>{x?.criterion ? <p className="text-body-small text-muted-foreground">{x.criterion}</p> : null}</>}
      </CardContent></Card>; })}
    </div>
  </Section>;
}
