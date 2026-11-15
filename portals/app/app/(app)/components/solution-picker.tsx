"use client";

import { Button, Combobox, FieldDescription, Icon } from "@vxture/design-ui";
import type { ProductReference, SolutionReference } from "../../domains/catalog/service";
import { strategyOfferings } from "../lib/strategy-offerings";
import { useMessages } from "../lib/i18n/provider";

/** One DS selector, two independently gated catalogue references. */
export function SolutionPicker({ options, ids, onChange, productOptions = null, productIds, onProductChange, disabled }: {
  readonly options: readonly SolutionReference[] | null;
  readonly ids: readonly string[] | undefined;
  readonly onChange: (ids: readonly string[]) => void;
  readonly productOptions?: readonly ProductReference[] | null;
  readonly productIds?: readonly string[];
  readonly onProductChange?: (ids: readonly string[]) => void;
  readonly disabled: boolean;
}) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  const solutionsReady = options !== null && ids !== undefined;
  const productsReady = productOptions !== null && productIds !== undefined && !!onProductChange;
  const rows = strategyOfferings(solutionsReady ? options : null, productsReady ? productOptions : null);
  const chosen = (row: typeof rows[number]) => (row.kind === "product" ? productIds : ids)?.includes(row.id) ?? false;
  const selected = rows.filter(chosen);
  const available = rows.filter(row => row.status === "active" && !chosen(row));
  return <>
    {solutionsReady || productsReady ? <Combobox items={available.map(row => ({ value: row.key, label: `${row.kind === "product" ? T.productKind : T.solutionKind} \u00b7 ${row.name} \u00b7 ${row.code}` }))}
      onValueChange={key => {
        const row=available.find(r=>r.key===key);if(!row)return;
        if(row.kind === "product")onProductChange?.([...(productIds ?? []),row.id]);
        else onChange([...(ids ?? []),row.id]);
      }}
      placeholder={available.length ? T.addSolution : T.noSelectableSolutions} searchPlaceholder={T.searchSolutions}
      emptyText={T.noMatches} disabled={disabled || !available.length} className="w-full text-body-small"/> : null}
    {!solutionsReady ? <FieldDescription>{T.solutionOptionsUnavailable}</FieldDescription> : null}
    {!productsReady ? <FieldDescription>{T.productOptionsUnavailable}</FieldDescription> : null}
    {selected.length ? <ul className="flex flex-wrap gap-sm" aria-label={T.primarySolutions}>
      {selected.map(row => <li key={row.key} className="flex max-w-full items-center gap-xs rounded-md bg-accent pl-sm text-body-small">
        <Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/>
        <span className="min-w-0 break-words">{row.name}{row.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span>
        <Button type="button" size="icon-md" variant="ghost" aria-label={`${T.removeSolution}: ${row.name}`} disabled={disabled}
          onClick={() => row.kind === "product" ? onProductChange?.(productIds!.filter(id=>id!==row.id)) : onChange(ids!.filter(id=>id!==row.id))}>
          <Icon name="x" size="sm" aria-hidden="true"/>
        </Button>
      </li>)}
    </ul> : null}
  </>;
}
