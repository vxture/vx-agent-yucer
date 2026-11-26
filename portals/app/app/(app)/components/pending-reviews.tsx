"use client";
import Link from "next/link";
import deploymentStyles from "./deployment-card.module.css";
import { useEffect, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, Drawer, EmptyState, Icon, Input, NativeSelect, useListPagination } from "@vxture/design-ui";
import type { WinLossFilter, WinLossRow, summarizeWinLoss } from "../../domains/pipeline/lib/winloss-workspace";
import { winLossHref } from "../lib/winloss-workspace";
import { useMessages, useLocale } from "../lib/i18n/provider";
import { formatMoney } from "../lib/view-model";
import { MemberName, useMemberName } from "../lib/member-names";
import { CollectionToolbar, collectionDrawerWidth } from "./collection-layout";
import { useCollectionView } from "./collection-view-provider";
import { CollectionTable, CollectionTitleCell } from "./collection-table";
import { PaginationFooter, RowActions, SearchSlot, useTableSort } from "./table-fittings";
import { DeploymentCard, DeploymentField } from "./deployment-card";
import { PageActionButton } from "./page-header-actions";
import businessLinks from "./business-reference.module.css";
import { Tag } from "./tag";
import { PeriodTabs } from "./period-tabs";
import { offeredPeriods } from "../lib/periods";
import { loadWinLossDetail } from "../winloss/detail-action";
import { recordReview } from "../pipeline/winloss-action";
import { draftReviewNarrative } from "../pipeline/review-narrative-action";
import { ReviewForm } from "./review-form";
import { ReviewDraftSections } from "./review-draft";
import { TitleHelp } from "./title-help";
import tableStyles from "./collection-table.module.css";

const LINK = businessLinks.textLink;
type Summary = ReturnType<typeof summarizeWinLoss>;
export function WinLossViews({ filter }: { readonly filter: WinLossFilter }) {
  const { WINLOSS_WORKSPACE_TEXT: T, DS_LABELS } = useMessages(), router = useRouter();
  return <RowActions label={DS_LABELS.actionMenu} items={(["list", "analysis"] as const).filter(view => view !== filter.view).map(view => ({
    id: view, label: T[view], icon: view === "list" ? "list-checks" as const : "chart-bar" as const,
    onSelect: () => router.push(winLossHref(filter, { view }), { scroll: false }),
  }))}/>;
}
function Outcome({ value }: { readonly value: WinLossRow["outcome"] }) {
  const { WINLOSS_WORKSPACE_TEXT: T } = useMessages();
  const tones = { won: "success", lost: "danger", abandoned: undefined } as const;
  return <Tag tone={tones[value]}>{T[value]}</Tag>;
}
function ReviewState({ row }: { readonly row: WinLossRow }) {
  const { WINLOSS_WORKSPACE_TEXT: T } = useMessages();
  if (row.stale) return <Tag tone="warning">{T.stale}</Tag>;
  if (!row.reviewId) return <Tag tone="warning">{T.pending}</Tag>;
  return <Tag>{row.reasonId ? T.reviewed : T.unclassified}</Tag>;
}

export function PendingReviews({ rows, summary, overview, filter, datedCount, undatedCount, reasons, regions, years, canPlan, canRecord }: {
  readonly rows: readonly WinLossRow[]; readonly summary: Summary; readonly overview: Summary; readonly filter: WinLossFilter;
  readonly datedCount: number; readonly undatedCount: number; readonly years: readonly number[];
  readonly reasons: readonly { readonly id: string; readonly name: string }[];
  readonly regions: readonly { readonly id: string; readonly name: string }[]; readonly canPlan: boolean; readonly canRecord: boolean;
}) {
  const messages = useMessages();
  const { WINLOSS_WORKSPACE_TEXT: T, WINLOSS_TEXT: W, DATA_TABLE_LABELS } = messages;
  const locale = useLocale(), nameOf = useMemberName(), router = useRouter();
  const [view, setView] = useCollectionView("list");
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(filter.query);
  const [target, setTarget] = useState<WinLossRow | null>(null);
  const [dirty, setDirty] = useState(false);
  const table = useTableSort(rows, { name: r => r.name, outcome: r => T[r.outcome], amount: r => r.amount, closed: r => r.closedAt, reason: r => r.reasonName, owner: r => nameOf(r.ownerSub), state: r => r.reviewId ? 1 : 0 });
  const paging = useListPagination(table.rows, 20);
  const navigate = (changes: Partial<WinLossFilter>) => start(() => router.push(winLossHref(filter, changes), { scroll: false }));
  const year = Number(filter.period.replace(/^Y/, "").slice(0, 4));
  const periods = offeredPeriods(new Date(Date.UTC(year, 0, 1)));
  const headings = { list: { title: T.list, icon: "list-checks" }, analysis: { title: T.analysis, icon: "chart-bar" } } as const;
  const heading = headings[filter.view];
  const menu = (row: WinLossRow) => <RowActions items={[{ id: "view", label: !row.reviewId && canRecord ? T.record : T.detail, icon: !row.reviewId && canRecord ? "edit" : "eye", onSelect: () => setTarget(row) }, { id: "deal", label: T.evidence, icon: "external-link", onSelect: () => router.push(`/pipeline/${encodeURIComponent(row.id)}#deal-review`) }]}/>;
  return <>
      <div className="flex min-w-0 flex-wrap items-center gap-sm" data-deployment-context="winloss">
        <div className="w-24"><NativeSelect aria-label={W.columnClosed} value={year} disabled={pending} onChange={e => navigate({ period: `Y${e.target.value}` })}>{years.map(y => <option value={y} key={y}>Y{y}</option>)}</NativeSelect></div>
        <PeriodTabs value={filter.period} periods={periods.quarters} yearLabel={periods.year} compact yearText={T.period}/>
        <NativeSelect wrapperClassName="w-auto" aria-label={T.region} value={filter.region} disabled={pending} onChange={e => navigate({ region: e.target.value })}>
          <option value="">{T.region}</option>{regions.map(r => <option value={r.id} key={r.id}>{r.name}</option>)}
        </NativeSelect>
        <span className="inline-flex flex-wrap items-center gap-sm text-body-small"><span className="text-muted-foreground">{T.winRate}</span><span className="tabular-nums">{overview.winRate === null ? "-" : `${(overview.winRate * 100).toFixed(1)}%`}</span><TitleHelp topic={T.winRate}>{T.help}</TitleHelp></span>
      </div>
    <CollectionToolbar title={heading.title} icon={heading.icon} help={T.help} count={rows.length}
      mode={filter.view === "list" ? { value:view, onChange:setView } : undefined}
      notice={<ReviewNotices overview={overview} filter={filter}/>}
      search={<SearchSlot><form onSubmit={e => { e.preventDefault(); navigate({query}); }}><Input type="search" aria-label={T.search} placeholder={T.search} value={query} onChange={e=>setQuery(e.target.value)} disabled={pending}/></form></SearchSlot>}
      onReset={() => navigate({ status:"all",outcome:"all",reason:"",region:"",query:"",dates:"period" })}>
      <NativeSelect wrapperClassName="w-auto" aria-label={T.status} value={filter.status} onChange={e=>navigate({status:e.target.value as WinLossFilter["status"]})} disabled={pending}>
        <option value="all">{T.all}</option><option value="pending">{T.pending}</option><option value="reviewed">{T.reviewed}</option>
      </NativeSelect>
      <NativeSelect wrapperClassName="w-auto" aria-label={T.outcomes} value={filter.outcome} onChange={e=>navigate({outcome:e.target.value as WinLossFilter["outcome"]})} disabled={pending}>
        <option value="all">{T.outcomes}</option>{(["won","lost","abandoned"] as const).map(o=><option key={o} value={o}>{T[o]}</option>)}
      </NativeSelect>
      <NativeSelect wrapperClassName="w-auto" aria-label={T.reason} value={filter.reason} onChange={e=>navigate({reason:e.target.value})} disabled={pending}>
        <option value="">{T.reason}</option><option value="unclassified">{T.unclassified}</option><option value="stale">{T.stale}</option>{reasons.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}
      </NativeSelect>
      <NativeSelect wrapperClassName="w-auto" aria-label={T.closed} value={filter.dates} onChange={e=>navigate({dates:e.target.value as WinLossFilter["dates"]})} disabled={pending}>
        <option value="period">{T.period} {datedCount}</option><option value="undated">{T.undated} {undatedCount}</option>
      </NativeSelect>
    </CollectionToolbar>
    <div className="flex flex-wrap items-center gap-sm">{(["won", "lost", "abandoned"] as const).map(outcome => <Link key={outcome} className={LINK} href={winLossHref(filter, { outcome, view: "list", status: "all", reason: "", query: "" })}><Tag>{T[outcome]} {overview[outcome]}</Tag></Link>)}</div>
    {filter.dates === "undated" ? <p className="text-body text-warning-text">{T.dateHelp}</p> : null}
    {filter.view === "analysis" ? <WinLossAnalysis summary={summary} filter={filter}/> : null}
    {filter.view === "list" && view === "cards" ? <div className="@container"><div className="grid grid-cols-1 gap-md @4xl:grid-cols-2">
      {paging.pageRows.map(row => <WinLossCard key={row.id} row={row} onOpen={setTarget} actions={menu(row)} canRecord={canRecord}/>)}
    </div></div> : null}
    {filter.view === "list" && view === "list" ? <CollectionTable className={tableStyles.winLoss} rows={[...paging.pageRows]} rowKey={r=>r.id} labels={DATA_TABLE_LABELS} leadingSpacer indexStart={paging.indexStart}
      sort={table.sort} onSortChange={s=>{table.onSortChange(s);paging.resetPage();}} rowActions={menu} columns={reviewColumns(messages, locale)} empty={<EmptyState title={T.noSample} description={T.noSampleHint}/>}/> : null}
    {filter.view === "list" && rows.length ? <PaginationFooter pagination={paging} total={rows.length}/> : null}
    {!rows.length && !(filter.view === "list" && view === "list") ? <EmptyState title={T.noSample} description={T.noSampleHint}/> : null}
    <Drawer open={!!target} onClose={()=>{if(!dirty || window.confirm(T.leave))setTarget(null);}} width={collectionDrawerWidth.standard} title={reviewActionTitle(target, canRecord, T)} description={target?.name}>
      {target ? <ReviewPreview key={target.id} row={target} canPlan={canPlan} filter={filter} onDirtyChange={setDirty} onSaved={()=>{setTarget(null);router.refresh();}}/> : null}
    </Drawer>
  </>;
}

function reviewActionTitle(row: WinLossRow | null, canRecord: boolean, text: ReturnType<typeof useMessages>["WINLOSS_WORKSPACE_TEXT"]) {
  if (row && !row.reviewId && canRecord) return text.record;
  return text.detail;
}

function ReviewNotices({ overview, filter }: Readonly<{ overview: Summary; filter: WinLossFilter }>) {
  const { WINLOSS_WORKSPACE_TEXT: text } = useMessages();
  if (!overview.unclassified && !overview.stale) return null;
  return <div className="flex flex-wrap gap-sm text-body-small text-warning-text">
    {overview.unclassified ? <Link className={LINK} href={winLossHref(filter, { status: "all", outcome: "all", query: "", reason: "unclassified", view: "list" })}>{text.unclassified} {overview.unclassified}</Link> : null}
    {overview.stale ? <Link className={LINK} href={winLossHref(filter, { status: "all", outcome: "all", query: "", reason: "stale", view: "list" })}>{text.stale} {overview.stale}</Link> : null}
  </div>;
}

function WinLossAnalysis({ summary, filter }: { readonly summary: Summary; readonly filter: WinLossFilter }) {
  const messages = useMessages();
  const { WINLOSS_WORKSPACE_TEXT:T, DATA_TABLE_LABELS } = messages;
  const locale=useLocale();
  if (!summary.total) return null;
  return <div className="flex flex-col gap-lg">
    <Card><CardContent className="flex flex-col gap-md text-body"><h3 className="flex items-center gap-sm font-medium"><Icon name="coins" size="sm"/>{T.money}<TitleHelp topic={T.money}>{T.moneyHelp}</TitleHelp></h3>
      {summary.money.map(m=><div key={m.currency} className="flex flex-wrap items-baseline gap-md"><span>{m.currency}</span><strong className="tabular-nums">{m.known ? formatMoney(Number(m.amount)/100,m.currency,locale):"-"}</strong><span className="text-muted-foreground">{T.missing} {m.missing} {T.sampleUnit}</span></div>)}
    </CardContent></Card>
    <CollectionToolbar title={T.reasonCount} icon="chart-bar" count={summary.reasons.length} help={T.reasonHelp}/>
    <CollectionTable rows={summary.reasons} rowKey={r=>r.id} labels={DATA_TABLE_LABELS} columns={reasonColumns(filter, messages)} empty={<EmptyState title={T.noSample} description={T.reasonHelp}/>}/>
  </div>;
}

type ReviewDetail = NonNullable<Awaited<ReturnType<typeof loadWinLossDetail>>>;
type Messages = ReturnType<typeof useMessages>;

function reviewColumns(messages: Messages, locale: string): ComponentProps<typeof CollectionTable<WinLossRow>>["columns"] {
  const { WINLOSS_WORKSPACE_TEXT: T, WINLOSS_TEXT: W } = messages;
  return [
    {id:"name",header:W.columnOpportunity,track:"subject",sortable:true,cell:r=><CollectionTitleCell title={<Link className={LINK} href={`/pipeline/${encodeURIComponent(r.id)}`}>{r.name}</Link>} description={r.accountName ?? r.number}/>},
    {id:"outcome",header:W.columnOutcome,track:"state",sortable:true,cell:r=><Outcome value={r.outcome}/>},
    {id:"amount",header:W.columnAmount,track:"amount",align:"right",sortable:true,cell:r=><span className="whitespace-nowrap tabular-nums">{formatMoney(r.amount,r.currency,locale)}</span>},
    {id:"closed",header:T.closed,track:"reference",sortable:true,cell:r=>r.closedAt?.slice(0,10) ?? T.undated},
    {id:"reason",header:W.reasonLabel,track:"criteria",sortable:true,cell:r=><span className="line-clamp-2">{r.reasonName ?? (r.reasonId ? T.unknownReason : "-")}</span>},
    {id:"owner",header:T.owner,track:"reference",sortable:true,cell:r=><MemberName sub={r.ownerSub}/>},
    {id:"state",header:T.status,track:"state",sortable:true,cell:r=><ReviewState row={r}/>}
  ];
}

function reasonColumns(filter: WinLossFilter, messages: Messages): ComponentProps<typeof CollectionTable<Summary["reasons"][number]>>["columns"] {
  const { WINLOSS_WORKSPACE_TEXT: T } = messages;
  return [
    {id:"reason",header:T.reason,track:"subject",cell:r=><Link className={LINK} href={winLossHref(filter,{view:"list",reason:r.id})}>{r.name ?? T.unknownReason}</Link>},
    {id:"count",header:T.sample,track:"count",align:"right",cell:r=><Link className={LINK} href={winLossHref(filter,{view:"list",reason:r.id})}>{r.count} {T.sampleUnit}</Link>},
    ...(["won","lost","abandoned"] as const).map(outcome=>({id:outcome,header:T[outcome],track:"count" as const,align:"right" as const,cell:(row:Summary["reasons"][number])=>row[outcome]}))
  ];
}

function WinLossCard({ row, onOpen, actions, canRecord }: Readonly<{ row: WinLossRow; onOpen: (row: WinLossRow) => void; actions: ReactNode; canRecord: boolean }>) {
  const { WINLOSS_WORKSPACE_TEXT: T, WINLOSS_TEXT: W } = useMessages(), locale = useLocale();
  return <DeploymentCard icon="flag" title={row.name} href={`/pipeline/${encodeURIComponent(row.id)}`} actions={actions}
    tags={<><Outcome value={row.outcome}/><ReviewState row={row}/></>}
    meta={<><span>{row.number}</span><time>{row.closedAt?.slice(0,10) ?? T.undated}</time></>}
    footer={<div className="flex justify-end"><PageActionButton onClick={() => onOpen(row)}>{!row.reviewId && canRecord ? T.record : T.detail}</PageActionButton></div>}>
      <dl className={deploymentStyles.fields}>
        <DeploymentField label={T.account}><Link className={LINK} href={`/account/${encodeURIComponent(row.accountId)}`}>{row.accountName ?? T.account}</Link></DeploymentField>
        <DeploymentField label={T.owner}><MemberName sub={row.ownerSub}/></DeploymentField>
        <DeploymentField label={W.columnAmount}><span className="font-medium tabular-nums">{formatMoney(row.amount,row.currency,locale)}</span></DeploymentField>
        <DeploymentField label={W.reasonLabel}><span className="line-clamp-2">{row.reasonName ?? (row.reviewId ? T.unclassified : T.pending)}</span></DeploymentField>
      </dl>
      {row.lessons ? <p className="line-clamp-2 text-muted-foreground" title={row.lessons}>{row.lessons}</p> : null}
  </DeploymentCard>;
}

function useReviewDetail(id: string) {
  const [data, setData] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false);
    loadWinLossDetail(id).then(detail => {
      if (active) { setData(detail); setFailed(!detail); }
    }, () => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt]);
  return { data, loading, failed, retry: () => setAttempt(n => n + 1) };
}

function relatedLinks(row: WinLossRow, filter: WinLossFilter, canPlan: boolean, text: Messages["WINLOSS_WORKSPACE_TEXT"]) {
  const links = [{ label: text.account, href: `/account/${encodeURIComponent(row.accountId)}` }];
  if (row.planId) links.push({ label: text.strategy, href: `/strategy/${encodeURIComponent(row.planId)}` });
  if (row.campaignId) links.push({ label: text.campaign, href: `/campaign?campaign=${encodeURIComponent(row.campaignId)}` });
  if (canPlan) {
    const query = new URLSearchParams({ year: filter.period.replace(/^Y/, "").slice(0, 4), period: filter.period });
    if (row.regionId) query.set("region", row.regionId);
    links.push({ label: text.planning, href: `/planning?${query}` });
  }
  return links;
}

type PreviewProps = Readonly<{ row: WinLossRow; filter: WinLossFilter; canPlan: boolean; onSaved: () => void; onDirtyChange: (dirty: boolean) => void }>;
function ReviewPreview({ row, filter, canPlan, onSaved, onDirtyChange }: PreviewProps) {
  const { WINLOSS_WORKSPACE_TEXT: T } = useMessages();
  const { data, loading, failed, retry } = useReviewDetail(row.id);
  if (loading) return <p className="text-body text-muted-foreground">{T.loading}</p>;
  if (failed || !data) return <div className="flex flex-col gap-md"><p role="alert">{T.failed}</p><Button size="xl" onClick={retry}>{T.retry}</Button></div>;
  const links = relatedLinks(row, filter, canPlan, T);
  return <div className="@container flex flex-col gap-lg pb-[var(--vx-content-bottom-inset)] text-body" data-review-preview>
    <div className="flex flex-wrap items-center gap-sm"><Outcome value={data.status as WinLossRow["outcome"]}/><ReviewState row={row}/><span className="tabular-nums">{formatMoney(row.amount,row.currency)}</span></div>
    {row.stale ? <p className="text-warning-text">{T.staleHelp}</p> : null}
    <ReviewContents data={data} row={row} onSaved={onSaved} onDirtyChange={onDirtyChange}/>
    <div className="flex flex-wrap gap-sm border-t border-border pt-md"><Button asChild size="xl" variant="outline"><Link className={businessLinks.link} href={`/pipeline/${encodeURIComponent(row.id)}#deal-review`}><Icon name="external-link" size="sm"/>{T.evidence}</Link></Button></div>
    <div className="flex flex-col gap-sm border-t border-border pt-md"><h3 className="flex items-center gap-sm font-medium"><Icon name="link" size="sm"/>{T.source}<TitleHelp topic={T.source}>{T.sourceHelp}</TitleHelp></h3><div className="flex flex-wrap gap-md">{links.map(link => <Link className={LINK} key={link.href} href={link.href}>{link.label}</Link>)}</div></div>
  </div>;
}

function ReviewContents({ data, row, onSaved, onDirtyChange }: Readonly<{ data: ReviewDetail; row: WinLossRow; onSaved: () => void; onDirtyChange: (dirty: boolean) => void }>) {
  const { WINLOSS_TEXT: W } = useMessages();
  const [editing, setEditing] = useState(false);
  if (!data.review || editing) {
    if (!data.canRecord) return <p>{W.recordHintDenied}</p>;
    return <ReviewForm opportunityId={row.id} status={data.status} review={data.review} reasons={data.reasons} knownRivals={data.knownRivals} draft={data.draft}
      onNarrate={data.canNarrate ? draftReviewNarrative : undefined} onRecord={recordReview} onSaved={onSaved} onDirtyChange={onDirtyChange} onCancel={data.review ? () => setEditing(false) : undefined}/>;
  }
  return <ReviewRecordView data={data} record={data.review} row={row} onEdit={() => setEditing(true)}/>;
}

function ReviewRecordView({ data, record, row, onEdit }: Readonly<{ data: ReviewDetail; record: NonNullable<ReviewDetail["review"]>; row: WinLossRow; onEdit: () => void }>) {
  const { WINLOSS_WORKSPACE_TEXT: T, WINLOSS_TEXT: W } = useMessages();
  const reason = data.reasons.find(item => item.id === record.primaryReasonId)?.name;
  const reasonText = reason ?? (record.primaryReasonId ? T.unknownReason : T.unclassified);
  return <>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-md gap-y-sm">
      <dt className="text-muted-foreground">{W.reasonLabel}:</dt><dd>{reasonText}</dd>
      <dt className="text-muted-foreground">{W.competitorLabel}:</dt><dd>{record.competitor ?? "-"}</dd>
      <dt className="text-muted-foreground">{T.reviewer}:</dt><dd>{record.reviewerSub ? <MemberName sub={record.reviewerSub}/> : "-"}</dd>
      <dt className="text-muted-foreground">{T.closed}:</dt><dd>{row.closedAt?.slice(0,10) ?? T.undated}</dd>
    </dl>
    <p className="whitespace-pre-wrap break-words">{record.lessons ?? "-"}</p>
    {data.canRecord ? <Button size="xl" variant="outline" onClick={onEdit}>{T.edit}</Button> : null}
    {data.draft ? <ReviewDraftSections draft={data.draft} opportunityId={row.id} reasonName={new Map(data.reasons.map(reason => [reason.id, reason.name]))} onNarrate={data.canNarrate ? draftReviewNarrative : undefined}/> : <p className="text-muted-foreground">{T.noDraft}</p>}
  </>;
}
