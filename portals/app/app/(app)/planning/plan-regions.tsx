"use client";
import { useState, type ReactNode } from "react";
import { Button, EmptyState, Icon, Input, MetricListCard, NativeSelect, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@vxture/design-ui";
import { Tag } from "../components/tag";
import { Section } from "../components/help-section";
import { TitleHelp } from "../components/title-help";
import { CollectionToolbar } from "../components/collection-layout";
import { CollectionTable, CollectionTitleCell } from "../components/collection-table";
import { useCollectionView } from "../components/collection-view-provider";
import { FilterSlot, RowActions, SearchSlot, useTableSort } from "../components/table-fittings";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { companyAllocation, planningRegionRows } from "../lib/planning-workspace";
import { planningMetricOrder } from "../lib/planning-metrics";
import { planningPipelineCoverage, planningTierPercent } from "../lib/planning-preview";
import type { PlanContent, PlanTarget } from "../../domains/planning/plan-model";
import { CompanyTargetAllocation } from "./company-target-summary";
import { PlanningTargetValue, PlanTargetLedger } from "./plan-targets";

const tiers = ["floor", "target", "stretch"] as const;
export function PlanRegions({ content, onSelect, edit = null, editing = false, disabled = false, lockedPeriods = [], onAttainment, basis }: Readonly<{
  content: PlanContent; onSelect: (id: string) => void; editing?: boolean; disabled?: boolean;
  edit?: ((content: PlanContent) => void) | null;
  basis?: ReactNode; lockedPeriods?: readonly string[]; onAttainment?: (id: string) => void;
}>) {
  const { PLAN_VERSION_TEXT: T, PLAN_WORKSPACE_TEXT: W, REGIONAL_PLANNING_TEXT: R, PLANNING_TEXT: P, COMPANY_PLANNING_TEXT: C, DATA_TABLE_LABELS, DS_LABELS } = useMessages();
  const locale = useLocale();
  const [view, setView] = useCollectionView("cards");
  const [search, setSearch] = useState("");
  const [participation, setParticipation] = useState("all");
  const [metric, setMetric] = useState<PlanTarget["metric"]>("revenue");
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const canEdit = edit && content.releaseScope !== "company" ? edit : null;
  const metrics = planningMetricOrder.filter(m => content.targets.some(t => t.scope === "workspace" && t.period === `Y${content.year}` && t.metric === m));
  const selectedMetric = metrics.includes(metric) ? metric : "revenue";
  const company = content.targets.find(t => t.scope === "workspace" && t.period === `Y${content.year}` && t.metric === selectedMetric);
  const labels = { revenue: P.metricRevenue, new_logo: P.metricNewLogo, pipeline: P.metricPipeline, margin: C.marginRate };
  const targetOf = (id: string) => content.targets.find(t => t.scope === `territory:${id}` && t.period === `Y${content.year}` && t.metric === selectedMetric && t.currency === company?.currency);
  const rows = planningRegionRows(content).filter(r =>
    (participation === "all" || r.included === (participation === "included")) &&
    `${r.name} ${r.code} ${r.provinces.join(" ")}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
  type Region = (typeof rows)[number];
  const table = useTableSort(rows, {
    name: r => r.name, target: r => targetOf(r.id)?.target == null ? null : Number(targetOf(r.id)!.target),
    floor: r => targetOf(r.id)?.floor == null ? null : Number(targetOf(r.id)!.floor),
    stretch: r => targetOf(r.id)?.stretch == null ? null : Number(targetOf(r.id)!.stretch),
    support: r => r.supported == null ? null : Number(r.supported), gap: r => r.gap == null ? null : Number(r.gap),
    customers: r => r.customers, people: r => r.people, actions: r => r.actions,
    status: r => r.included ? 1 : 0,
  });
  const format = (v: string | null | undefined) => v == null ? "\u2014" : Number(v).toLocaleString(locale, { maximumFractionDigits: 2 });
  const money = (r: Region, value: string | null | undefined) => <span className="whitespace-nowrap tabular-nums">{format(value)}<span className="ml-xs text-body-small font-normal text-muted-foreground">{r.annual?.currency}</span></span>;
  const status = (r: Region) => {
    const pending = canEdit ? targetOf(r.id)?.target == null : r.annual?.target == null;
    return r.included ? <StatusBadge tone={pending ? "warning" : "info"}>{pending ? R.pending : T.included}</StatusBadge> : <Tag>{T.excluded}</Tag>;
  };
  const share = (r: Region) => planningTierPercent(targetOf(r.id)?.target, company?.target, locale) ?? "\u2014";
  const value = (r: Region, tier: typeof tiers[number]) => {
    const line = targetOf(r.id);
    if (!r.included) return <span className="text-muted-foreground">{"\u2014"}</span>;
    if (!line) return <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onSelect(r.id)}>{R.configureTarget}</Button>;
    const revenue = content.targets.find(t => t.scope === line.scope && t.period === line.period && t.metric === "revenue" && t.currency === line.currency);
    const ratio = line.metric === "pipeline" ? planningPipelineCoverage(line[tier], revenue?.target, locale) : planningTierPercent(line[tier], line.target, locale);
    return <PlanningTargetValue content={content} line={line} tier={tier} ratio={ratio} edit={canEdit} disabled={disabled} lockedPeriods={lockedPeriods} labelPrefix={r.name}/>;
  };
  const title = (r: Region) => <button data-control-kind="structural" type="button" disabled={disabled} className="text-left font-semibold transition-colors hover:text-primary-text" onClick={() => onSelect(r.id)}>{r.name}</button>;
  const toggle = (id: string) => setExpanded(keys => keys.includes(id) ? keys.filter(k => k !== id) : [...keys, id]);
  const actions = (r: Region) => <RowActions label={`${DS_LABELS.actionMenu} \u00b7 ${r.name}`} disabled={disabled} items={[
    { id: "open", label: editing ? T.editRegion : T.regionDetail, icon: "arrow-right", onSelect: () => onSelect(r.id) },
    ...(onAttainment ? [{ id: "actual", label: T.actual, icon: "chart-line" as const, onSelect: () => onAttainment(r.id) }] : []),
  ]}/>;
  const cards = rows.length ? <div className={`grid grid-cols-1 gap-md ${canEdit && selectedMetric === "margin" ? "" : "@3xl:grid-cols-2"} ${canEdit ? "" : "@7xl:grid-cols-3"}`}>
      {rows.map(r => <MetricListCard key={r.id} title={<span className="flex min-w-0 items-center gap-sm text-body"><Icon name="map-pin" size="sm" className="shrink-0 text-muted-foreground"/>{title(r)}</span>} actions={<span className="flex items-center gap-sm">{status(r)}{actions(r)}</span>}
        note={!r.included ? r.reason || T.excluded : undefined} footer={<div className="@container flex w-full min-w-0 flex-col gap-md text-body" data-region-allocation={r.id}>
          <div className="flex flex-wrap items-center justify-between gap-sm"><span className="inline-flex items-center gap-sm"><Icon name="user" size="sm" className="text-muted-foreground"/><span className="text-muted-foreground">{T.owner}:</span><MemberName sub={r.ownerSub} fallback={W.ownerPending}/></span>{r.included && canEdit ? <span className="text-body-small text-muted-foreground">{R.share} {share(r)}</span> : null}</div>
          {r.included ? <>
            {canEdit ? <div className="grid grid-cols-1 gap-sm border-t border-border pt-md @xs:grid-cols-3">{tiers.map(tier => <div key={tier} className="flex min-w-0 flex-col gap-sm"><span className="text-body-small text-muted-foreground">{T[tier]}{selectedMetric === "margin" ? " %" : ""}</span>{value(r, tier)}</div>)}</div> : <dl className="grid grid-cols-3 gap-sm border-t border-border pt-md">{[[T.target, r.annual?.target], [W.customerSupport, r.supported], [W.supportGap, r.gap]].map(([label, value]) => <div key={label} className="flex min-w-0 flex-col gap-xs"><dt className="text-body-small text-muted-foreground">{label}</dt><dd className="text-body font-semibold">{money(r, value)}</dd></div>)}</dl>}
            <div className="flex flex-wrap items-center gap-md border-t border-border pt-md text-muted-foreground"><span>{W.deployedCustomers} {r.customers} {W.customerUnit}</span><span>{T.people} {r.people} {T.personUnit}</span><span>{T.actions} {r.actions} {W.actionUnit}</span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => toggle(r.id)} aria-expanded={expanded.includes(r.id)}>{expanded.includes(r.id) ? T.collapsePeriods : T.periodTargets}</Button>
            </div>
            {expanded.includes(r.id) ? <PlanTargetLedger content={content} scope={`territory:${r.id}`} edit={canEdit} disabled={disabled} lockedPeriods={lockedPeriods} periodsOnly open onOpenChange={() => toggle(r.id)}/> : null}
          </> : null}
        </div>}/>)}
    </div> : <EmptyState title={T.noRegions}/>;
  return <Section><div className="flex flex-col gap-md" data-region-workspace>
    <CollectionToolbar title={T.regions} icon="map-pin" help={canEdit ? R.allocationHelp : W.regionsHelp} mode={{ value: view, onChange: setView }} count={rows.length} notice={basis}
      search={<SearchSlot><Input aria-label={W.searchRegions} placeholder={W.searchRegions} value={search} onChange={e => setSearch(e.target.value)}/></SearchSlot>}
      actions={<RowActions label={`${T.regions} \u00b7 ${DS_LABELS.actionMenu}`} items={[{ id: "configure", label: T.configure, icon: "settings", onSelect: () => window.open("/admin/division", "_blank", "noopener,noreferrer") }]}/> }>
      {canEdit ? <FilterSlot><NativeSelect aria-label={R.metric} value={selectedMetric} disabled={disabled} onChange={e => setMetric(e.target.value as PlanTarget["metric"])}>{metrics.map(m => <option key={m} value={m}>{labels[m]}</option>)}</NativeSelect></FilterSlot> : null}
      <FilterSlot><NativeSelect aria-label={T.participation} value={participation} onChange={e => setParticipation(e.target.value)}>
        <option value="all">{W.allRegions}</option><option value="included">{T.included}</option><option value="excluded">{T.excluded}</option>
      </NativeSelect></FilterSlot>
    </CollectionToolbar>
    {canEdit ? <div className="flex flex-wrap items-center justify-between gap-md" data-region-allocation-summary>
      <div className="flex min-w-0 flex-wrap items-center gap-md"><TitleHelp topic={T.regions}><div className="flex flex-col gap-lg"><p>{R.balanceHelp}</p><Table><TableHeader><TableRow><TableHead>{T.metric}</TableHead><TableHead>{R.companyTarget}</TableHead><TableHead>{T.allocated}</TableHead><TableHead>{T.allocation}</TableHead></TableRow></TableHeader><TableBody>{tiers.map(tier => { const state = companyAllocation(content, company, tier); return <TableRow key={tier}><TableCell>{T[tier]}</TableCell><TableCell>{format(company?.[tier])}</TableCell><TableCell>{format(state.allocated)}</TableCell><TableCell className={Number(state.balance) < 0 ? "text-destructive" : undefined}>{format(state.balance)}</TableCell></TableRow>; })}</TableBody></Table><span className="text-body-small text-muted-foreground">{company?.currency ?? C.customerUnit}</span></div></TitleHelp><CompanyTargetAllocation content={content} target={company} currency={company?.currency ?? ""} showTarget/></div>
    </div> : null}
    {view === "list" ? <CollectionTable rows={table.rows} rowKey={r => r.id} indexStart={1} labels={DATA_TABLE_LABELS} sort={table.sort} onSortChange={table.onSortChange} empty={<EmptyState title={T.noRegions}/>} columns={[
      { id: "name", header: T.regions, track: "subject", sortable: true, cell: r => renderRegionName(r, onSelect, disabled, W.ownerPending) },
      ...(canEdit ? tiers.map(tier => ({ id: tier, header: T[tier], track: "amount" as const, align: "numeric" as const, sortable: true, cell: (r: Region) => value(r, tier) })) : [
        { id: "target", header: T.target, track: "amount" as const, align: "numeric" as const, sortable: true, cell: (r: Region) => r.included ? money(r, r.annual?.target) : "\u2014" },
        { id: "support", header: W.customerSupport, track: "amount" as const, align: "numeric" as const, sortable: true, cell: (r: Region) => r.included ? money(r, r.supported) : "\u2014" },
        { id: "gap", header: W.supportGap, track: "amount" as const, align: "numeric" as const, sortable: true, cell: (r: Region) => r.included ? money(r, r.gap) : "\u2014" },
      ]),
      ...(canEdit ? [{ id: "share", header: R.share, track: "state" as const, align: "numeric" as const, cell: (r: Region) => r.included ? share(r) : "\u2014" }] : [{ id: "deployment", header: W.deployment, track: "composition" as const, cell: (r: Region) => renderDeployment(r, W.customerUnit, T.personUnit, W.actionUnit) }]),
      { id: "status", header: T.participation, track: "state", sortable: true, cell: status },
    ]} rowActions={actions}/> : cards}
    {canEdit ? <p className="text-body-small text-muted-foreground">{R.allocationSave}</p> : null}
  </div></Section>;
}

type RegionRow = ReturnType<typeof planningRegionRows>[number];
function renderRegionName(row: RegionRow, onSelect: (id: string) => void, disabled: boolean, fallback: string) {
  return <CollectionTitleCell title={<button data-control-kind="structural" type="button" disabled={disabled} className="text-left font-semibold transition-colors hover:text-primary-text" onClick={() => onSelect(row.id)}>{row.name}</button>} description={<MemberName sub={row.ownerSub} fallback={fallback}/>}/>;
}
function renderDeployment(row: RegionRow, customerUnit: string, personUnit: string, actionUnit: string) {
  return <div className="flex flex-col gap-xs text-body"><span>{row.customers} {customerUnit}</span><span className="text-body-small text-muted-foreground">{row.people} {personUnit}{" \u00b7 "}{row.actions} {actionUnit}</span></div>;
}
