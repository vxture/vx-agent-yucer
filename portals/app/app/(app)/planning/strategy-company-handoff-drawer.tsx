"use client";

import { Button, Card, CardContent, Checkbox, Drawer, Field, FieldLabel, Icon, InputGroup, InputGroupAddon, InputGroupInput, NativeSelect, Textarea } from "@vxture/design-ui";
import { MemberPicker } from "../components/member-picker";
import { StrategyQuantity } from "../components/strategy-detail-label";
import { useLocale, useMessages } from "../lib/i18n/provider";
import type { StrategyAcceptance } from "../../domains/planning/strategy-handoff";
import type { PlanSources } from "./plan-data";
import styles from "./strategy-handoff-drawer.module.css";

export type CompanyHandoffDraft = { active: string; choices: StrategyAcceptance[]; selected: string[] };

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
  const rows = draft.choices.filter(x => x.strategyId === draft.active);
  const memberOptions = members.map(m => ({ value: m.sub, label: m.name }));
  const update = (x: StrategyAcceptance) => onChange({ ...draft, choices: draft.choices.map(y => y.key === x.key ? x : y) });
  return <Drawer open width="md" className="max-w-full" title={T.accept} description={`Y${year} \u00b7 ${T.batchHint}`} closeLabel={T.closeDetails} onClose={onClose}
    footer={<div className={styles.footer} data-handoff-footer>
      {error ? <p role="alert" className="text-body-small text-destructive">{error}</p> : null}
      <div className="flex items-center justify-end gap-sm"><Button size="md" variant="secondary" onClick={onClose}>{T.cancel}</Button><Button size="md" disabled={disabled} onClick={onSave}>{T.save}</Button></div>
    </div>}>
    <div className={styles.content} data-business-fields data-handoff-drawer="company">
      <Field><FieldLabel htmlFor="handoff-source">{T.source}</FieldLabel><NativeSelect id="handoff-source" value={draft.active} disabled={disabled} onChange={e => onChange({ ...draft, active: e.target.value })}>
        {groups.map(x => <option key={x.strategyId} value={x.strategyId}>{x.name}{" \u00b7 "}V{x.version}</option>)}
      </NativeSelect></Field>
      <p className="text-body-small text-muted-foreground">{T.companyHelp}</p>
      {rows.map(x => {
        const selected = draft.selected.includes(x.key), locked = x.allocations.some(a => lockedPeriods.includes(a.period));
        const metric = x.expectation.metric === "revenue" ? T.revenueTarget : T[x.expectation.metric];
        const unit = x.expectation.currency ?? T.count;
        const id = `handoff-${x.key}`;
        return <Card key={x.key} className="gap-0 py-lg" data-company-handoff-metric={x.expectation.metric}><CardContent className="flex min-w-0 flex-col gap-lg px-lg">
          <div className="flex min-w-0 items-center justify-between gap-sm">
            <div className="flex min-w-0 items-center gap-sm"><Checkbox id={`${id}-selected`} checked={selected} disabled={disabled || locked} onCheckedChange={checked => onChange({ ...draft, selected: checked === true ? [...draft.selected, x.key] : draft.selected.filter(k => k !== x.key) })}/><FieldLabel htmlFor={`${id}-selected`} className="text-body font-medium">{metric}</FieldLabel></div>
            <span className="inline-flex shrink-0 items-baseline gap-xs text-body-small text-muted-foreground">{T.expected}<StrategyQuantity value={Number(x.expectation.amount).toLocaleString(locale)} unit={unit}/></span>
          </div>
          {selected ? <>
            <div className={styles.companyFields}>
              <Field className="min-w-0"><FieldLabel htmlFor={`${id}-amount`}>{T.accepted}</FieldLabel><InputGroup className={x.expectation.metric === "revenue" ? "w-44 max-w-full" : "w-24 max-w-full"}>
                <InputGroupInput id={`${id}-amount`} inputMode={x.expectation.metric === "revenue" ? "decimal" : "numeric"} value={x.amount} disabled={disabled} onChange={e => update({ ...x, amount: e.target.value })}/><InputGroupAddon align="end">{unit}</InputGroupAddon>
              </InputGroup></Field>
              <Field className={styles.companyOwner}><FieldLabel htmlFor={`${id}-owner`}>{T.owner}</FieldLabel><MemberPicker id={`${id}-owner`} className="w-40 max-w-full" label={`${T.owner} ${metric}`} options={memberOptions} value={x.ownerSub} disabled={disabled} onValueChange={sub => update({ ...x, ownerSub: sub || null })}/></Field>
            </div>
            <Field><FieldLabel htmlFor={`${id}-note`}>{x.expectation.metric === "revenue" ? T.note : T.criterion}</FieldLabel><Textarea id={`${id}-note`} rows={2} maxLength={1000} disabled={disabled} value={x.note} placeholder={x.expectation.criterion || undefined} onChange={e => update({ ...x, note: e.target.value })}/></Field>
            {locked ? <p className="inline-flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="lock" size="xs"/>{T.removeLocked}</p> : null}
          </> : null}
        </CardContent></Card>;
      })}
    </div>
  </Drawer>;
}
