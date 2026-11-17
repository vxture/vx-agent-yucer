"use client";

import { useId, useState } from "react";
import { Checkbox, EmptyState, FieldDescription, Icon, Input } from "@vxture/design-ui";
import type { ProductReference, SolutionReference } from "../../domains/catalog/service";
import { strategyOfferings } from "../lib/strategy-offerings";
import { useMessages } from "../lib/i18n/provider";

/** The same searchable, UUID-valued checklist in strategy and market drawers. */
export function OfferingSelectionList({ options, ids, onChange, productOptions = null, productIds, onProductChange, disabled }: {
  readonly options: readonly SolutionReference[] | null;
  readonly ids: readonly string[] | undefined;
  readonly onChange: (ids: readonly string[]) => void;
  readonly productOptions?: readonly ProductReference[] | null;
  readonly productIds?: readonly string[];
  readonly onProductChange?: (ids: readonly string[]) => void;
  readonly disabled: boolean;
}) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  const id = useId();
  const [query, setQuery] = useState("");
  const solutionsReady = options !== null && ids !== undefined;
  const productsReady = productOptions !== null && productIds !== undefined && !!onProductChange;
  const chosen = (kind: "product" | "solution", key: string) => (kind === "product" ? productIds : ids)?.includes(key) ?? false;
  const needle = query.trim().toLocaleLowerCase();
  const rows = strategyOfferings(solutionsReady ? options : null, productsReady ? productOptions : null)
    .filter(row => row.status === "active" || chosen(row.kind, row.id))
    .filter(row => `${row.name} ${row.code}`.toLocaleLowerCase().includes(needle));

  return <div className="flex min-w-0 flex-col gap-lg" data-offering-selection-list>
    {solutionsReady || productsReady ? <Input type="search" value={query} disabled={disabled}
      onChange={e => setQuery(e.target.value)} placeholder={T.searchSolutions} aria-label={T.searchSolutions} /> : null}
    {!solutionsReady ? <FieldDescription>{T.solutionOptionsUnavailable}</FieldDescription> : null}
    {!productsReady ? <FieldDescription>{T.productOptionsUnavailable}</FieldDescription> : null}
    {(["solution", "product"] as const).map(kind => {
      const group = rows.filter(row => row.kind === kind);
      if (!group.length) return null;
      return <section key={kind} aria-labelledby={`${id}-${kind}`}>
        <h3 id={`${id}-${kind}`} className="mb-sm flex items-center gap-xs text-body-small text-muted-foreground">
          <Icon name={kind === "product" ? "cube" : "stack"} size="sm" aria-hidden="true" />
          {kind === "product" ? T.productKind : T.solutionKind}
          <span className="tabular-nums">{group.length}</span>
        </h3>
        <div className="divide-y divide-dashed divide-border">
          {group.map((row, index) => {
            const checked = chosen(row.kind, row.id);
            const inputId = `${id}-${kind}-${index}`;
            return <label htmlFor={inputId} key={row.key}
              className={`flex min-w-0 cursor-pointer items-start gap-sm rounded-md px-sm py-md transition-colors hover:bg-accent ${checked ? "bg-accent" : ""}`}>
              <Checkbox id={inputId} checked={checked} disabled={disabled} onCheckedChange={value => {
                const current = (kind === "product" ? productIds : ids) ?? [];
                const next = value === true ? [...current, row.id] : current.filter(key => key !== row.id);
                if (kind === "product") onProductChange?.(next);
                else onChange(next);
              }} />
              <span className="flex min-w-0 flex-1 flex-col gap-xs">
                <span className="break-words text-body font-medium">{row.name}</span>
                <span className="break-words text-body-small text-muted-foreground">{row.code}{row.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span>
              </span>
            </label>;
          })}
        </div>
      </section>;
    })}
    {!rows.length && (solutionsReady || productsReady) ? <EmptyState title={needle ? T.noMatches : T.noSelectableSolutions} /> : null}
  </div>;
}
