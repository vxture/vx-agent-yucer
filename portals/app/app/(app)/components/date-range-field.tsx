"use client";

import { useState } from "react";
import { Button, Calendar, Field, FieldLabel, Icon, Popover, PopoverContent, PopoverTrigger } from "@vxture/design-ui";
import { useLocale, useMessages } from "../lib/i18n/provider";

export function calendarDate(key: string): Date | undefined {
  if (!key) return undefined;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}
function dateKey(date?: Date): string {
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
}

/** Every range uses the DS dual calendar with stable six-week month geometry. */
export function DateRangeCalendar({ startOn, endOn, onChange, month, onMonthChange }: {
  readonly startOn: string;
  readonly endOn: string;
  readonly onChange: (startOn: string, endOn: string) => void;
  readonly month?: Date;
  readonly onMonthChange?: (month: Date) => void;
}) {
  const locale = useLocale();
  return <Calendar mode="range" numberOfMonths={2} fixedWeeks className="p-0"
    classNames={{ week: "mt-2xs flex w-full" }}
    selected={{ from: calendarDate(startOn), to: calendarDate(endOn) }}
    defaultMonth={calendarDate(startOn)} month={month} onMonthChange={onMonthChange}
    formatters={{
      formatCaption: date => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(date),
      formatWeekdayName: date => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
    }}
    onSelect={range => onChange(dateKey(range?.from), dateKey(range?.to))} />;
}

export function DateRangeField({ id, label, startOn, endOn, onChange, disabled, allowPartial = false, side = "bottom" }: {
  readonly id: string;
  readonly label?: string;
  readonly startOn: string;
  readonly endOn: string;
  readonly onChange: (startOn: string, endOn: string) => void;
  readonly disabled?: boolean;
  readonly allowPartial?: boolean;
  readonly side?: "top" | "bottom";
}) {
  const { DATE_RANGE_TEXT: T } = useMessages();
  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState({ startOn, endOn });
  return <Field>
    <FieldLabel htmlFor={id}>{label ?? T.label}</FieldLabel>
    <Popover open={open} onOpenChange={next => { if (next) setDates({ startOn, endOn }); setOpen(next); }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" size="md" variant="outline" disabled={disabled}
          className="w-full justify-between font-normal" data-form-value data-form-placeholder={!startOn && !endOn} data-date-range-trigger>
          <span className="flex min-w-0 items-center gap-xs"><Icon name="calendar" size="sm" />
            <span className="truncate tabular-nums">{startOn || T.start}{" ~ "}{endOn || T.end}</span>
          </span>
          <Icon name="chevron-down" size="sm" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side={side} width="xl" collisionPadding={16}
        className="w-auto max-w-[calc(100vw-var(--space-lg)*2)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-md" aria-label={label ?? T.label}
        data-date-range-panel>
        <DateRangeCalendar {...dates} onChange={(startOn, endOn) => setDates({ startOn, endOn })} />
        <div className="mt-md flex justify-end gap-sm border-t border-border pt-sm">
          <Button type="button" size="md" variant="ghost" onClick={() => { onChange("", ""); setOpen(false); }}>{T.clear}</Button>
          <Button type="button" size="md" variant="secondary" disabled={!allowPartial && (!dates.startOn || !dates.endOn)}
            onClick={() => { onChange(dates.startOn, dates.endOn); setOpen(false); }}>{T.apply}</Button>
        </div>
      </PopoverContent>
    </Popover>
  </Field>;
}
