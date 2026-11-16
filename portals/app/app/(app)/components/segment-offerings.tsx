"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Button, Card, CardHeader, CardTitle, Checkbox, Drawer, EmptyState, Icon, Input, Section, SectionHeader } from "@vxture/design-ui";
import type { SegmentVocabulary } from "../../domains/strategy/lib/segment-draft";
import { useMessages } from "../lib/i18n/provider";
import { strategyOfferings, type StrategyOffering } from "../lib/strategy-offerings";

type Selection = { productIds: readonly string[]; solutionIds: readonly string[] };
const selectionKey = (kind: StrategyOffering["kind"]) => kind === "product" ? "productIds" : "solutionIds";

export function SegmentOfferings({ vocabulary, selection, disabled, help, onChange }: {
  readonly vocabulary: SegmentVocabulary;
  readonly selection: Selection;
  readonly disabled: boolean;
  readonly help: ReactNode;
  readonly onChange: (value: Selection) => void;
}) {
  const { MARKET_STRATEGY_TEXT: T, SEGMENT_FORM_TEXT: F } = useMessages();
  const trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<Selection | null>(null);
  const rows = strategyOfferings(vocabulary.solutions, vocabulary.products);
  const selected = rows.filter(row => selection[selectionKey(row.kind)].includes(row.id));
  const canManage = selected.length > 0 || rows.some(row => row.status === "active");

  function close() {
    setDraft(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  return <Section>
    <SectionHeader title={F.offerings} icon="squares-four" titleSuffix={help}
      action={canManage ? <Button ref={trigger} type="button" size="xl" variant="secondary" disabled={disabled}
        aria-haspopup="dialog" aria-expanded={draft !== null} onClick={() => setDraft(selection)}>
        <Icon name="plus" size="sm" />{selected.length ? F.manageOfferings : F.chooseOfferings}
      </Button> : undefined} />
    {selected.length ? <div className="@container">
      <div className="grid grid-cols-1 gap-lg @xl:grid-cols-2 @5xl:in-data-workspace-full-width:grid-cols-3" data-segment-offering-grid>
        {selected.map(row => <Card key={row.key} className="min-w-0 gap-sm py-md" data-segment-offering={row.kind}>
          <CardHeader><div className="flex min-w-0 items-start gap-sm">
            <Icon name={row.icon} size="lg" aria-hidden="true" className={row.kind === "product" ? "shrink-0 text-muted-foreground" : "shrink-0 text-primary-text"} />
            <div className="flex min-w-0 flex-col gap-xs">
              <CardTitle className="break-words">{row.name}</CardTitle>
              <span className="break-words text-body-small text-muted-foreground">{row.kind === "product" ? T.productKind : T.solutionKind}{` \u00b7 ${row.code}`}{row.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span>
            </div>
          </div></CardHeader>
        </Card>)}
      </div>
    </div> : vocabulary.solutions !== null && vocabulary.products !== null
      ? <p className="text-body-small text-muted-foreground">{F.noneSelected}</p> : null}
    {vocabulary.products === null ? <p className="text-body-small text-muted-foreground">{T.productOptionsUnavailable}</p> : null}
    {vocabulary.solutions === null ? <p className="text-body-small text-muted-foreground">{T.solutionOptionsUnavailable}</p> : null}
    {draft ? <OfferingDrawer rows={rows.filter(row => row.status === "active" || selection[selectionKey(row.kind)].includes(row.id))}
      original={selection} draft={draft} onChange={setDraft} onClose={close} onApply={() => { onChange(draft); close(); }} /> : null}
  </Section>;
}

function OfferingDrawer({ rows, original, draft, onChange, onClose, onApply }: {
  readonly rows: readonly StrategyOffering[];
  readonly original: Selection;
  readonly draft: Selection;
  readonly onChange: (value: Selection) => void;
  readonly onClose: () => void;
  readonly onApply: () => void;
}) {
  const { MARKET_STRATEGY_TEXT: T, SEGMENT_FORM_TEXT: F } = useMessages();
  const id = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => `${row.name} ${row.code}`.toLocaleLowerCase().includes(needle));
  const count = rows.filter(row => draft[selectionKey(row.kind)].includes(row.id)).length;
  const dirty = (["productIds", "solutionIds"] as const).some(key =>
    original[key].length !== draft[key].length || draft[key].some(value => !original[key].includes(value)));
  return <Drawer open onClose={onClose} width="md" className="max-w-full" title={F.offerings} closeLabel={T.closed}
    footer={<div className="flex w-full flex-wrap items-center justify-between gap-sm">
      <span role="status" className="text-body-small text-muted-foreground">{T.relationSelectedCount} {count}</span>
      <div className="ml-auto flex gap-sm"><Button type="button" size="xl" variant="secondary" onClick={onClose}>{T.relationCancel}</Button>
        <Button type="button" size="xl" disabled={!dirty} onClick={onApply}>{T.relationApply}</Button></div>
    </div>}>
    <div className="flex min-w-0 flex-col gap-lg" data-business-form data-segment-offering-drawer>
      <Input type="search" aria-label={T.searchSolutions} placeholder={T.searchSolutions} value={query} onChange={e => setQuery(e.target.value)} />
      {(["product", "solution"] as const).map(kind => {
        const group = filtered.filter(row => row.kind === kind);
        if (!group.length) return null;
        return <section key={kind} aria-labelledby={`${id}-${kind}`}>
          <h3 id={`${id}-${kind}`} className="text-label-medium">{kind === "product" ? T.productKind : T.solutionKind}</h3>
          <div className="divide-y divide-dashed divide-border">
            {group.map((row, index) => {
              const key = selectionKey(row.kind);
              const checked = draft[key].includes(row.id);
              const inputId = `${id}-${kind}-${index}`;
              return <label htmlFor={inputId} key={row.key} className="flex cursor-pointer items-start gap-sm py-md">
                <Checkbox id={inputId} checked={checked}
                  onCheckedChange={value => onChange({ ...draft, [key]: value === true ? [...draft[key], row.id] : draft[key].filter(item => item !== row.id) })} />
                <Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex min-w-0 flex-col gap-xs">
                  <span className="break-words text-body">{row.name}</span>
                  <span className="break-words text-body-small text-muted-foreground">{row.code}{row.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span>
                </span>
              </label>;
            })}
          </div>
        </section>;
      })}
      {!filtered.length ? <EmptyState title={T.noMatches} /> : null}
    </div>
  </Drawer>;
}
