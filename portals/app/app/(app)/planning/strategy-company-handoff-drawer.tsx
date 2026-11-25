"use client";

import { Button, Card, CardContent, Checkbox, Drawer, FieldLabel, Icon, InputGroup, InputGroupAddon, InputGroupInput, Textarea } from "@vxture/design-ui";
import { MemberPicker } from "../components/member-picker";
import { TitleHelp } from "../components/title-help";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type { StrategyAcceptance } from "../../domains/planning/strategy-handoff";
import { ACCEPTANCE_METRICS } from "../../domains/planning/strategy-acceptance-workspace";
import type { PlanSources } from "./plan-data";
import styles from "./strategy-handoff-drawer.module.css";

import { companyHandoffSummary, toggleCompanyStrategy, type CompanyHandoffDraft } from "../lib/company-handoff";
export type { CompanyHandoffDraft } from "../lib/company-handoff";

export function StrategyCompanyHandoffDrawer({ draft, members, year, lockedPeriods, disabled, error, onChange, onSave, onClose }: Readonly<{
  draft: CompanyHandoffDraft;
  members: PlanSources["members"];
  year: number;
  lockedPeriods: readonly string[];
  disabled?: boolean;
  error: string;
  onChange: (draft: CompanyHandoffDraft) => void;
  onSave: () => void;
  onClose: () => void;
}>) {
  const { STRATEGY_HANDOFF_TEXT: T } = useMessages(), locale = useLocale();
  const groups = [...new Set(draft.choices.map(x => x.strategyId))].map(id => draft.choices.find(x => x.strategyId === id)!);
  const summary = companyHandoffSummary(draft);
  const memberOptions = members.map(m => ({ value: m.sub, label: m.name }));
  const update = (x: StrategyAcceptance) => onChange({ ...draft, choices: draft.choices.map(y => y.key === x.key ? x : y) });
  return <Drawer open width="md" className="max-w-full" title={T.accept} description={`Y${year}`} closeLabel={T.closeDetails} onClose={onClose}
    footer={<div className={styles.footer} data-handoff-footer>
      {error ? <p role="alert" className="text-body-small text-destructive">{error}</p> : null}
      <div className="flex items-center justify-end gap-sm"><Button data-control-kind="drawer-action" size="xl" variant="secondary" onClick={onClose}>{T.cancel}</Button><Button data-control-kind="drawer-action" size="xl" disabled={disabled || summary.invalid} onClick={onSave}>{T.applySelection}</Button></div>
    </div>}>
    <div className={`${styles.content} ${styles.companyContent}`} data-business-fields data-handoff-drawer="company">
      <div className="flex flex-col gap-sm rounded-md border bg-muted/30 p-md" data-company-handoff-summary>
        <div className="flex items-center justify-between gap-md"><strong className="text-body">{T.selectedSummary(summary.strategies, summary.metrics)}</strong><TitleHelp topic={T.source}>{T.companyHelp}{" "}{T.multiStrategyHelp}</TitleHelp></div>
        <p className="text-body-small text-muted-foreground">{T.multiStrategyHelp}</p>
        <div className="flex flex-wrap gap-md">{summary.totals.map(t => <span key={`${t.metric}:${t.currency}`} className="text-body-small text-muted-foreground">{t.metric === "revenue" ? T.revenueTarget : T[t.metric]} <strong className="text-foreground tabular-nums">{Number(t.amount).toLocaleString(locale)} {t.currency ?? T.count}</strong></span>)}</div>
        {summary.invalid ? <p role="alert" className="text-body-small text-destructive">{T.validation}</p> : null}
      </div>
      {groups.map(group => {
        const rows = draft.choices.filter(x => x.strategyId === group.strategyId).sort((a, b) => ACCEPTANCE_METRICS.indexOf(a.expectation.metric) - ACCEPTANCE_METRICS.indexOf(b.expectation.metric));
        const selected = rows.filter(x => draft.selected.includes(x.key)).length;
        const expanded = draft.active === group.strategyId;
        const locked = rows.every(x => x.allocations.some(a => lockedPeriods.includes(a.period)));
        return <section key={group.strategyId} className="flex flex-col gap-sm" data-company-handoff-strategy>
          <div className="flex items-center gap-sm rounded-md bg-muted/40 px-md py-xs">
            <Checkbox aria-label={`${T.selectStrategy} ${group.name}`} checked={selected === rows.length ? true : selected ? "indeterminate" : false} disabled={disabled || locked} onCheckedChange={checked => onChange(toggleCompanyStrategy(draft, group.strategyId, checked === true, lockedPeriods))}/>
            <Button size="xl" variant="ghost" className="h-auto min-h-control-xl min-w-0 flex-1 justify-between px-0" aria-expanded={expanded} onClick={() => onChange({ ...draft, active: expanded ? "" : group.strategyId })}>
              <span className="truncate text-left">{group.name}</span><span className="inline-flex shrink-0 items-center gap-sm text-body-small text-muted-foreground">V{group.version} {selected}/{rows.length}<Icon name={expanded ? "chevron-up" : "chevron-down"} size="sm"/></span>
            </Button>
          </div>
          {expanded ? <div className="flex flex-col gap-sm">
      {rows.map(x => {
        const selected = draft.selected.includes(x.key), locked = x.allocations.some(a => lockedPeriods.includes(a.period));
        const metric = x.expectation.metric === "revenue" ? T.revenueTarget : T[x.expectation.metric];
        const unit = x.expectation.currency ?? T.count;
        const id = `handoff-${x.key}`;
        const reference = `${T.expected}: ${Number(x.expectation.amount).toLocaleString(locale)} ${unit}${x.expectation.criterion ? ` \u00b7 ${x.expectation.criterion}` : ""}`;
        return <Card key={x.key} className="gap-0 py-md" data-company-handoff-metric={x.expectation.metric}><CardContent className={`${styles.companyMetric} px-md`}>
          <div className="flex h-control-md items-center"><Checkbox id={`${id}-selected`} aria-label={`${T.accept} ${metric}`} checked={selected} disabled={disabled || locked} onCheckedChange={checked => onChange({ ...draft, selected: checked === true ? [...draft.selected, x.key] : draft.selected.filter(k => k !== x.key) })}/></div>
          <div className="flex min-w-0 flex-col gap-sm">
            <div className={styles.companyFields}>
                <InputGroup>
                  <InputGroupAddon><FieldLabel htmlFor={`${id}-amount`} title={reference} className="whitespace-nowrap text-body font-normal">{metric}</FieldLabel></InputGroupAddon>
                  <InputGroupInput id={`${id}-amount`} aria-label={`${T.accepted} ${metric}`} inputMode={x.expectation.metric === "revenue" ? "decimal" : "numeric"} className="text-right font-medium tabular-nums" value={x.amount} disabled={disabled || !selected} onChange={e => update({ ...x, amount: e.target.value })}/><InputGroupAddon align="end">{unit}</InputGroupAddon>
                </InputGroup>
              <MemberPicker id={`${id}-owner`} className="w-full min-w-0" label={`${T.owner} ${metric}`} options={memberOptions} value={x.ownerSub} disabled={disabled || !selected} onValueChange={sub => update({ ...x, ownerSub: sub || null })}/>
            </div>
          {selected ? <>
            <Textarea id={`${id}-note`} aria-label={`${metric} ${x.expectation.metric === "revenue" ? T.note : T.criterion}`} rows={1} className="min-h-control-md resize-none" maxLength={1000} disabled={disabled} value={x.note} placeholder={x.expectation.metric === "revenue" ? T.note : T.criterion} onChange={e => update({ ...x, note: e.target.value })}/>
            {locked ? <p className="inline-flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="lock" size="xs"/>{T.removeLocked}</p> : null}
          </> : null}
          </div>
        </CardContent></Card>;
      })}
          </div> : null}
        </section>;
      })}
    </div>
  </Drawer>;
}
