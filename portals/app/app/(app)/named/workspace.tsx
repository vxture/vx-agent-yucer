"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, Field, FieldLabel, Icon, Input, MetricListCard, NativeSelect, StatusBadge } from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
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
import { FocusEditor } from "./editor";
import { startFocusDraft } from "./focus-actions";

export function FocusWorkspaceView({ workspace: w }: { readonly workspace: FocusWorkspace }) {
  const { FOCUS_TEXT: T, PLAN_VERSION_ERROR: E, POSITION_TEXT: P, DATA_TABLE_LABELS, DS_LABELS } = useMessages();
  const locale = useLocale(), router = useRouter();
  const [view, setView] = useCollectionView("cards"), [query, setQuery] = useState(""), [status, setStatus] = useState("all"), [editing, setEditing] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const rows = w.rows.filter(r => `${r.name} ${r.accountNo}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)) && (status === "all" || (r.actions.length > 0) === (status === "action")));
  const table = useTableSort(rows, { name: r => r.name, region: r => r.regions.map(r => r.name).join(" "), revenue: r => r.revenue.length === 1 ? Number(r.revenue[0].amount) : null, next: r => [...r.actions].sort((a,b) => a.due.localeCompare(b.due))[0]?.due ?? null, status: r => r.actions.length });
  const link = (r: FocusRow) => focusHref({ ...w, revisionId: w.revision?.id, accountId: r.id });
  const tier = (r: FocusRow) => r.tier === "strategic" ? P.tierStrategic : r.tier === "key" ? P.tierKey : P.tierStandard;
  const revenue = (r: FocusRow) => r.revenue.length ? <span className="inline-flex flex-wrap gap-sm">{r.revenue.map(m => <span key={m.currency} className="whitespace-nowrap tabular-nums">{Number(m.amount).toLocaleString(locale)} <span className="text-body-small text-muted-foreground">{m.currency}</span></span>)}</span> : <span className="text-muted-foreground">{T.unknown}</span>;
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
    <ModuleHeadline moduleKey="namedAccount" brief="named" help={T.help} tags={w.revision ? <StatusBadge tone={w.revision.draft ? "warning" : "info"}>{w.revision.draft ? T.draft : `V${w.revision.version}`}</StatusBadge> : undefined} pageActions={{
      context: <form action="/named" className="flex items-center gap-xs"><Input aria-label={T.year} name="year" type="number" min={2000} max={2200} defaultValue={w.year} className="w-control-numeric"/><PageActionButton type="submit">{T.applyYear}</PageActionButton></form>,
      secondary: <PageActionButton asChild><Link href={planningHref({ year: w.year, revision: w.revision?.id })}>{T.planning}</Link></PageActionButton>,
      primary: w.canEdit ? w.revision?.draft ? <PageActionButton intent="primary" onClick={() => setEditing(true)}><Icon name="plus" size="sm"/>{T.add}</PageActionButton> : <PageActionButton intent="primary" disabled={busy} onClick={startDraft}>{T.startDraft}</PageActionButton> : w.draftId ? <PageActionButton intent="primary" asChild><Link href={w.companyDraft ? planningHref({ year: w.year, revision: w.draftId }) : focusHref({ ...w, revisionId: w.draftId })}>{T.continueDraft}</Link></PageActionButton> : undefined,
      more: <RowActions label={DS_LABELS.actionMenu} items={[{ id: "customers", label: T.master, icon: "building", onSelect: () => router.push("/account") }, { id: "create", label: T.create, icon: "plus", onSelect: () => window.open("/account/new", "_blank", "noopener,noreferrer") }]}/>,
    }}/>
    {error ? <p role="alert" className="text-body text-destructive">{error}</p> : null}
    {w.revision ? <Section><div className="@container"><div className="grid grid-cols-1 gap-md @xl:grid-cols-3">
      <Field><FieldLabel>{T.version}</FieldLabel><NativeSelect aria-label={T.version} value={w.revision.id} onChange={e => router.push(focusHref({ ...w, revisionId: e.target.value }))}>{w.versions.map(v => <option key={v.id} value={v.id}>{v.draft ? w.companyDraft && v.id === w.draftId ? T.companyDraft : T.draft : `V${v.version}`}</option>)}</NativeSelect></Field>
      <Field><FieldLabel>{T.period}</FieldLabel><NativeSelect aria-label={T.period} value={w.period} onChange={e => router.push(focusHref({ ...w, revisionId: w.revision!.id, period: e.target.value }))}>{w.periods.map(p => <option key={p.key} value={p.key}>{p.key}</option>)}</NativeSelect></Field>
      <Field><FieldLabel>{T.region}</FieldLabel><NativeSelect aria-label={T.region} value={w.regionId ?? ""} onChange={e => router.push(focusHref({ ...w, revisionId: w.revision!.id, regionId: e.target.value }))}><option value="">{T.allRegions}</option>{w.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</NativeSelect></Field>
      </div><div className="mt-md">{w.revision.draft ? <span className="text-body text-muted-foreground">{T.savedHelp}</span> : <span className="text-body text-muted-foreground">{T.readonly}{w.revision.regionalVersion ? ` / ${T.region} V${w.revision.regionalVersion}` : ""}</span>}
    </div></div></Section> : <EmptyState title={T.unpublished} description={T.emptyHint}/>}
    {w.revision ? <Section><CollectionToolbar title={T.overview} icon="star" help={T.periodHelp} mode={{ value: view, onChange: setView }} count={rows.length}
      search={<SearchSlot><Input aria-label={T.search} placeholder={T.search} value={query} onChange={e => setQuery(e.target.value)}/></SearchSlot>}>
      <FilterSlot><NativeSelect aria-label={T.status} value={status} onChange={e => setStatus(e.target.value)}><option value="all">{T.allStatus}</option><option value="action">{T.withAction}</option><option value="pending">{T.withoutAction}</option></NativeSelect></FilterSlot>
    </CollectionToolbar>
    {view === "list" ? <CollectionTable rows={table.rows} rowKey={r => r.id} indexStart={1} labels={DATA_TABLE_LABELS} sort={table.sort} onSortChange={table.onSortChange} empty={<EmptyState title={T.empty} description={T.emptyHint}/>} rowActions={actions} columns={[
      { id: "name", header: T.customer, track: "subject", sortable: true, cell: r => <CollectionTitleCell title={<Link href={link(r)} className="hover:text-primary-text">{r.name}</Link>} description={<>{r.accountNo} / {tier(r)}</>}/> },
      { id: "region", header: T.region, track: "category", sortable: true, cell: r => r.regions.map(r => r.name).join(" / ") || T.regionPending },
      { id: "revenue", header: T.revenue, track: "amount", align: "numeric", sortable: true, cell: revenue },
      { id: "next", header: T.next, track: "direction", sortable: true, cell: r => <NextAction row={r}/> },
      { id: "status", header: T.status, track: "state", sortable: true, cell: r => <Tag>{r.actions.length ? T.withAction : T.withoutAction}</Tag> },
    ]}/> : rows.length ? <div className="@container"><div className="grid grid-cols-1 gap-md @3xl:grid-cols-2 @7xl:grid-cols-3">{rows.map(r => <MetricListCard key={r.id}
      title={<Link href={link(r)} className="line-clamp-2 text-body font-semibold hover:text-primary-text">{r.name}</Link>} actions={actions(r)}
      note={<span className="flex flex-wrap items-center gap-sm"><span>{r.accountNo}</span><Tag>{tier(r)}</Tag></span>}
      footer={<div className="flex w-full min-w-0 flex-col gap-md text-body"><div className="flex items-start gap-sm"><Icon name="map-pin" size="sm" className="mt-2xs shrink-0 text-muted-foreground"/><span className="text-muted-foreground">{T.region}:</span><span className="line-clamp-2">{r.regions.map(r => r.name).join(" / ") || T.regionPending}</span></div><div className="flex items-center gap-sm"><Icon name="user" size="sm" className="text-muted-foreground"/><span className="text-muted-foreground">{T.accountOwner}:</span><MemberName sub={r.ownerSub}/></div><div className="flex items-center justify-between gap-sm border-t border-border pt-md"><span className="text-muted-foreground">{T.revenue}:</span>{revenue(r)}</div><div className="border-t border-border pt-md"><NextAction row={r}/></div></div>}/>)}</div></div> : <EmptyState title={T.empty} description={T.emptyHint}/>}
    </Section> : null}
    {editing ? <FocusEditor workspace={w} onClose={() => setEditing(false)}/> : null}
  </>;
}
function NextAction({ row }: { readonly row: FocusRow }) {
  const { FOCUS_TEXT: T } = useMessages();
  const next = [...row.actions].sort((a,b) => a.due.localeCompare(b.due))[0];
  return next ? <div className="flex min-w-0 flex-col gap-xs text-body"><span className="line-clamp-2">{next.objective}</span><span className="flex flex-wrap items-center gap-sm text-body text-muted-foreground"><MemberName sub={next.ownerSub}/><span>{next.due}</span></span></div> : <span className="text-body text-muted-foreground">{T.noAction}</span>;
}
