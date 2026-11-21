"use client";

import Link from "next/link";
import { Button, Card, CardContent, Drawer, Field, FieldLabel, Icon, InputGroup, InputGroupAddon, InputGroupInput, NativeSelect } from "@vxture/design-ui";
import { MemberPicker } from "../components/member-picker";
import { Tag } from "../components/tag";
import { MemberName } from "../lib/member-names";
import { StrategyQuantity } from "../components/strategy-detail-label";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type { PlanContent } from "../../domains/planning/plan-model";
import type { StrategyAcceptance } from "../../domains/planning/strategy-handoff";
import { allocateRegionalStrategicTarget } from "../../domains/planning/strategy-autofill";
import { expectationWindow } from "../../domains/strategy/lib/expectations";
import type { PlanSources } from "./plan-data";
import styles from "./strategy-handoff-drawer.module.css";

export function StrategyHandoffDrawer({ draft, content, members, regionId, canEdit, disabled, lockedPeriods, error, onChange, onSave, onClose }: Readonly<{
  draft: StrategyAcceptance;
  content: PlanContent;
  members: PlanSources["members"];
  regionId?: string | null;
  canEdit: boolean;
  disabled?: boolean;
  lockedPeriods: readonly string[];
  error: string;
  onChange: (draft: StrategyAcceptance) => void;
  onSave: () => void;
  onClose: () => void;
}>) {
  const { STRATEGY_HANDOFF_TEXT: T, PLAN_VERSION_TEXT: P } = useMessages();
  const locale = useLocale();
  const company = !regionId;
  const region = content.regions.find(r => r.id === regionId);
  const unit = draft.expectation.currency ?? T.count;
  const metric = draft.expectation.metric === "revenue" ? T.revenueTarget : T[draft.expectation.metric];
  const format = (value: string | number) => Number(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  const memberOptions = members.map(m => ({ value: m.sub, label: m.name }));
  const window = expectationWindow(draft.period, content.year);
  const cells = content.regions.filter(r => r.included).flatMap(r => content.periods.filter(p =>
    window && p.parent === `Y${content.year}` && p.start <= window.end && window.start < p.end,
  ).map(p => ({ regionId: r.id, period: p.key, name: r.name, ownerSub: r.ownerSub })));
  const openCells = cells.filter(cell => cell.regionId === regionId && !lockedPeriods.includes(cell.period));
  const available = openCells.filter(cell => !draft.allocations.some(a => a.regionId === cell.regionId && a.period === cell.period));
  const allocations = draft.allocations.filter(a => !regionId || a.regionId === regionId);
  const allocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const remaining = Number(draft.amount) - draft.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const amountInput = (id: string, value: string, change: (value: string) => void, locked = false) => <InputGroup className={draft.expectation.metric === "revenue" ? "w-44 max-w-full" : "w-24 max-w-full"}>
    <InputGroupInput id={id} inputMode={draft.expectation.metric === "revenue" ? "decimal" : "numeric"} value={value} disabled={disabled || locked} onChange={e => change(e.target.value)}/>
    <InputGroupAddon align="end">{unit}</InputGroupAddon>
  </InputGroup>;
  return <Drawer open width="md" className="max-w-full" title={company ? T.acceptanceDetails : canEdit ? T.editAllocation : T.details}
    description={`${region ? `${region.name} \u00b7 ` : ""}Y${content.year} \u00b7 ${metric}`} closeLabel={T.closeDetails} onClose={onClose}
    footer={<div className={styles.footer} data-handoff-footer>
      {error ? <p role="alert" className="text-body-small text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-sm">
        <div className="flex items-center gap-sm"><Button size="md" variant="secondary" onClick={onClose}>{canEdit ? T.cancel : T.closeDetails}</Button>
          {canEdit ? <Button size="md" disabled={disabled} onClick={onSave}>{company ? T.save : T.confirmBreakdown}</Button> : null}</div>
      </div>
    </div>}>
    <div className={styles.content} data-business-fields data-handoff-drawer={company ? "company" : "region"}>
      <Card className="gap-0 py-md"><CardContent className="flex min-w-0 flex-col gap-md px-md">
        <Link href={`/strategy/${draft.strategyId}`} className="inline-flex min-w-0 items-start gap-xs text-body font-medium transition-colors hover:text-primary-text"><Icon name="flag" size="sm" className="shrink-0 text-muted-foreground"/><span className="min-w-0 break-words">{draft.name}</span></Link>
        <div className="flex flex-wrap items-center gap-x-lg gap-y-xs text-body-small text-muted-foreground"><span>V{draft.version}{" \u00b7 "}{draft.period}</span>{!company ? <span className="inline-flex items-center gap-xs" title={T.owner}><MemberName sub={draft.ownerSub}/></span> : null}</div>
        <dl className="flex flex-wrap gap-x-xl gap-y-md border-t border-border pt-md">
          {[{ label: T.expected, value: draft.expectation.amount }, { label: T.accepted, value: draft.amount }].map(item => <div key={item.label} className="flex min-w-0 flex-col gap-xs">
            <dt className="text-body-small text-muted-foreground">{item.label}</dt><dd className="text-body font-medium"><StrategyQuantity value={format(item.value)} unit={unit}/></dd>
          </div>)}
        </dl>
      </CardContent></Card>
      {company ? <div className="flex flex-col gap-lg">
        <Field className="self-end"><FieldLabel>{T.owner}</FieldLabel><span className="text-body"><MemberName sub={draft.ownerSub}/></span></Field>
        <Field><FieldLabel>{draft.expectation.metric === "revenue" ? T.note : T.criterion}</FieldLabel><p className="whitespace-pre-wrap break-words text-body">{draft.note || draft.expectation.criterion || "\u2014"}</p></Field>
      </div> : <div className="flex flex-col gap-md">
        <div className="flex flex-wrap items-center justify-between gap-sm"><h3 className="text-body font-medium">{T.regionalBreakdown}</h3>{canEdit ? <div className="flex items-center gap-sm">
          <Button size="md" variant="secondary" disabled={disabled || !regionId || !openCells.length} onClick={() => { if (regionId) onChange(allocateRegionalStrategicTarget(content, draft, regionId, lockedPeriods, () => crypto.randomUUID())); }}><Icon name="magic-wand" size="sm"/>{T.auto}</Button>
          <Button size="md" variant="secondary" disabled={disabled || !available.length} onClick={() => { const cell = available[0]; if (cell) onChange({ ...draft, allocations: [...draft.allocations, { key: crypto.randomUUID(), regionId: cell.regionId, period: cell.period, amount: "0", ownerSub: cell.ownerSub ?? draft.ownerSub }] }); }}><Icon name="plus" size="sm"/>{T.addAllocation}</Button>
        </div> : null}</div>
        <dl className="flex flex-wrap gap-x-xl gap-y-xs text-body-small"><div className="inline-flex items-baseline gap-xs"><dt className="text-muted-foreground">{T.allocated}</dt><dd><StrategyQuantity value={format(allocated)} unit={unit}/></dd></div><div className="inline-flex items-baseline gap-xs"><dt className="text-muted-foreground">{T.unallocated}</dt><dd className={remaining < 0 ? "text-destructive" : undefined}><StrategyQuantity value={format(remaining)} unit={unit}/></dd></div></dl>
        {!allocations.length ? <p className="text-body-small text-muted-foreground" role="status">{T.noAllocations}</p> : null}
        {allocations.map(a => {
          const locked = lockedPeriods.includes(a.period);
          const choices = cells.filter(cell => cell.regionId === a.regionId && cell.period === a.period || cell.regionId === regionId && !lockedPeriods.includes(cell.period) && !draft.allocations.some(y => y.key !== a.key && y.regionId === cell.regionId && y.period === cell.period));
          const update = (patch: Partial<typeof a>) => onChange({ ...draft, allocations: draft.allocations.map(y => y.key === a.key ? { ...y, ...patch } : y) });
          return <Card key={a.key} className="gap-0 py-md" data-handoff-allocation={a.key}><CardContent className="flex min-w-0 flex-col gap-md px-md">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <div className="flex min-w-0 flex-wrap items-center gap-sm">{canEdit && !locked ? <NativeSelect wrapperClassName="w-auto max-w-full" className="w-auto max-w-48" aria-label={`${T.period} ${a.period}`} value={`${a.regionId}|${a.period}`} disabled={disabled} onChange={e => { const [regionId, period] = e.target.value.split("|"); if (regionId && period) update({ regionId, period }); }}>{choices.map(cell => <option key={`${cell.regionId}|${cell.period}`} value={`${cell.regionId}|${cell.period}`}>{cell.name}{" \u00b7 "}{cell.period}</option>)}</NativeSelect> : <span className="text-body font-medium">{content.regions.find(r => r.id === a.regionId)?.name}{" \u00b7 "}{a.period}</span>}
                <span className="inline-flex max-w-full" title={T.owner}>{canEdit && !locked ? <MemberPicker id={`handoff-owner-${a.key}`} className="w-auto max-w-48" label={`${T.owner} ${a.period}`} disabled={disabled} value={a.ownerSub} options={memberOptions} onValueChange={sub => update({ ownerSub: sub || null })}/> : <span className="text-body"><MemberName sub={a.ownerSub}/></span>}</span>
                {locked ? <Tag>{P.lockedPeriod}</Tag> : null}
              </div>
              {canEdit ? <Button size="icon-sm" variant="ghost" aria-label={`${T.removeAllocation} ${a.period}`} title={T.removeAllocation} disabled={locked || disabled} onClick={() => onChange({ ...draft, allocations: draft.allocations.filter(y => y.key !== a.key) })}><Icon name="trash" size="sm"/></Button> : null}
            </div>
            <div className="flex flex-wrap items-center gap-sm">
              <FieldLabel htmlFor={`handoff-value-${a.key}`}>{T.value}</FieldLabel>{canEdit && !locked ? amountInput(`handoff-value-${a.key}`, a.amount, amount => update({ amount })) : <span className="text-body"><StrategyQuantity value={format(a.amount)} unit={unit}/></span>}
            </div>
          </CardContent></Card>;
        })}
      </div>}
    </div>
  </Drawer>;
}
