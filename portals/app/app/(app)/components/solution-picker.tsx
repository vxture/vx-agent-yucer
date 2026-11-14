"use client";

import { Button, Combobox, FieldDescription, Icon } from "@vxture/design-ui";
import type { SolutionReference } from "../../domains/catalog/service";
import { useMessages } from "../lib/i18n/provider";

export function SolutionPicker({ options, ids, onChange, disabled }: {
  readonly options: readonly SolutionReference[] | null;
  readonly ids: readonly string[] | undefined;
  readonly onChange: (ids: readonly string[]) => void;
  readonly disabled: boolean;
}) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  if (options === null || ids === undefined) return <FieldDescription>{T.solutionOptionsUnavailable}</FieldDescription>;
  const selected = options.filter(s => ids.includes(s.id));
  const available = options.filter(s => s.status === "active" && !ids.includes(s.id));
  return <>
    <Combobox items={available.map(s => ({ value: s.id, label: `${s.name} \u00b7 ${s.solutionCode}` }))}
      onValueChange={id => { if (id && !ids.includes(id)) onChange([...ids, id]); }}
      placeholder={available.length ? T.addSolution : T.noSelectableSolutions} searchPlaceholder={T.searchSolutions}
      emptyText={T.noMatches} disabled={disabled || !available.length} className="w-full text-body-small"/>
    {selected.length ? <ul className="flex flex-wrap gap-sm" aria-label={T.primarySolutions}>
      {selected.map(s => <li key={s.id} className="flex max-w-full items-center gap-xs rounded-md bg-accent pl-sm text-body-small">
        <span className="min-w-0 break-words">{s.name}{s.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span>
        <Button type="button" size="icon-md" variant="ghost" aria-label={`${T.removeSolution}: ${s.name}`} disabled={disabled}
          onClick={() => onChange(ids.filter(id => id !== s.id))}><Icon name="x" size="sm" aria-hidden="true"/></Button>
      </li>)}
    </ul> : null}
  </>;
}
