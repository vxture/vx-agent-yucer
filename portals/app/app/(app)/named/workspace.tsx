"use client";
import type { PlanningYearOption } from "../../domains/planning/plan-years";
import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import deploymentStyles from "../components/deployment-card.module.css";
import { useRouter } from "next/navigation";
import { EmptyState, Icon, Input, NativeSelect, StatusBadge } from "@vxture/design-ui";
import { DeploymentCard, DeploymentField } from "../components/deployment-card";
import { StrategyReferenceSummary as BusinessReferences } from "../components/strategy-reference-summary";
import links from "../components/business-reference.module.css";
import { ModuleHeadline } from "../components/module-headline";
import { FocusModuleSummary } from "../components/deployment-module-summary";
import { PageActionButton } from "../components/page-header-actions";
import { CollectionToolbar } from "../components/collection-layout";
import { CollectionTable, CollectionTitleCell } from "../components/collection-table";
import { useCollectionView } from "../components/collection-view-provider";
import { SearchSlot, FilterSlot, RowActions, useTableSort } from "../components/table-fittings";
import { Section } from "../components/help-section";
import { Tag } from "../components/tag";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { focusHref } from "../lib/focus-workspace";
import { planningHref } from "../lib/planning-workspace";
import type { FocusRow, FocusWorkspace } from "../../domains/planning/focus-model";
import { focusNeedsAttention } from "../../domains/planning/focus-attention";
import { RevenueValue, KeyCoverage, DecisionChains, CoverageAttention } from "./coverage";
import { ContactPreview } from "../components/contact-preview";
import { FocusEditor } from "./editor";
import { startFocusDraft } from "./focus-actions";

export function FocusWorkspaceView({ workspace: w, availableYears = [], canOpenPlanning = false, canCreateAccount = false }: { readonly workspace: FocusWorkspace; readonly availableYears?: PlanningYearOption[]; readonly canOpenPlanning?: boolean; readonly canCreateAccount?: boolean }) {
  const { FOCUS_TEXT: T, PLAN_VERSION_TEXT: V, PLAN_VERSION_ERROR: E, DS_LABELS } = useMessages();
  const locale = useLocale(), router = useRouter();
  const [view, setView] = useCollectionView("cards"), [query, setQuery] = useState(""), [status, setStatus] = useState("all"), [attention, setAttention] = useState("all"), [editing, setEditing] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const rows = w.rows.filter(r => `${r.name} ${r.accountNo}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)) && (status === "all" || (r.actions.length > 0) === (status === "action")) && (attention === "all" || (attention === "gaps" ? focusNeedsAttention(r) : r.coverage.state !== "ready")));
  const link = (r: FocusRow) => focusHref({ ...w, revisionId: w.revision?.id, accountId: r.id });
  const actions = (r: FocusRow) => <RowActions label={`${DS_LABELS.actionMenu} ${r.name}`} items={[{ id: "detail", icon: "arrow-right", label: T.detail, onSelect: () => router.push(link(r)) }, { id: "master", icon: "building", label: T.openAccount, onSelect: () => router.push(`/account/${encodeURIComponent(r.id)}`) }]}/>;
  async function startDraft() {
    if (starting.current || !w.revision) return;
    starting.current = true;
    setBusy(true); setError("");
    try {
      const result = await startFocusDraft({ year: w.year, expectedEventNo: w.eventNo, revisionId: w.revision.id, requestKey: crypto.randomUUID() });
      if (!result.ok) { setError(E[result.error] ?? T.error); return; }
      router.push(focusHref({ ...w, revisionId: result.revisionId })); router.refresh();
    } catch { setError(T.error); } finally { starting.current = false; setBusy(false); }
  }
  return <>
    <ModuleHeadline moduleKey="namedAccount" brief="named" help={T.help} description={<FocusModuleSummary workspace={w}/>} tags={w.revision ? <StatusBadge tone={w.revision.draft ? "warning" : "info"}>{w.revision.draft ? T.draft : `V${w.revision.version}`}</StatusBadge> : undefined} pageActions={{
      context: <NativeSelect aria-label={T.year} value={w.year} wrapperClassName="w-auto" onChange={e => router.push(focusHref({ year: Number(e.target.value) }))}>{[...new Set([w.year - 1, w.year, w.year + 1, ...availableYears.map(x => x.year)])].sort((a,b) => b-a).map(year => <option key={year} value={year}>Y{year}{availableYears.find(x => x.year === year)?.published ? ` \u00b7 ${V.published}` : availableYears.find(x => x.year === year)?.draft ? ` \u00b7 ${T.draft}` : ""}</option>)}</NativeSelect>,
      primary: <FocusPrimaryAction workspace={w} busy={busy} onAdd={() => setEditing(true)} onStart={startDraft}/>,
      more: <RowActions label={DS_LABELS.actionMenu} items={[
        ...(canOpenPlanning ? [{ id: "planning", label: T.planning, icon: "target" as const, onSelect: () => router.push(planningHref({ year: w.year, revision: w.revision?.id })) }] : []),
        { id: "customers", label: T.master, icon: "building", onSelect: () => router.push("/account") },
        ...(canCreateAccount ? [{ id: "create", label: T.create, icon: "plus" as const, onSelect: () => window.open("/account/new", "_blank", "noopener,noreferrer") }] : []),
      ]}/>,
    }}/>
    {error ? <p role="alert" className="text-body text-destructive">{error}</p> : null}
    {w.revision ? <FocusSelectors workspace={w}/> : <EmptyState title={T.unpublished} description={T.emptyHint}/>}
    {w.revision ? <Section><CollectionToolbar title={T.overview} icon="star" help={`${T.periodHelp} ${T.coverageHelp}`} mode={{ value: view, onChange: setView }} count={rows.length}
      search={<SearchSlot><Input aria-label={T.search} placeholder={T.search} value={query} onChange={e => setQuery(e.target.value)}/></SearchSlot>}>
      <FilterSlot><NativeSelect aria-label={T.status} value={status} onChange={e => setStatus(e.target.value)}><option value="all">{T.allStatus}</option><option value="action">{T.withAction}</option><option value="pending">{T.withoutAction}</option></NativeSelect></FilterSlot>
      <FilterSlot><NativeSelect aria-label={T.attentionFilter} value={attention} onChange={e => setAttention(e.target.value)}><option value="all">{T.allCoverage}</option><option value="gaps">{T.needsAttention}</option><option value="unknown">{T.coverageUnknown}</option></NativeSelect></FilterSlot>
    </CollectionToolbar>
    <FocusResults workspace={w} rows={rows} view={view} actions={actions} canOpenPlanning={canOpenPlanning}/>
    </Section> : null}
    {editing ? <FocusEditor workspace={w} canCreateAccount={canCreateAccount} onClose={() => setEditing(false)}/> : null}
  </>;
}
function NextAction({ row }: { readonly row: FocusRow }) {
  const { FOCUS_TEXT: T } = useMessages();
  const next = [...row.actions].sort((a,b) => a.due.localeCompare(b.due))[0];
  return next ? <div className="flex min-w-0 flex-col gap-xs text-body"><span className="line-clamp-2">{next.objective}</span><span className="flex flex-wrap items-center gap-sm text-body text-muted-foreground"><MemberName sub={next.ownerSub}/><span className="whitespace-nowrap">{next.due}</span></span></div> : <span className="text-body text-muted-foreground">{T.noAction}</span>;
}

type FocusText = ReturnType<typeof useMessages>["FOCUS_TEXT"];
function versionLabel(v: FocusWorkspace["versions"][number], w: FocusWorkspace, text: FocusText) {
  if (!v.draft) return `V${v.version}`;
  return w.companyDraft && v.id === w.draftId ? text.companyDraft : text.draft;
}
function tierLabel(tier: string, text: ReturnType<typeof useMessages>["POSITION_TEXT"]) {
  if (tier === "strategic") return text.tierStrategic;
  return tier === "key" ? text.tierKey : text.tierStandard;
}
function FocusSelectors({ workspace: w }: Readonly<{ workspace: FocusWorkspace }>) {
  const { FOCUS_TEXT: T } = useMessages(), router = useRouter();
  return <div className="flex min-w-0 flex-wrap items-center gap-sm" data-deployment-context="named">
      <NativeSelect wrapperClassName="w-auto max-w-full" aria-label={T.version} value={w.revision!.id} onChange={e => router.push(focusHref({ ...w, revisionId: e.target.value }))}>{w.versions.map(v => <option key={v.id} value={v.id}>{versionLabel(v, w, T)}</option>)}</NativeSelect>
      <NativeSelect wrapperClassName="w-auto max-w-full" aria-label={T.period} value={w.period} onChange={e => router.push(focusHref({ ...w, revisionId: w.revision!.id, period: e.target.value }))}>{w.periods.map(p => <option key={p.key} value={p.key}>{p.key}</option>)}</NativeSelect>
      <NativeSelect wrapperClassName="w-auto max-w-full" aria-label={T.region} value={w.regionId ?? ""} onChange={e => router.push(focusHref({ ...w, revisionId: w.revision!.id, regionId: e.target.value }))}><option value="">{T.allRegions}</option>{w.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</NativeSelect>
      <span className="text-body-small text-muted-foreground">{w.revision!.draft ? T.savedHelp : <>{T.readonly}{w.revision!.regionalVersion ? ` / ${T.region} V${w.revision!.regionalVersion}` : ""}</>}</span>
    </div>;
}
function FocusPrimaryAction({ workspace: w, busy, onAdd, onStart }: Readonly<{ workspace: FocusWorkspace; busy: boolean; onAdd: () => void; onStart: () => void }>) {
  const { FOCUS_TEXT: T } = useMessages();
  if (w.canEdit && w.revision?.draft) return <PageActionButton intent="primary" onClick={onAdd}><Icon name="plus" size="sm"/>{T.add}</PageActionButton>;
  if (w.canEdit) return <PageActionButton intent="primary" disabled={busy} onClick={onStart}>{T.startDraft}</PageActionButton>;
  if (!w.draftId || !w.canTeam || w.closed) return null;
  const href = w.companyDraft ? planningHref({ year: w.year, revision: w.draftId }) : focusHref({ ...w, revisionId: w.draftId });
  return <PageActionButton intent="primary" asChild><Link href={href}>{T.continueDraft}</Link></PageActionButton>;
}
function focusColumns(w: FocusWorkspace, text: ReturnType<typeof useMessages>): ComponentProps<typeof CollectionTable<FocusRow>>["columns"] {
  const { FOCUS_TEXT: T, POSITION_TEXT: P, ACCOUNT_TEXT: A } = text;
  return [
    { id: "name", header: T.customer, track: "subject", sortable: true, cell: r => <CollectionTitleCell title={<Link href={focusHref({ ...w, revisionId: w.revision?.id, accountId: r.id })} className={links.textLink}>{r.name}</Link>} description={<>{r.accountNo} / {tierLabel(r.tier, P)}</>}/> },
    { id: "region", header: T.region, track: "count", sortable: true, cell: r => r.regions.map(r => r.name).join(" / ") || T.regionPending },
    { id: "revenue", header: T.revenue, track: "amount", align: "numeric", sortable: true, cell: r => <RevenueValue row={r}/> },
    { id: "coverage", header: T.relationshipCoverage, track: "coverage", sortable: true, cell: r => <div className="flex flex-col gap-xs text-body"><div className="flex min-w-0 items-center gap-xs"><span className="shrink-0 text-muted-foreground">{A.contactsTitle}:</span><ContactPreview accountId={r.id} summary={r.contacts}/></div><div className="flex flex-wrap items-center gap-xs"><span className="text-muted-foreground">{T.keyCoverage}:</span><KeyCoverage coverage={r.coverage}/></div><div className="flex flex-wrap items-center gap-xs"><span className="text-muted-foreground">{T.decisionChains}:</span><DecisionChains coverage={r.coverage}/></div></div> },
    { id: "next", header: T.next, track: "direction", sortable: true, cell: r => <NextAction row={r}/> },
    { id: "status", header: T.status, track: "attention", sortable: true, cell: r => <div className="flex flex-col items-start gap-xs"><Tag>{r.actions.length ? T.withAction : T.withoutAction}</Tag><CoverageAttention row={r}/></div> },
  ];
}
function FocusResults({ workspace: w, rows, view, actions, canOpenPlanning }: Readonly<{ workspace: FocusWorkspace; rows: FocusRow[]; view: string; canOpenPlanning: boolean; actions: (row: FocusRow) => ReactNode }>) {
  const messages = useMessages(), { FOCUS_TEXT: T, POSITION_TEXT: P, ACCOUNT_TEXT: A, DATA_TABLE_LABELS } = messages;
  const table = useTableSort(rows, { name: r => r.name, region: r => r.regions.map(r => r.name).join(" "), revenue: r => r.revenue.length === 1 ? Number(r.revenue[0].amount) : null, coverage: r => coverageRatio(r), next: r => [...r.actions].sort((a,b) => a.due.localeCompare(b.due))[0]?.due ?? null, status: r => r.actions.length });

  const link = (r: FocusRow) => focusHref({ ...w, revisionId: w.revision?.id, accountId: r.id });
  if (view === "list") return <CollectionTable rows={table.rows} rowKey={r => r.id} indexStart={1} labels={DATA_TABLE_LABELS} sort={table.sort} onSortChange={table.onSortChange} empty={<EmptyState title={T.empty} description={T.emptyHint}/>} rowActions={actions} columns={focusColumns(w, messages)}/>;
  if (!rows.length) return <EmptyState title={T.empty} description={T.emptyHint}/>;
  return <div className="@container"><div className="grid grid-cols-1 gap-md @3xl:grid-cols-2 @7xl:grid-cols-3">{rows.map(r => <DeploymentCard key={r.id}
    icon="building" title={r.name} href={link(r)}
    tags={<Tag>{tierLabel(r.tier, P)}</Tag>} actions={actions(r)} meta={<><span>{r.accountNo}</span><span>{w.period}</span></>}
    footer={<dl><DeploymentField label={T.next}><NextAction row={r}/></DeploymentField></dl>}>
      <dl className={deploymentStyles.fields}>
        <DeploymentField label={T.region}>{r.regions.length ? <BusinessReferences kind="deployment-regions" label={T.region} href={link(r)} rows={r.regions.map(region => ({ id: region.id, name: region.name, icon: "map-pin", ...(canOpenPlanning ? { href: planningHref({ year: w.year, revision: w.revision?.id, region: region.id, period: w.period }) } : {}) }))}/> : T.regionPending}</DeploymentField>
        <DeploymentField label={T.accountOwner}><MemberName sub={r.ownerSub}/></DeploymentField>
        <DeploymentField label={T.revenue}><span className="font-medium text-primary-text"><RevenueValue row={r}/></span></DeploymentField>
        <DeploymentField label={A.contactsTitle}><ContactPreview accountId={r.id} summary={r.contacts}/></DeploymentField>
        <DeploymentField label={T.keyCoverage}><KeyCoverage coverage={r.coverage}/></DeploymentField>
        <DeploymentField label={T.decisionChains}><DecisionChains coverage={r.coverage}/></DeploymentField>
      </dl>
      <CoverageAttention row={r}/>
  </DeploymentCard>)}</div></div>;
}

function coverageRatio(row: FocusRow) {
  if (row.coverage.state !== "ready") return null;
  return row.coverage.requiredRoles ? row.coverage.coveredRoles / row.coverage.requiredRoles : 0;
}
