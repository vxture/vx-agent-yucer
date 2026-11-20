"use client";
import { useState, type ReactNode } from "react";
import { Button, EmptyState, Icon, Input, MetricListCard, NativeSelect, StatusBadge } from "@vxture/design-ui";
import { Tag } from "../components/tag";
import { Section } from "../components/help-section";
import { CollectionToolbar } from "../components/collection-layout";
import { CollectionTable, CollectionTitleCell } from "../components/collection-table";
import { useCollectionView } from "../components/collection-view-provider";
import { FilterSlot, RowActions, SearchSlot, useTableSort } from "../components/table-fittings";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { planningRegionRows } from "../lib/planning-workspace";
import type { PlanContent } from "../../domains/planning/plan-model";
import { PlanTargetLedger } from "./plan-targets";

export function PlanRegions({ content, onSelect, editing = false, disabled = false, lockedPeriods = [], onAttainment, basis }: {
  content: PlanContent; onSelect: (id: string) => void; editing?: boolean; disabled?: boolean;
  basis?: ReactNode; lockedPeriods?: readonly string[]; onAttainment?: (id: string) => void;
}) {
  const { PLAN_VERSION_TEXT: T, PLAN_WORKSPACE_TEXT: W, DATA_TABLE_LABELS, DS_LABELS } = useMessages();
  const locale = useLocale();
  const [view, setView] = useCollectionView("cards");
  const [search, setSearch] = useState("");
  const [participation, setParticipation] = useState("all");
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const rows = planningRegionRows(content).filter(r =>
    (participation === "all" || r.included === (participation === "included")) &&
    `${r.name} ${r.code} ${r.provinces.join(" ")}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
  type Region = (typeof rows)[number];
  const table = useTableSort(rows, {
    name: r => r.name, target: r => r.annual?.target == null ? null : Number(r.annual.target),
    support: r => r.supported == null ? null : Number(r.supported), gap: r => r.gap == null ? null : Number(r.gap),
    customers: r => r.customers, people: r => r.people, actions: r => r.actions,
    status: r => r.included ? 1 : 0,
  });
  const format = (v: string | null | undefined) => v == null ? "\u2014" : Number(v).toLocaleString(locale, { maximumFractionDigits: 2 });
  const money = (r: Region, value: string | null | undefined) => <span className="whitespace-nowrap tabular-nums">{format(value)}<span className="ml-xs text-body-small font-normal text-muted-foreground">{r.annual?.currency}</span></span>;
  const status = (r: Region) => r.included ? <StatusBadge tone="info">{T.included}</StatusBadge> : <Tag>{T.excluded}</Tag>;
  const title = (r: Region) => <button data-control-kind="structural" type="button" disabled={disabled} className="text-left font-semibold transition-colors hover:text-primary-text" onClick={() => onSelect(r.id)}>{r.name}</button>;
  const toggle = (id: string) => setExpanded(keys => keys.includes(id) ? keys.filter(k => k !== id) : [...keys, id]);
  const actions = (r: Region) => <RowActions label={`${DS_LABELS.actionMenu} \u00b7 ${r.name}`} disabled={disabled} items={[
    { id: "open", label: editing ? T.editRegion : T.regionDetail, icon: "arrow-right", onSelect: () => onSelect(r.id) },
    ...(onAttainment ? [{ id: "actual", label: T.actual, icon: "chart-line" as const, onSelect: () => onAttainment(r.id) }] : []),
  ]}/>;
  return <Section><div className="flex flex-col gap-md">
    <CollectionToolbar title={T.regions} icon="map-pin" help={W.regionsHelp} mode={{ value: view, onChange: setView }} count={rows.length} notice={basis}
      search={<SearchSlot><Input aria-label={W.searchRegions} placeholder={W.searchRegions} value={search} onChange={e => setSearch(e.target.value)}/></SearchSlot>}
      actions={<RowActions label={`${T.regions} \u00b7 ${DS_LABELS.actionMenu}`} items={[{ id: "configure", label: T.configure, icon: "settings", onSelect: () => window.open("/admin/division", "_blank", "noopener,noreferrer") }]}/> }>
      <FilterSlot><NativeSelect aria-label={T.participation} value={participation} onChange={e => setParticipation(e.target.value)}>
        <option value="all">{W.allRegions}</option><option value="included">{T.included}</option><option value="excluded">{T.excluded}</option>
      </NativeSelect></FilterSlot>
    </CollectionToolbar>
    {view === "list" ? <CollectionTable rows={table.rows} rowKey={r => r.id} indexStart={1} labels={DATA_TABLE_LABELS} sort={table.sort} onSortChange={table.onSortChange} empty={<EmptyState title={T.noRegions}/>} columns={[
      { id: "name", header: T.regions, track: "subject", sortable: true, cell: r => <CollectionTitleCell title={title(r)} description={<MemberName sub={r.ownerSub} fallback={W.ownerPending}/>}/> },
      { id: "target", header: T.target, track: "amount", align: "numeric", sortable: true, cell: r => r.included ? money(r, r.annual?.target) : "\u2014" },
      { id: "support", header: W.customerSupport, track: "amount", align: "numeric", sortable: true, cell: r => r.included ? money(r, r.supported) : "\u2014" },
      { id: "gap", header: W.supportGap, track: "amount", align: "numeric", sortable: true, cell: r => r.included ? money(r, r.gap) : "\u2014" },
      { id: "deployment", header: W.deployment, track: "composition", cell: r => <div className="flex flex-col gap-xs text-body"><span>{r.customers} {W.customerUnit}</span><span className="text-body-small text-muted-foreground">{r.people} {T.personUnit}{" \u00b7 "}{r.actions} {W.actionUnit}</span></div> },
      { id: "status", header: T.participation, track: "state", sortable: true, cell: status },
    ]} rowActions={actions}/> : rows.length ? <div className="grid grid-cols-1 gap-md @3xl:grid-cols-2 @7xl:grid-cols-3">
      {rows.map(r => <MetricListCard key={r.id} title={<span className="flex min-w-0 items-center gap-sm text-body"><Icon name="map-pin" size="sm" className="shrink-0 text-muted-foreground"/>{title(r)}</span>} actions={<span className="flex items-center gap-sm">{status(r)}{actions(r)}</span>}
        note={!r.included ? r.reason || T.excluded : undefined} footer={<div className="flex w-full min-w-0 flex-col gap-md text-body">
          <div className="flex items-center gap-sm"><Icon name="user" size="sm" className="text-muted-foreground"/><span className="text-muted-foreground">{T.owner}:</span><MemberName sub={r.ownerSub} fallback={W.ownerPending}/></div>
          {r.included ? <>
            <dl className="grid grid-cols-3 gap-sm border-t border-border pt-md">{[[T.target, r.annual?.target], [W.customerSupport, r.supported], [W.supportGap, r.gap]].map(([label, value]) => <div key={label} className="flex min-w-0 flex-col gap-xs"><dt className="text-body-small text-muted-foreground">{label}</dt><dd className="text-body font-semibold">{money(r, value)}</dd></div>)}</dl>
            <div className="flex flex-wrap items-center gap-md border-t border-border pt-md text-muted-foreground"><span>{W.deployedCustomers} {r.customers} {W.customerUnit}</span><span>{T.people} {r.people} {T.personUnit}</span><span>{T.actions} {r.actions} {W.actionUnit}</span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => toggle(r.id)} aria-expanded={expanded.includes(r.id)}>{expanded.includes(r.id) ? T.collapsePeriods : T.periodTargets}</Button>
            </div>
            {expanded.includes(r.id) ? <PlanTargetLedger content={content} scope={`territory:${r.id}`} edit={null} disabled={disabled} lockedPeriods={lockedPeriods} open onOpenChange={() => toggle(r.id)}/> : null}
          </> : null}
        </div>}/>)}
    </div> : <EmptyState title={T.noRegions}/>}
  </div></Section>;
}
