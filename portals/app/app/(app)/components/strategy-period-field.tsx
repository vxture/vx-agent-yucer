"use client";

import {useState} from "react";
import {Button, ButtonGroup, Field, FieldError, FieldLabel, Icon, Input, Popover, PopoverContent, PopoverTrigger} from "@vxture/design-ui";
import {parseStrategyPeriod, strategyPeriodForDates, strategyPeriodRangeLabel} from "../../domains/strategy/lib/plan-period";
import {useMessages} from "../lib/i18n/provider";

/** DS composition for an execution window. Dates are primary; presets fill them. */
export function StrategyPeriodField({value,onChange,disabled}:{readonly value:string;readonly onChange:(value:string)=>void;readonly disabled:boolean}) {
  const {MARKET_STRATEGY_TEXT:T}=useMessages();
  const saved=parseStrategyPeriod(value);
  const calendar=saved?parseStrategyPeriod(strategyPeriodForDates(saved.startOn,saved.endOn)!):null;
  const periodLabel=calendar?.kind==="annual"?`${calendar.year} ${T.annual}`
    :calendar?.kind==="quarter"?`${calendar.year} Q${calendar.quarter}`
    :saved?T.customDateRange:`${T.legacyPeriodLabel}: ${value}`;
  const [open,setOpen]=useState(false);
  const [year,setYear]=useState("");
  const [startOn,setStartOn]=useState("");
  const [endOn,setEndOn]=useState("");
  const [attempted,setAttempted]=useState(false);
  const candidate=strategyPeriodForDates(startOn,endOn);
  const parsed=candidate?parseStrategyPeriod(candidate):null;
  const yearValid=/^\d{4}$/.test(year) && Number(year)>=1900 && Number(year)<=9999;
  const reset=()=>{
    setYear(String(saved?.year ?? new Date().getFullYear()));
    setStartOn(saved?.startOn ?? "");setEndOn(saved?.endOn ?? "");setAttempted(false);
  };
  const fill=(key:string)=>{const range=parseStrategyPeriod(key);if(range){setStartOn(range.startOn);setEndOn(range.endOn);setAttempted(false);}};
  const error=startOn && endOn && startOn>endOn?T.periodEndBeforeStart:T.periodInvalidDates;
  const datesChanged=startOn!==saved?.startOn || endOn!==saved?.endOn;
  const presets=[{key:year,label:T.annual},...[1,2,3,4].map(q=>({key:`${year}-Q${q}`,label:`Q${q}`}))];
  return <Field>
    <div className="flex items-baseline gap-sm">
      <FieldLabel htmlFor="strategy-period">{T.executionPeriod}</FieldLabel>
      <span className="text-body-small text-muted-foreground" data-strategy-period-range>{periodLabel}</span>
    </div>
    <Popover open={open} onOpenChange={next=>{if(next)reset();setOpen(next);}}>
      <PopoverTrigger asChild><Button id="strategy-period" type="button" size="md" variant="outline" disabled={disabled}
        className="w-full justify-between" data-strategy-period-trigger title={strategyPeriodRangeLabel(value) ?? T.periodNeedsDates}>
        <span className="min-w-0 truncate tabular-nums">{strategyPeriodRangeLabel(value) ?? T.periodNeedsDates}</span><Icon name="chevron-down" size="sm" className="shrink-0"/>
      </Button></PopoverTrigger>
      <PopoverContent width="xl" align="start">
        <div className="flex flex-col gap-lg" data-strategy-period-editor>
          <ButtonGroup className="w-full" aria-label={T.periodShortcuts} data-strategy-period-presets>
            <Input id="strategy-period-year" aria-label={T.year} type="number" min={1900} max={9999} step={1} inputMode="numeric" value={year} className="w-20 shrink-0" onChange={e=>setYear(e.target.value)}/>
            {presets.map(p=><Button key={p.label} type="button" size="md" variant={candidate===p.key?"secondary":"outline"} className="min-w-0 flex-1" disabled={!yearValid} aria-pressed={candidate===p.key} onClick={()=>fill(p.key)}>{p.label}</Button>)}
          </ButtonGroup>
          <div className="grid grid-cols-2 gap-md">
            <Field><FieldLabel htmlFor="strategy-period-start">{T.startDate}</FieldLabel><Input id="strategy-period-start" type="date" min="1900-01-01" max={endOn || "9999-12-31"} value={startOn} onChange={e=>setStartOn(e.target.value)}/></Field>
            <Field><FieldLabel htmlFor="strategy-period-end">{T.endDate}</FieldLabel><Input id="strategy-period-end" type="date" min={startOn || "1900-01-01"} max="9999-12-31" value={endOn} onChange={e=>setEndOn(e.target.value)}/></Field>
          </div>
          {!parsed && (attempted || startOn || endOn)?<FieldError role="status">{error}</FieldError>:null}
          <div className="flex justify-end gap-sm">
            <Button type="button" size="md" variant="secondary" onClick={()=>setOpen(false)}>{T.relationCancel}</Button>
            <Button type="button" size="md" variant="secondary" aria-disabled={!parsed} onClick={()=>{setAttempted(true);if(candidate){onChange(!datesChanged?value:candidate);setOpen(false);}}}>{T.periodApply}</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </Field>;
}
