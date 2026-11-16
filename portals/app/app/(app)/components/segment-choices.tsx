"use client";

import { Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger, Icon } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

/** A multi-choice customer criterion, bound to the workspace's configured names. */
export function SegmentChoices({ id, label, options, values, disabled, onChange }: {
  readonly id: string; readonly label: string; readonly options: readonly string[];
  readonly values: readonly string[]; readonly disabled: boolean; readonly onChange: (values: readonly string[]) => void;
}) {
  const { SEGMENT_FORM_TEXT: T } = useMessages();
  const all = [...new Set([...options, ...values])];
  return <div className="flex min-w-0 flex-col gap-sm">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button id={id} type="button" variant="outline" size="xl" className="w-full justify-between font-normal" disabled={disabled} aria-label={label}>
          <span className="min-w-0 truncate">{values.length ? values.join(" / ") : T.notLimited}</span><Icon name="chevron-down" size="sm" className="shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
        {all.length ? all.map(value => <DropdownMenuCheckboxItem key={value} checked={values.includes(value)} onSelect={event => event.preventDefault()}
          onCheckedChange={checked => onChange(checked ? [...values, value] : values.filter(v => v !== value))}>{value}</DropdownMenuCheckboxItem>)
          : <DropdownMenuCheckboxItem disabled>{T.empty}</DropdownMenuCheckboxItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    {values.length ? <ul className="flex flex-wrap gap-xs" aria-label={label}>
      {values.map(value => <li key={value} className="inline-flex max-w-full items-center gap-xs rounded-md bg-accent pl-sm text-body-small">
        <span className="min-w-0 break-words">{value}</span><Button type="button" variant="ghost" size="icon-md" disabled={disabled} aria-label={`${T.remove}: ${value}`}
          onClick={() => onChange(values.filter(v => v !== value))}><Icon name="x" size="xs" /></Button>
      </li>)}
    </ul> : null}
  </div>;
}
