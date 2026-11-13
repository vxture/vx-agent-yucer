"use client";

import { useState } from "react";
import { Button, Checkbox, Combobox, Drawer, EmptyState, Field, FieldDescription, FieldError, FieldLabel, Icon, Input, NativeSelect, Textarea } from "@vxture/design-ui";
import type { SolutionReference } from "../../domains/catalog/service";
import type { PlanRelationChange, TargetMarketDraft, TargetMarketIntent } from "../../domains/strategy/lib/lifecycle";
import type { MarketView } from "../lib/market-strategy";
import { useMessages } from "../lib/i18n/provider";

export type RelationMarketOption = Pick<MarketView, "id" | "name" | "segmentCode" | "status" | "criteria" | "matched" | "missing">;
export type RelationTarget = TargetMarketDraft & { marketName: string };
export type RelationTask = { kind: "markets" } | { kind: "solutions" } | { kind: "market"; segmentId: string };

function SolutionPicker({ options, ids, onChange, disabled }: {
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

// Mounted per task: reopening starts from current links, never a cancelled draft.
export function StrategyRelationsDrawer({ task, planName, targets, sharedSolutionIds, marketOptions, solutionOptions, onSave, onClose, draft = false }: {
  readonly task: RelationTask;
  readonly planName: string;
  readonly targets: readonly RelationTarget[];
  readonly sharedSolutionIds: readonly string[] | undefined;
  readonly marketOptions: readonly RelationMarketOption[] | null;
  readonly solutionOptions: readonly SolutionReference[] | null;
  readonly onSave: (change: PlanRelationChange) => Promise<{ ok: boolean; error?: string }>;
  readonly onClose: () => void;
  readonly draft?: boolean;
}) {
  const { MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT, PLAN_ERROR } = useMessages();
  const target = task.kind === "market" ? targets.find(t => t.segmentId === task.segmentId) : undefined;
  const [selected, setSelected] = useState<readonly string[]>(task.kind === "markets" ? targets.map(t => t.segmentId) : sharedSolutionIds ?? []);
  const [intent, setIntent] = useState(target?.intent ?? null);
  const [approach, setApproach] = useState(target?.approach ?? "");
  const [solutionIds, setSolutionIds] = useState(target?.solutionIds);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const originalIds = task.kind === "markets" ? targets.map(t => t.segmentId) : sharedSolutionIds ?? [];
  const solutionChanged = JSON.stringify(solutionIds) !== JSON.stringify(target?.solutionIds);
  const dirty = task.kind === "market" ? intent !== target?.intent || approach !== (target?.approach ?? "") || solutionChanged
    : selected.length !== originalIds.length || selected.some(id => !originalIds.includes(id));
  const unavailable = task.kind === "markets" ? marketOptions === null
    : task.kind === "solutions" ? solutionOptions === null || sharedSolutionIds === undefined : !target;
  const close = () => { if (!pending) onClose(); };
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const save = async () => {
    if (pending || unavailable || !dirty) return;
    const change: PlanRelationChange = task.kind === "markets" ? {
      kind: "markets", add: selected.filter(id => !originalIds.includes(id)), remove: originalIds.filter(id => !selected.includes(id)),
    } : task.kind === "market" ? {
      kind: "market", segmentId: task.segmentId, intent, approach: approach.trim() || null,
      ...(solutionChanged && solutionIds !== undefined ? { solutionIds } : {}),
    } : { kind: "solutions", solutionIds: selected };
    setPending(true);setError(null);
    try {
      const result = await onSave(change);
      if (result.ok) onClose();
      else setError(PLAN_ERROR[result.error ?? "denied"] ?? PLAN_ERROR.denied);
    } catch { setError(PLAN_ERROR.denied); }
    finally { setPending(false); }
  };
  const q = query.trim().toLocaleLowerCase();
  const markets = marketOptions?.filter(m => (m.status === "active" || originalIds.includes(m.id)) &&
    (!q || `${m.name} ${m.segmentCode} ${JSON.stringify(m.criteria)}`.toLocaleLowerCase().includes(q))) ?? [];
  const solutions = solutionOptions?.filter(s => (s.status === "active" || originalIds.includes(s.id)) &&
    (!q || `${s.name} ${s.solutionCode}`.toLocaleLowerCase().includes(q))) ?? [];
  return <Drawer open onClose={close} width="md" className="max-w-full"
    title={task.kind === "markets" ? T.linkMarkets : task.kind === "solutions" ? T.linkSolutions : T.marketSettings}
    description={<>{planName}{target ? ` \u00b7 ${target.marketName}` : ""}</>} closeLabel={T.closed}
    footer={<div className="flex w-full flex-col gap-sm">
      {error ? <FieldError role="alert">{error}</FieldError> : null}
      <div className="flex items-center justify-between gap-sm">
        <span className="text-body-small text-muted-foreground">{task.kind !== "market" ? `${T.relationSelectedCount} ${selected.length}` : null}</span>
        <div className="flex gap-sm"><Button size="xl" variant="secondary" disabled={pending} onClick={close}>{T.relationCancel}</Button>
          <Button size="xl" disabled={pending || unavailable || !dirty} onClick={save}>{draft ? T.relationApply : T.relationSave}</Button></div>
      </div>
    </div>}>
    <div className="flex min-w-0 flex-col gap-lg" data-strategy-relations-task={task.kind}>
      <p className="text-body-small text-muted-foreground">{task.kind === "markets" ? T.relationMarketsHint : task.kind === "market" ? T.relationMarketHint : T.sharedSolutionsHint}</p>
      {task.kind !== "market" ? <>
        <Input type="search" className="h-control-xl" value={query} onChange={e => setQuery(e.target.value)}
          placeholder={task.kind === "markets" ? T.searchMarkets : T.searchSolutions} aria-label={task.kind === "markets" ? T.searchMarkets : T.searchSolutions}/>
        {unavailable ? <p role="status" className="text-body-small text-muted-foreground">{task.kind === "markets" ? T.marketOptionsUnavailable : T.solutionOptionsUnavailable}</p>
          : <div className="flex flex-col divide-y divide-dashed divide-primary/10">
          {task.kind === "markets" ? markets.map(m => {
            const prior = targets.find(t => t.segmentId === m.id);
            const locked = !!prior && prior.solutionIds === undefined;
            return <label key={m.id} className="flex cursor-pointer items-start gap-sm py-md">
              <Checkbox checked={selected.includes(m.id)} disabled={pending || locked} onCheckedChange={() => toggle(m.id)} aria-label={m.name}/>
              <span className="flex min-w-0 flex-1 flex-col gap-xs">
                <span className="text-body font-medium">{m.name}</span>
                <span className="text-body-small text-muted-foreground">{m.segmentCode}{m.status !== "active" ? ` \u00b7 ${STRATEGY_TEXT.segmentStatusLabel[m.status]}` : ""}</span>
                <span className="text-body-small text-muted-foreground">{[...m.criteria.industries, ...(m.criteria.sizes ?? []), ...m.criteria.regions].join(" / ") || T.undefined}</span>
                {locked ? <span className="text-body-small text-muted-foreground">{T.relationLocked}</span> : null}
              </span>
              <span className="shrink-0 text-body-small text-muted-foreground">{T.customerCount} {m.matched ?? T.unknown}</span>
            </label>;
          }) : solutions.map(s => <label key={s.id} className="flex cursor-pointer items-start gap-sm py-md">
            <Checkbox checked={selected.includes(s.id)} disabled={pending} onCheckedChange={() => toggle(s.id)} aria-label={s.name}/>
            <span className="flex min-w-0 flex-col gap-xs"><span className="text-body font-medium">{s.name}</span>
              <span className="text-body-small text-muted-foreground">{s.solutionCode}{s.status === "retired" ? ` \u00b7 ${T.retiredSolution}` : ""}</span></span>
          </label>)}
          {!(task.kind === "markets" ? markets : solutions).length ? <EmptyState title={T.noMatches}/> : null}
        </div>}
        {task.kind === "markets" && originalIds.some(id => !selected.includes(id)) ? <p className="text-body-small text-muted-foreground">{T.relationRemoveHint}</p> : null}
      </> : target ? <>
        <Field><FieldLabel>{T.marketIntent}</FieldLabel><NativeSelect value={intent ?? ""} aria-label={T.marketIntent} disabled={pending} onChange={e => setIntent(e.target.value as TargetMarketIntent)}>
          {intent === null ? <option value="" disabled>{T.unclassifiedMarket}</option> : null}
          <option value="focus">{T.focusMarket}</option><option value="validate">{T.validateMarket}</option>
        </NativeSelect></Field>
        <Field><FieldLabel>{T.marketApproach}</FieldLabel><Textarea rows={3} maxLength={4000} aria-label={T.marketApproach} value={approach}
          disabled={pending} placeholder={T.marketApproachHint} onChange={e => setApproach(e.target.value)}/></Field>
        <Field><FieldLabel>{T.primarySolutions}</FieldLabel><SolutionPicker options={solutionOptions} ids={solutionIds} onChange={setSolutionIds} disabled={pending}/></Field>
      </> : <EmptyState title={T.noPlanMarkets}/>}
      <p className="border-t border-dashed border-primary/10 pt-md text-body-small text-muted-foreground">{draft ? T.relationNewPlanHint : T.relationScopeHint}</p>
    </div>
  </Drawer>;
}
