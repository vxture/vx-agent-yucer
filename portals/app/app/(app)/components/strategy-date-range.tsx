"use client";

import { useState } from "react";
import {
  Button,
  Calendar,
  Field,
  FieldLabel,
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

function fromKey(key: string): Date | undefined {
  if (!key) return undefined;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}
function toKey(date?: Date): string {
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : "";
}
/** Bind the DS range calendar to date-only business fields. */
export function StrategyDateRange({
  id,
  startOn,
  endOn,
  onChange,
}: {
  readonly id: string;
  readonly startOn: string;
  readonly endOn: string;
  readonly onChange: (startOn: string, endOn: string) => void;
}) {
  const { STRATEGY_RESULT_TEXT: T } = useMessages();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ from: Date | undefined; to?: Date }>({
    from: fromKey(startOn),
    to: fromKey(endOn),
  });
  return (
    <Field>
      <FieldLabel htmlFor={id}>{T.dateRange}</FieldLabel>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setRange({ from: fromKey(startOn), to: fromKey(endOn) });
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            size="md"
            variant="outline"
            className="w-full justify-between font-normal"
            data-strategy-date-range
          >
            <span className="flex min-w-0 items-center gap-xs">
              <Icon name="calendar" size="sm" />
              <span
                className={`truncate tabular-nums ${!startOn && !endOn ? "text-muted-foreground" : ""}`}
              >
                {startOn || T.start}
                {" ~ "}
                {endOn || T.end}
              </span>
            </span>
            <Icon name="chevron-down" size="sm" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-md"
          aria-label={T.dateRange}
        >
          <Calendar
            mode="range"
            selected={range}
            defaultMonth={range.from}
            onSelect={(next) => setRange(next ?? { from: undefined })}
          />
          <div className="flex justify-end gap-sm border-t border-border pt-md">
            <Button
              type="button"
              size="md"
              variant="ghost"
              onClick={() => {
                onChange("", "");
                setOpen(false);
              }}
            >
              {T.clear}
            </Button>
            <Button
              type="button"
              size="md"
              variant="secondary"
              disabled={!range.from || !range.to}
              onClick={() => {
                onChange(toKey(range.from), toKey(range.to));
                setOpen(false);
              }}
            >
              {T.apply}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
