"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import businessLinks from "../components/business-reference.module.css";
import { Button, Card, CardContent, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon } from "@vxture/design-ui";
import { TitleHelp } from "../components/title-help";
import { StrategyQuantity } from "../components/strategy-detail-label";
import { useMessages, useLocale } from "../lib/i18n/provider";
import { PlanError } from "../../domains/planning/plan-values";
import type { PlanContent } from "../../domains/planning/plan-model";
import type { PlanSources } from "./plan-data";
import { validateStrategyAcceptances, type StrategyAcceptance } from "../../domains/planning/strategy-handoff";
import { planningValidationContent } from "../../domains/planning/plan-validation-scope";
import { acceptanceSources, acceptanceSummary, groupAcceptances, proposeAcceptance } from "../../domains/planning/strategy-acceptance-workspace";
import { StrategyHandoffDrawer } from "./strategy-handoff-drawer";
import { StrategyCompanyHandoffDrawer, type CompanyHandoffDraft } from "./strategy-company-handoff-drawer";
import styles from "./strategy-handoff-panel.module.css";
import { CommitmentRevenue } from "./commitment-overview";

const preferenceKey = "yucer.planning.strategy-handoff.expanded";
export function StrategyHandoffPanel({ content, sources, edit, regionId, disabled, lockedPeriods = [], onManage, isDraft = false, manageRequest = 0, expandRequest = 0 }: { content: PlanContent; sources: PlanSources; edit: ((c: PlanContent) => void) | null; regionId?: string | null; disabled?: boolean; lockedPeriods?: string[]; onManage?: () => void; isDraft?: boolean; manageRequest?: number; expandRequest?: number }) {
  const { STRATEGY_HANDOFF_TEXT: T, PLAN_VERSION_ERROR: E, PLANNING_COMMITMENT_TEXT: C } = useMessages(), locale = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StrategyAcceptance | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyHandoffDraft | null>(null);
  const [error, setError] = useState("");
  const handledRequest = useRef(0);
  useEffect(() => { try { setOpen(localStorage.getItem(preferenceKey) === "true"); } catch { /* Optional display preference. */ } }, []);
  const changeOpen = (value: boolean) => { setOpen(value); try { localStorage.setItem(preferenceKey, String(value)); } catch { /* Optional display preference. */ } };
  useEffect(() => {
    if (!expandRequest) return;
    changeOpen(true);
    const frame = requestAnimationFrame(() => document.getElementById("planning-strategy-handoff")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }));
    return () => cancelAnimationFrame(frame);
  }, [expandRequest]);
  const company = !regionId;
  const canEdit = !!edit && (company ? content.releaseScope !== "regions" : content.releaseScope !== "company");
  const rows = (content.strategyAcceptances ?? []).filter(x => !regionId || canEdit || x.allocations.some(a => a.regionId === regionId));
  const eligible = acceptanceSources(sources.strategies ?? [], content.year);
  const groups = groupAcceptances(rows, sources.strategies ?? []);
  const totals = acceptanceSummary(rows, regionId).filter(t => t.metric === "revenue");
  const specialTargets = rows.filter(x => x.expectation.metric !== "revenue").length;
  const format = (value: string) => {
    const [whole, fraction] = value.split(".");
    const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find(p => p.type === "decimal")?.value ?? ".";
    return `${BigInt(whole!).toLocaleString(locale)}${fraction && Number(fraction) ? decimal + fraction.replace(/0+$/, "") : ""}`;
  };
  const saveRows = (nextRows: StrategyAcceptance[]) => {
    if (!canEdit || disabled) return;
    const next = { ...content, strategyAcceptances: nextRows };
    try { validateStrategyAcceptances(planningValidationContent(next), false); edit?.(next); setError(""); setDraft(null); setCompanyDraft(null); }
    catch (error) { setError(error instanceof PlanError ? E[error.code] ?? T.validation : T.validation); }
  };
  const startCompany = (strategyId?: string) => {
    setError("");
    const choices = [...(content.strategyAcceptances ?? []).map(x => structuredClone(x))];
    for (const p of eligible) for (const e of p.expectations) {
      const candidate = proposeAcceptance(content, p, e, sources.currentSub ?? null, crypto.randomUUID());
      if (!choices.some(x => x.key === candidate.key)) choices.push(candidate);
    }
    const active = strategyId ?? choices.find(x => !(content.strategyAcceptances ?? []).some(y => y.key === x.key))?.strategyId ?? choices[0]?.strategyId;
    if (!active) return;
    const selected = (content.strategyAcceptances ?? []).map(x => x.key);

    setCompanyDraft({ active, choices, selected });
  };
  useEffect(() => {
    if (!manageRequest || handledRequest.current === manageRequest || !canEdit || !company || !sources.canStrategy || disabled) return;
    handledRequest.current = manageRequest;
    startCompany();
  }, [manageRequest, canEdit, company, disabled]);
  const canRemove = (x: StrategyAcceptance) => canEdit && company && !x.allocations.some(a => lockedPeriods.includes(a.period));
  return <Card id="planning-strategy-handoff" className={`${styles.panel} gap-0 border-primary/15 bg-primary/5 py-lg`} data-strategy-handoff>
    <CardContent className="px-lg"><Collapsible open={open} onOpenChange={changeOpen}>
      <div className={styles.heading}>
        <div className="inline-flex shrink-0 items-center gap-sm"><Icon name="workflow" size="sm"/><span className="text-body font-medium">{T.handoff}</span><span className="text-body-small text-muted-foreground">Y{content.year}{" / "}{groups.length} {T.strategyCount}{" / "}{rows.length} {C.countMetrics}</span><TitleHelp topic={T.handoff}>{company ? T.companyHelp : T.allocationHelp}{" "}{C.reconcileHelp}{" "}{C.countHelp}</TitleHelp></div>
        <dl className={styles.summary} data-handoff-summary>{totals.map(t => <div key={`${t.metric}|${t.currency ?? ""}`}>
          <dt className="whitespace-nowrap text-body-small text-muted-foreground">{C.strategic}</dt><dd className="text-body font-semibold"><StrategyQuantity value={t.pending === rows.filter(x => x.expectation.metric === t.metric && x.expectation.currency === t.currency).length ? T.pendingAllocation : format(t.amount)} unit={t.currency ?? T.count}/></dd>
        </div>)}{specialTargets ? <div><dt className="text-body-small text-muted-foreground">{C.special}</dt><dd className="text-body">{specialTargets} {C.targetUnit}</dd></div> : null}{!rows.length ? <span className="text-body-small text-muted-foreground">{sources.canStrategy ? (eligible.length ? T.none : T.noSources) : T.sourceDenied}</span> : null}</dl>
        <div className={styles.headingActions}>
          {canEdit && company && sources.canStrategy ? <Button size="md" variant="secondary" disabled={disabled || !eligible.length} onClick={() => startCompany()}>{C.manage}</Button> : onManage && company && sources.canStrategy ? <Button size="md" variant="secondary" disabled={disabled} onClick={onManage}>{C.manage}</Button> : null}
          <CollapsibleTrigger asChild><Button size="md" variant="ghost" className="text-muted-foreground" data-handoff-toggle aria-label={open ? T.collapse : T.expand}>{open ? T.collapseLabel : T.expandLabel}<Icon name={open ? "chevron-up" : "chevron-down"} size="sm"/></Button></CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent><div className="pt-lg"><CommitmentRevenue content={content} regionId={regionId} draft={isDraft}/></div><div data-strategy-acceptances>{groups.map(group => {
        const first = group[0]!, latest = sources.strategies?.find(p => (p.lineageId ?? p.id) === first.lineageId);
        return <div key={first.strategyId} className={styles.strategy} data-handoff-strategy={first.strategyId}>
          <div className="flex min-w-0 items-center justify-between gap-lg"><Link href={`/strategy/${encodeURIComponent(first.strategyId)}`} className={`${businessLinks.link} inline-flex min-w-0 items-center gap-sm text-body font-medium`}><Icon name="flag" size="sm" className="shrink-0"/><span className="truncate" title={first.name}>{first.name}</span></Link><span className="shrink-0 text-body-small text-muted-foreground">V{first.version}{" \u00b7 "}{first.period}{latest && latest.id !== first.strategyId ? <span className="ml-sm" title={T.updated}>{T.newVersion}</span> : null}</span></div>
          <div className={styles.metrics}>{group.map(x => {
            const allocations = x.allocations.filter(a => a.regionId === regionId);
            const value = regionId ? acceptanceSummary([x], regionId)[0]!.amount : x.amount;
            return <div key={x.key} className={styles.metric} data-strategy-acceptance-metric={x.expectation.metric}>
              <span className="shrink-0 text-body-small text-muted-foreground">{x.expectation.metric === "revenue" ? T.revenueTarget : T[x.expectation.metric]}</span>
              <strong className="text-body font-semibold"><StrategyQuantity value={regionId && !allocations.length ? T.pendingAllocation : format(value)} unit={x.expectation.currency ?? T.count}/></strong>
              <span className={styles.actions}><Button size="sm" variant="secondary" className="text-muted-foreground" disabled={disabled} onClick={() => { setError(""); if (company && canEdit) startCompany(x.strategyId); else setDraft(structuredClone(x)); }}>{canEdit ? (company ? T.edit : T.editAllocation) : (company ? T.acceptanceDetails : T.details)}</Button>
                {canEdit && company ? <Button size="icon-sm" variant="ghost" className="text-muted-foreground" title={canRemove(x) ? T.remove : T.removeLocked} aria-label={`${T.remove} ${T[x.expectation.metric]}`} disabled={disabled || !canRemove(x)} onClick={() => saveRows((content.strategyAcceptances ?? []).filter(y => y.key !== x.key))}><Icon name="x" size="xs"/></Button> : null}
              </span>
            </div>;
          })}</div>
        </div>;
      })}</div></CollapsibleContent>
      {error && !draft && !companyDraft ? <p role="alert" className="mt-sm text-body-small text-destructive">{error}</p> : null}
    </Collapsible></CardContent>
    {companyDraft ? <StrategyCompanyHandoffDrawer draft={companyDraft} content={content} members={sources.members} year={content.year} lockedPeriods={lockedPeriods} disabled={disabled} error={error} onChange={setCompanyDraft} onClose={() => { setCompanyDraft(null); setError(""); }} onSave={() => saveRows(companyDraft.choices.filter(x => companyDraft.selected.includes(x.key)))}/> : null}
    {draft ? <StrategyHandoffDrawer draft={draft} content={content} members={sources.members} regionId={regionId} canEdit={canEdit} disabled={disabled} lockedPeriods={lockedPeriods} error={error}
      onChange={setDraft} onSave={() => saveRows((content.strategyAcceptances ?? []).map(x => x.key === draft.key ? draft : x))} onClose={() => { setDraft(null); setError(""); }}/> : null}
  </Card>;
}
