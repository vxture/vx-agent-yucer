"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, Drawer, Icon, Section, SectionHeader } from "@vxture/design-ui";
import { StrategyInfoCard, StrategyInfoContent } from "./strategy-info-card";
import { collectionDrawerWidth } from "./collection-layout";
import type { SegmentVocabulary } from "../../domains/strategy/lib/segment-draft";
import { useMessages } from "../lib/i18n/provider";
import { strategyOfferings, type StrategyOffering } from "../lib/strategy-offerings";

import { OfferingSelectionList } from "./offering-selection-list";

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
        {selected.map(row => <StrategyInfoCard key={row.key} variant="reference" data-segment-offering={row.kind}><StrategyInfoContent>
          <Link href={row.href} className="inline-flex min-w-0 items-start gap-xs text-body font-medium no-underline transition-colors hover:text-primary-text hover:no-underline">
            <Icon name={row.icon} size="sm" aria-hidden="true" className="shrink-0 text-muted-foreground" /><span className="line-clamp-2 break-words">{row.name}</span>
          </Link>
          <span className="break-words text-body-small text-muted-foreground">{row.kind === "product" ? T.productKind : T.solutionKind}{` \u00b7 ${row.code}`}{row.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span>
        </StrategyInfoContent></StrategyInfoCard>)}
      </div>
    </div> : vocabulary.solutions !== null && vocabulary.products !== null
      ? <p className="text-body-small text-muted-foreground">{F.noneSelected}</p> : null}
    {vocabulary.products === null ? <p className="text-body-small text-muted-foreground">{T.productOptionsUnavailable}</p> : null}
    {vocabulary.solutions === null ? <p className="text-body-small text-muted-foreground">{T.solutionOptionsUnavailable}</p> : null}
    {draft ? <OfferingDrawer vocabulary={vocabulary}
      original={selection} draft={draft} onChange={setDraft} onClose={close} onApply={() => { onChange(draft); close(); }} /> : null}
  </Section>;
}

function OfferingDrawer({ vocabulary, original, draft, onChange, onClose, onApply }: {
  readonly vocabulary: SegmentVocabulary;
  readonly original: Selection;
  readonly draft: Selection;
  readonly onChange: (value: Selection) => void;
  readonly onClose: () => void;
  readonly onApply: () => void;
}) {
  const { MARKET_STRATEGY_TEXT: T, SEGMENT_FORM_TEXT: F } = useMessages();
  const rows = strategyOfferings(vocabulary.solutions, vocabulary.products);
  const count = rows.filter(row => draft[selectionKey(row.kind)].includes(row.id)).length;
  const dirty = (["productIds", "solutionIds"] as const).some(key =>
    original[key].length !== draft[key].length || draft[key].some(value => !original[key].includes(value)));
  return <Drawer open onClose={onClose} width={collectionDrawerWidth.standard} className="max-w-full" title={F.offerings} closeLabel={T.closed}
    footer={<div className="flex w-full flex-wrap items-center justify-between gap-sm">
      <output className="text-body-small text-muted-foreground">{T.relationSelectedCount} {count}</output>
      <div className="ml-auto flex gap-sm"><Button type="button" size="xl" variant="secondary" onClick={onClose}>{T.relationCancel}</Button>
        <Button type="button" size="xl" disabled={!dirty} onClick={onApply}>{T.relationApply}</Button></div>
    </div>}>
    <div className="flex min-w-0 flex-col gap-lg" data-business-form data-segment-offering-drawer>
      <OfferingSelectionList options={vocabulary.solutions} ids={draft.solutionIds}
        onChange={solutionIds => onChange({ ...draft, solutionIds })}
        productOptions={vocabulary.products} productIds={draft.productIds}
        onProductChange={productIds => onChange({ ...draft, productIds })} disabled={false} />
    </div>
  </Drawer>;
}
