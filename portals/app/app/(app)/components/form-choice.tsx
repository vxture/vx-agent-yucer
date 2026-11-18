"use client";

import { useState } from "react";
import { Button, Command, CommandGroup, CommandItem, CommandList, Icon, Popover, PopoverContent, PopoverTrigger } from "@vxture/design-ui";

/** Single and multiple form choices share the member picker's DS panel surface. */
export function FormChoice({ id, label, options, values, onChange, placeholder, multiple = false, disabled }: {
  readonly id?: string;
  readonly label: string;
  readonly options: readonly { value: string; label: string }[];
  readonly values: readonly string[];
  readonly onChange: (values: string[]) => void;
  readonly placeholder: string;
  readonly multiple?: boolean;
  readonly disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter(o => values.includes(o.value));
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button id={id} type="button" size="md" variant="outline" role="combobox" aria-label={label} aria-expanded={open}
        disabled={disabled} data-form-value data-form-placeholder={!selected.length} className="w-full justify-between font-normal">
        <span className="min-w-0 truncate">{selected.map(o => o.label).join(" / ") || placeholder}</span>
        <Icon name="chevron-down" size="sm" className="shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-0" style={{ width: "var(--radix-popover-trigger-width)" }} data-form-choice-panel>
      <Command>
        <CommandList aria-label={label} aria-multiselectable={multiple || undefined}>
          <CommandGroup>
            {options.map(o => <CommandItem key={o.value} value={o.value} keywords={[o.label]}
              className={values.includes(o.value) ? "bg-accent text-primary-text" : undefined}
              onSelect={() => {
                onChange(multiple ? values.includes(o.value) ? values.filter(v => v !== o.value) : [...values, o.value] : [o.value]);
                if (!multiple) setOpen(false);
              }}>
              <span className="min-w-0 flex-1 break-words">{o.label}</span>
              {values.includes(o.value) ? <Icon name="check" size="sm" className="shrink-0" /> : null}
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
