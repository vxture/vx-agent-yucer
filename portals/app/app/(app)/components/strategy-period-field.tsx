"use client";

import {DateRangeCalendar, calendarDate} from "./date-range-field";
import {useState} from "react";
import {Button, Field, FieldError, FieldLabel, Icon, Input, Popover, PopoverContent, PopoverTrigger, SegmentedControl} from "@vxture/design-ui";
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
  const [month,setMonth]=useState<Date | undefined>(undefined);
  const [attempted,setAttempted]=useState(false);
  const candidate=strategyPeriodForDates(startOn,endOn);
  const parsed=candidate?parseStrategyPeriod(candidate):null;
  const yearValid=/^\d{4}$/.test(year) && Number(year)>=1900 && Number(year)<=9999;
  const reset=()=>{
    setYear(String(saved?.year ?? new Date().getFullYear()));
    setStartOn(saved?.startOn ?? "");setEndOn(saved?.endOn ?? "");setMonth(calendarDate(saved?.startOn ?? ""));setAttempted(false);
  };
  const fill=(key:string)=>{const range=parseStrategyPeriod(key);if(range){setStartOn(range.startOn);setEndOn(range.endOn);setMonth(calendarDate(range.startOn));setAttempted(false);}};
  const error=startOn && endOn && startOn>endOn?T.periodEndBeforeStart:T.periodInvalidDates;
  const datesChanged=startOn!==saved?.startOn || endOn!==saved?.endOn;
  const presets=[{value:year,label:T.annual},...[1,2,3,4].map(q=>({value:`${year}-Q${q}`,label:`Q${q}`}))];
  return <Field>
    <div className="flex items-baseline gap-sm">
      <FieldLabel htmlFor="strategy-period">{T.executionPeriod}</FieldLabel>
      <span className="text-body-small text-muted-foreground" data-strategy-period-range>{periodLabel}</span>
    </div>
    <Popover open={open} onOpenChange={next=>{if(next)reset();setOpen(next);}}>
      <PopoverTrigger asChild><Button id="strategy-period" type="button" size="md" variant="outline" disabled={disabled}
        className="w-full justify-between" data-form-value data-strategy-period-trigger title={strategyPeriodRangeLabel(value) ?? T.periodNeedsDates}>
        <span className="flex min-w-0 items-center gap-xs"><Icon name="calendar" size="sm"/><span className="truncate tabular-nums">{strategyPeriodRangeLabel(value) ?? T.periodNeedsDates}</span></span>
        <Icon name="chevron-down" size="sm" className="shrink-0"/>
      </Button></PopoverTrigger>
      <PopoverContent align="start" aria-label={T.executionPeriod} collisionPadding={16} width="xl" data-date-range-panel
        className="w-auto max-w-[calc(100vw-var(--space-lg)*2)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-md">
        <div className="flex flex-col gap-lg" data-business-form data-strategy-period-editor>
          <div className="flex items-center gap-xs" data-strategy-period-presets>
            <Input id="strategy-period-year" aria-label={T.year} type="number" min={1900} max={9999} step={1} inputMode="numeric" value={year} className="w-20 shrink-0" onChange={e=>setYear(e.target.value)}/>
            <SegmentedControl ariaLabel={T.periodShortcuts} fill value={candidate ?? ""} onChange={fill}
              items={presets.map(p=>({...p,disabled:!yearValid}))}
              className="min-w-0 flex-1 [&>button]:rounded-none [&>button]:border-r [&>button]:border-control-border [&>button]:whitespace-nowrap [&>button]:font-medium [&>button:last-child]:border-transparent [&>button[aria-checked=true]]:bg-primary [&>button[aria-checked=true]]:text-primary-foreground [&>button[aria-checked=true]]:shadow-none"/>
          </div>
          <DateRangeCalendar startOn={startOn} endOn={endOn} month={month} onMonthChange={setMonth}
            onChange={(start, end) => { setStartOn(start);setEndOn(end);setAttempted(false); }} />
          <output className="text-body-small tabular-nums text-muted-foreground" aria-live="polite">{startOn || T.startDate}{" ~ "}{endOn || T.endDate}</output>
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
