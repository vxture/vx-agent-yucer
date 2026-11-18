"use client";

import { FormChoice } from "./form-choice";
import { StrategyNovelty } from "./strategy-result-fields";
import type { Novelty } from "../../domains/strategy/lib/strategy-result";
import { useState } from "react";
import { Button, Checkbox, Drawer, EmptyState, Field, FieldError, FieldLabel, Icon, Input, Textarea } from "@vxture/design-ui";
import type { ProductReference, SolutionReference } from "../../domains/catalog/service";
import type { PlanRelationChange, TargetMarketDraft, TargetMarketIntent } from "../../domains/strategy/lib/lifecycle";
import type { MarketView } from "../lib/market-strategy";
import { OfferingSelectionList } from "./offering-selection-list";
import { TitleHelp } from "./title-help";
import { useMessages } from "../lib/i18n/provider";
import { collectionDrawerWidth } from "./collection-layout";

export type RelationMarketOption = Pick<MarketView, "id" | "name" | "segmentCode" | "status" | "criteria" | "matched" | "missing" | "solutionIds" | "productIds">;
export type RelationTarget = TargetMarketDraft & { marketName: string };
export type RelationTask = { kind: "markets" } | { kind: "solutions" } | { kind: "market"; segmentId: string };

// Mounted per task: reopening starts from current links, never a cancelled draft.
export function StrategyRelationsDrawer({ task, planName, targets, sharedSolutionIds, sharedProductIds, marketOptions, solutionOptions, productOptions, onSave, onClose, draft = false, marketNovelty, onMarketNoveltyChange }: {
  readonly marketNovelty?:Novelty;
  readonly onMarketNoveltyChange?:(value:Novelty)=>void;
  readonly task: RelationTask;
  readonly planName: string;
  readonly targets: readonly RelationTarget[];
  readonly sharedProductIds: readonly string[] | undefined;
  readonly productOptions: readonly ProductReference[] | null;
  readonly sharedSolutionIds: readonly string[] | undefined;
  readonly marketOptions: readonly RelationMarketOption[] | null;
  readonly solutionOptions: readonly SolutionReference[] | null;
  readonly onSave: (change: PlanRelationChange) => Promise<{ ok: boolean; error?: string }>;
  readonly onClose: () => void;
  readonly draft?: boolean;
}) {
  const { STRATEGY_RESULT_TEXT:R, MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT, PLAN_ERROR } = useMessages();
  const target = task.kind === "market" ? targets.find(t => t.segmentId === task.segmentId) : undefined;
  const [selected, setSelected] = useState<readonly string[]>(task.kind === "markets" ? targets.map(t => t.segmentId) : sharedSolutionIds ?? []);
  const [novelty,setNovelty]=useState(marketNovelty??"unknown");
  const [intent, setIntent] = useState(target?.intent ?? null);
  const [approach, setApproach] = useState(target?.approach ?? "");
  const [productIds, setProductIds] = useState(task.kind === "solutions" ? sharedProductIds : target?.productIds);
  const [solutionIds, setSolutionIds] = useState(task.kind === "solutions" ? sharedSolutionIds : target?.solutionIds);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const originalIds = task.kind === "markets" ? targets.map(t => t.segmentId) : sharedSolutionIds ?? [];
  const solutionChanged = JSON.stringify(solutionIds) !== JSON.stringify(task.kind === "solutions" ? sharedSolutionIds : target?.solutionIds);
  const productChanged = JSON.stringify(productIds) !== JSON.stringify(task.kind === "solutions" ? sharedProductIds : target?.productIds);
  const dirty = task.kind === "market" ? novelty!==(marketNovelty??"unknown") || intent !== target?.intent || approach !== (target?.approach ?? "") || solutionChanged || productChanged
    : task.kind === "solutions" ? solutionChanged || productChanged : selected.length !== originalIds.length || selected.some(id => !originalIds.includes(id));
  const unavailable = task.kind === "markets" ? marketOptions === null
    : task.kind === "solutions" ? (solutionOptions === null || sharedSolutionIds === undefined) && (productOptions === null || sharedProductIds === undefined) : !target;
  const close = () => { if (!pending) onClose(); };
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const save = async () => {
    if (pending || unavailable || !dirty) return;
    const change: PlanRelationChange = task.kind === "markets" ? {
      kind: "markets", add: selected.filter(id => !originalIds.includes(id)), remove: originalIds.filter(id => !selected.includes(id)),
    } : task.kind === "market" ? {
      kind: "market", segmentId: task.segmentId, intent, approach: approach.trim() || null,
      ...(solutionChanged && solutionIds !== undefined ? { solutionIds } : {}),
      ...(productChanged && productIds !== undefined ? { productIds } : {}),
    } : { kind: "solutions",
      ...(solutionChanged && solutionIds !== undefined ? { solutionIds } : {}),
      ...(productChanged && productIds !== undefined ? { productIds } : {}),
    };
    setPending(true);setError(null);
    try {
      const result = await onSave(change);
      if (result.ok) {if(task.kind==="market")onMarketNoveltyChange?.(novelty);onClose();}
      else setError(PLAN_ERROR[result.error ?? "denied"] ?? PLAN_ERROR.denied);
    } catch { setError(PLAN_ERROR.denied); }
    finally { setPending(false); }
  };
  const q = query.trim().toLocaleLowerCase();
  const markets = marketOptions?.filter(m => (m.status === "active" || originalIds.includes(m.id)) &&
    (!q || `${m.name} ${m.segmentCode} ${JSON.stringify(m.criteria)}`.toLocaleLowerCase().includes(q))) ?? [];
  const title = task.kind === "markets" ? T.linkMarkets : task.kind === "solutions" ? T.linkSolutions : T.marketSettings;
  return <Drawer open onClose={close} width={collectionDrawerWidth.standard} className="max-w-full"
    title={<span className="inline-flex items-center gap-xs">{title}<TitleHelp topic={title}>
      <p>{task.kind === "markets" ? T.relationMarketsHint : task.kind === "market" ? T.relationMarketHint : T.sharedSolutionsHint}</p>
      <p>{draft ? T.relationNewPlanHint : T.relationScopeHint}</p>
    </TitleHelp></span>}
    description={<>{planName}{target ? ` \u00b7 ${target.marketName}` : ""}</>} closeLabel={T.closed}
    footer={<div className="flex w-full flex-col gap-sm">
      {error ? <FieldError role="alert">{error}</FieldError> : null}
      <div className="flex items-center justify-between gap-sm">
        <output className="text-body-small text-muted-foreground">{task.kind !== "market" ? `${T.relationSelectedCount} ${task.kind === "solutions" ? (solutionIds?.length ?? 0) + (productIds?.length ?? 0) : selected.length}` : null}</output>
        <div className="flex gap-sm"><Button size="xl" variant="secondary" disabled={pending} onClick={close}>{T.relationCancel}</Button>
          <Button size="xl" disabled={pending || unavailable || !dirty} onClick={save}>{draft ? T.relationApply : T.relationSave}</Button></div>
      </div>
    </div>}>
    <div className="flex min-w-0 flex-col gap-lg" data-business-form data-strategy-relations-task={task.kind}>
      {task.kind === "solutions" ? <OfferingSelectionList options={solutionOptions} ids={solutionIds} onChange={setSolutionIds}
        productOptions={productOptions} productIds={productIds} onProductChange={setProductIds} disabled={pending}/> : task.kind === "markets" ? <>
        <Input type="search" className="h-control-xl" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={T.searchMarkets} aria-label={T.searchMarkets}/>
        {unavailable ? <p role="status" className="text-body-small text-muted-foreground">{T.marketOptionsUnavailable}</p>
          : <div className="flex flex-col divide-y divide-dashed divide-border">
          {markets.map(m => {
            const prior = targets.find(t => t.segmentId === m.id);
            const locked = !!prior && (prior.solutionIds === undefined || prior.productIds === undefined);
            return <label key={m.id} className={`flex min-w-0 cursor-pointer items-start gap-sm rounded-md px-sm py-md transition-colors hover:bg-accent ${selected.includes(m.id) ? "bg-accent" : ""}`}>
              <Checkbox checked={selected.includes(m.id)} disabled={pending || locked} onCheckedChange={() => toggle(m.id)} aria-label={m.name}/>
              <span className="flex min-w-0 flex-1 flex-col gap-xs">
                <span className="text-body font-medium">{m.name}</span>
                <span className="text-body-small text-muted-foreground">{m.segmentCode}{m.status !== "active" ? ` \u00b7 ${STRATEGY_TEXT.segmentStatusLabel[m.status]}` : ""}</span>
                <span className="text-body-small text-muted-foreground">{[...m.criteria.industries, ...(m.criteria.sizes ?? []), ...m.criteria.regions].join(" / ") || T.undefined}</span>
                {locked ? <span className="text-body-small text-muted-foreground">{T.relationLocked}</span> : null}
              </span>
              <span className="shrink-0 text-body-small text-muted-foreground">{T.customerCount} {m.matched ?? T.unknown}</span>
            </label>;
          })}
          {!markets.length ? <EmptyState title={T.noMatches}/> : null}
        </div>}
        {task.kind === "markets" && originalIds.some(id => !selected.includes(id)) ? <p className="text-body-small text-muted-foreground">{T.relationRemoveHint}</p> : null}
      </> : target ? <>
        {onMarketNoveltyChange?<Field><FieldLabel>{R.marketAttribute}</FieldLabel><StrategyNovelty label={R.marketAttribute} value={novelty} onChange={setNovelty}/></Field>:null}
        <Field><FieldLabel htmlFor="strategy-market-intent">{T.marketIntent}</FieldLabel>
          <FormChoice id="strategy-market-intent" label={T.marketIntent} values={intent ? [intent] : []} disabled={pending}
            options={[{ value: "focus", label: T.focusMarket }, { value: "validate", label: T.validateMarket }]} placeholder={T.unclassifiedMarket}
            onChange={values => setIntent(values[0] as TargetMarketIntent)} />
        </Field>
        <Field><FieldLabel>{T.marketApproach}</FieldLabel><Textarea rows={3} maxLength={4000} aria-label={T.marketApproach} value={approach}
          disabled={pending} placeholder={T.marketApproachHint} onChange={e => setApproach(e.target.value)}/></Field>
        <Field><FieldLabel>{T.primarySolutions}</FieldLabel><OfferingSelectionList productOptions={productOptions} productIds={productIds} onProductChange={setProductIds} options={solutionOptions} ids={solutionIds} onChange={setSolutionIds} disabled={pending}/></Field>
      </> : <EmptyState title={T.noPlanMarkets}/>}
    </div>
  </Drawer>;
}
