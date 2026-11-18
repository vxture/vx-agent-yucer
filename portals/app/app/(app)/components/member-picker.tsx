"use client";

import { useState } from "react";
import { Button, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Icon, Popover, PopoverContent, PopoverTrigger } from "@vxture/design-ui";
import { MemberName, useMemberDirectory } from "../lib/member-names";
import { useMessages } from "../lib/i18n/provider";

/** DS composition with explicit name search keywords and atomic identities. */
export function MemberPicker({ value, onValueChange, options, disabled, label, id, allowEmpty = true, emptyLabel, className = "w-full" }: {
  readonly id?: string;
  readonly value: string | null | undefined;
  readonly onValueChange: (sub: string) => void;
  readonly options?: readonly { value: string; label: string; description?: string }[] | null;
  readonly disabled?: boolean;
  readonly label: string;
  readonly allowEmpty?: boolean;
  readonly emptyLabel?: string;
  readonly className?: string;
}) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  const members = useMemberDirectory();
  const [open, setOpen] = useState(false);
  const choices: readonly { value: string; label: string; description?: string }[] = options === undefined ? members.filter(m => m.active !== false).map(m => ({ value: m.sub, label: m.name })) : options ?? [];
  const selected = choices.find(m => m.value === value);
  const pick = (sub: string) => { onValueChange(sub); setOpen(false); };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" size="md" role="combobox" aria-label={label}
      aria-expanded={open} data-form-value data-form-placeholder={!value} disabled={disabled || options === null} className={`justify-between ${className}`}>
      {value ? value.startsWith("__") ? selected?.label : <MemberName sub={value} name={selected?.label}/> : <span className="text-muted-foreground">{emptyLabel ?? T.noOwner}</span>}
      <Icon name="chevron-down" size="sm" className="shrink-0 text-muted-foreground"/>
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-0" style={{ width: "var(--radix-popover-trigger-width)" }} data-form-choice-panel>
      <Command>
        <CommandInput placeholder={T.ownerSearch} aria-label={T.ownerSearch}/>
        <CommandList><CommandEmpty>{T.noOwnerOptions}</CommandEmpty><CommandGroup>
          {allowEmpty ? <CommandItem value="__empty" keywords={[emptyLabel ?? T.noOwner]} onSelect={() => pick("")}>{emptyLabel ?? T.noOwner}</CommandItem> : null}
          {value && !selected ? <CommandItem value={value} onSelect={() => pick(value)}><MemberName sub={value}/></CommandItem> : null}
          {choices.map(m => <CommandItem key={m.value} value={m.value} className={m.value === value ? "bg-accent text-primary-text" : undefined} keywords={[m.label, m.description ?? ""]} onSelect={() => pick(m.value)}>
            {m.value.startsWith("__") ? m.label : <MemberName sub={m.value} name={m.label}/>}
            {m.description ? <span className="text-muted-foreground">{m.description}</span> : null}
            {m.value === value ? <Icon name="check" size="sm" className="ml-auto shrink-0"/> : null}
          </CommandItem>)}
        </CommandGroup></CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
