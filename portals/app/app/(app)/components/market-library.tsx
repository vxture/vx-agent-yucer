"use client";

import { Section } from "./help-section";
import Link from "next/link";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { Button, DetailList, DetailRow, Drawer, EmptyState, Icon, Input, NativeSelect, TableTitleCell, useListPagination, useToast } from "@vxture/design-ui";
import { DataTable, FilterBar } from "./business-controls";
import { CollectionHistory, CollectionToolbar, collectionDrawerWidth } from "./collection-layout";
import { CollectionTable, CollectionTitleCell } from "./collection-table";
import { useCollectionView } from "./collection-view-provider";
import { FilterSlot, PaginationFooter, RowActions, SearchSlot, moveItems, useTableSort } from "./table-fittings";
import { strategyOfferings } from "../lib/strategy-offerings";
import { LibraryCardFact, MarketOfferingCard } from "./market-offering-card";
import { Tag } from "./tag";
import { useMessages } from "../lib/i18n/provider";
import type { MarketView } from "../lib/market-strategy";
import { changeSegmentStatus, deleteSegment, moveSegmentRow } from "../strategy/actions";

export function MarketCriteria({ market, columns = 1 }: { readonly market: MarketView; readonly columns?: 1 | 2 }) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  if (![...market.criteria.industries, ...market.criteria.regions, ...(market.criteria.sizes ?? [])].length) return <p className="text-body-small text-muted-foreground">{T.undefined}</p>;
  return <DetailList columns={columns}>
    <DetailRow label={T.industry}>{market.criteria.industries.join(" / ") || T.unlimited}</DetailRow>
    <DetailRow label={T.size}>{market.criteria.sizes?.join(" / ") || T.unlimited}</DetailRow>
    <DetailRow label={T.region}>{market.criteria.regions.join(" / ") || T.unlimited}</DetailRow>
  </DetailList>;
}

function StrategyReferences({ market, compact = false }: { readonly market: MarketView; readonly compact?: boolean }) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  if (market.plans === null) return T.unknown;
  if (!market.plans.length) return T.none;
  if (compact && market.plans.length > 1) return <span title={market.plans.map(p => p.name).join(" / ")}>{T.adoptedBy(market.plans.length)}</span>;
  return <div className="flex min-w-0 max-w-full flex-col gap-xs">{market.plans.map(p => (
    <Link key={p.id} className="truncate transition-colors hover:text-primary" href={`/strategy/${p.id}`} title={`${p.name} · ${p.period}`}>{p.name}</Link>
  ))}</div>;
}

export function MarketDetails({ market, canWrite, onClose }: { readonly market: MarketView; readonly canWrite: boolean; readonly onClose: () => void }) {
  const { MARKET_STRATEGY_TEXT: T, DATA_TABLE_LABELS, STRATEGY_TEXT } = useMessages();
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState("");
  const rows = market.customers?.filter(a => (!match || a.match === match) && (!query.trim() || `${a.name} ${a.accountNo}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))) ?? [];
  const pagination = useListPagination(rows, 10);
  return <Drawer open onClose={onClose} width={collectionDrawerWidth.wide} title={market.name} description={market.segmentCode} closeLabel={T.closed}>
    <div className="flex min-w-0 flex-col gap-xl" data-market-details>
      <Section title={T.marketInsight} icon="lightbulb" help={T.marketInsightHint}>
        <DetailList columns={2}>
          {(["customerNeed", "buyingScenario", "expectedOutcome", "entryBarrier"] as const).map(key => <DetailRow key={key} label={T[key]}><span className="whitespace-pre-wrap break-words">{market.criteria[key] || T.notProvided}</span></DetailRow>)}
        </DetailList>
      </Section>
      <Section title={T.marketDefaultSolutions} icon="squares-four" help={T.marketDefaultSolutionsHint}>
        <div className="flex flex-wrap gap-sm text-body-small">
          {strategyOfferings(market.defaultSolutions, market.defaultProducts).map(row =>
            <Link key={row.key} href={row.href} className="inline-flex items-center gap-xs transition-colors hover:text-primary" title={row.kind === "product" ? T.productKind : T.solutionKind}>
              <Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/>{row.name}
            </Link>)}
          {market.defaultSolutions == null ? <span>{T.solutionOptionsUnavailable}</span> : null}
          {market.defaultProducts == null ? <span>{T.productOptionsUnavailable}</span> : null}
          {market.defaultSolutions?.length === 0 && market.defaultProducts?.length === 0 ? T.noPlanSolutions : null}
        </div>
      </Section>
      <Section title={T.criteria} icon="filter"><MarketCriteria market={market} /></Section>
      <DetailList columns={2}>
        <DetailRow label={T.linkedPlan}><StrategyReferences market={market}/></DetailRow>
        <DetailRow label={T.status}>{STRATEGY_TEXT.segmentStatusLabel[market.status]}</DetailRow>
      </DetailList>
      <Section title={T.preview} icon="users" help={<><p>{T.previewWhy}</p><p>{T.baseOnly}</p></>}>
        <FilterBar search={<SearchSlot><Input aria-label={T.searchCustomers} placeholder={T.searchCustomers} value={query} onChange={e => setQuery(e.target.value)} /></SearchSlot>}>
          <FilterSlot><NativeSelect aria-label={T.assessment} value={match} onChange={e => setMatch(e.target.value)}>
            <option value="">{T.allCustomers}</option><option value="match">{T.match}</option><option value="missing">{T.missing}</option><option value="miss">{T.miss}</option>
          </NativeSelect></FilterSlot>
        </FilterBar>
        {market.customers === null ? <p className="text-body-small text-muted-foreground">{T.unknown}</p> : <DataTable
          labels={DATA_TABLE_LABELS} rows={pagination.pageRows} rowKey={a => a.id} indexStart={pagination.indexStart}
          columns={[
            {id:"name",header:T.customerName,align:"left",cell:a => <TableTitleCell title={<Link href={`/account/${a.id}`} className="transition-colors hover:text-primary">{a.name}</Link>} description={a.accountNo} />},
            {id:"match",header:T.assessment,align:"left",cell:a => <div className="flex flex-col gap-xs"><Tag tone={a.match === "match" ? "success" : a.match === "missing" ? "warning" : "neutral"}>{T[a.match]}</Tag><span className="text-body-small text-muted-foreground">{[a.industry,a.customerSize,a.region].filter(Boolean).join(" / ")}</span>{a.assigned ? <span className="text-body-small text-muted-foreground">{T.assigned}</span> : null}</div>},
          ]} rowActions={a => <RowActions items={[{id:"open",label:T.readOnly,onSelect:() => { window.location.href = `/account/${a.id}`; }}]} />}
          empty={<EmptyState title={query || match ? T.noMatches : T.noCustomers} description={T.noCustomersWhy} />}
        />}
        {market.customers !== null && rows.length ? <PaginationFooter pagination={pagination} total={market.customers.length} filteredTotal={query || match ? rows.length : undefined}/> : null}
      </Section>
      {canWrite ? <Button asChild size="xl" variant="secondary"><Link href={`/segment/new?id=${encodeURIComponent(market.id)}`}>{T.editMarket}</Link></Button> : null}
    </div>
  </Drawer>;
}

export function MarketLibrary({ markets, canWrite, initialMarket, actions }: { readonly markets: readonly MarketView[]; readonly canWrite: boolean; readonly initialMarket?: string; readonly actions?: ReactNode }) {
  const { MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT, DATA_TABLE_LABELS, SEGMENT_ERROR, ROW_OPS } = useMessages();
  const [query, setQuery] = useState("");
  const [view, setView] = useCollectionView("cards");
  const [status,setStatus] = useState("");
  const [selected,setSelected] = useState<readonly string[]>([]);
  const [comparing,setComparing] = useState(false);
  // Old bookmarks can use a number. Resolve at entry and keep only a UUID
  // in the panel state, even if a legacy number happens to look like an ID.
  const initialId = initialMarket
    ? (markets.find(m => m.id === initialMarket) ?? markets.find(m => m.segmentCode === initialMarket))?.id ?? null
    : null;
  const [detail,setDetail] = useState<string | null>(initialId);
  useEffect(()=>setDetail(initialId),[initialId]);
  const [compare,setCompare] = useState(false);
  const [pending,start] = useTransition();
  const {toast} = useToast();
  const sorted = useTableSort<MarketView>([],{name:m=>m.name,customers:m=>m.matched});
  const run = (action: () => Promise<{ok:boolean;error?:string}>) => start(async () => {
    try {const r=await action();if(!r.ok)toast({tone:"danger",title:SEGMENT_ERROR[r.error ?? "denied"] ?? SEGMENT_ERROR.denied});}
    catch {toast({tone:"danger",title:SEGMENT_ERROR.denied});}
  });
  const filtered = markets.filter(m => (!status || m.status === status) && (!query.trim() || `${m.name} ${m.segmentCode} ${m.plans?.map(p => p.name).join(" ") ?? ""} ${m.criteria.customerNeed ?? ""} ${m.criteria.buyingScenario ?? ""} ${m.criteria.expectedOutcome ?? ""} ${m.criteria.entryBarrier ?? ""} ${[...m.criteria.industries,...m.criteria.regions,...(m.criteria.sizes ?? [])].join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const live = filtered.filter(m=>m.status === "active"), shelved = filtered.filter(m=>m.status !== "active");
  const mode = comparing ? "list" : view;
  const chosen = markets.filter(m => selected.includes(m.id));
  const rowActions = (m: MarketView) => <RowActions disabled={pending} items={[
      {id:"view",label:T.openMarket,onSelect:()=>setDetail(m.id)},
      ...(canWrite ? [
        {id:"edit",label:T.editMarket,onSelect:()=>{window.location.href=`/segment/new?id=${encodeURIComponent(m.id)}`;}},
        ...(m.status === "active" ? [
          {id:"pause",label:STRATEGY_TEXT.segmentPause,onSelect:()=>run(()=>changeSegmentStatus(m.id,"paused"))},
          {id:"retire",label:STRATEGY_TEXT.segmentRetire,onSelect:()=>run(()=>changeSegmentStatus(m.id,"retired"))},
        ]:[{id:"resume",label:STRATEGY_TEXT.segmentResume,onSelect:()=>run(()=>changeSegmentStatus(m.id,"active"))}]),
        ...moveItems(ROW_OPS, markets.filter(s=>(s.status==="active")===(m.status==="active")).findIndex(s=>s.id===m.id),markets.filter(s=>(s.status==="active")===(m.status==="active")).length,d=>run(()=>moveSegmentRow(m.id,d))),
        {id:"delete",label:T.deleteMarket,danger:true as const,confirm:{verb:ROW_OPS.remove(STRATEGY_TEXT.segmentNoun),target:m.name,consequence:STRATEGY_TEXT.segmentDeleteConsequence,onConfirm:()=>run(()=>deleteSegment(m.id))}},
      ] : []),
    ]} />;
  const empty = <EmptyState title={markets.length ? T.noMatches : T.noMarkets} description={T.noMarketsWhy} />;
  const table = (rows: readonly MarketView[]) => <CollectionTable labels={DATA_TABLE_LABELS} indexStart={1} rowKey={m=>m.id}
    rows={[...sorted.sortRows(rows)]} selectedKeys={comparing ? selected : undefined} onSelectionChange={comparing ? setSelected : undefined} sort={sorted.sort} onSortChange={sorted.onSortChange}
    columns={[
      {id:"name",header:T.marketName,track:"subject",sortable:true,cell:m=><CollectionTitleCell title={m.name} description={m.segmentCode}
        tooltip={[m.name,m.segmentCode,m.criteria.customerNeed].filter(Boolean).join(" / ")} onTitleClick={()=>setDetail(m.id)}/>},
      {id:"criteria",header:T.criteria,align:"left",track:"criteria",cell:m=><span className="line-clamp-2" title={`${T.industry}: ${m.criteria.industries.join(" / ") || T.unlimited}; ${T.size}: ${m.criteria.sizes?.join(" / ") || T.unlimited}; ${T.region}: ${m.criteria.regions.join(" / ") || T.unlimited}`}>{[...m.criteria.industries,...(m.criteria.sizes ?? []),...m.criteria.regions].join(" / ") || T.undefined}</span>},
      {id:"buying",header:T.buyingEntry,align:"left",cell:m=><div className="flex min-w-0 flex-col gap-xs">
        <span className="line-clamp-2" title={m.criteria.buyingScenario}>{m.criteria.buyingScenario || T.notProvided}</span>
        {m.criteria.expectedOutcome ? <span className="line-clamp-1 text-body-small text-muted-foreground" title={`${T.expectedOutcome}: ${m.criteria.expectedOutcome}`}>{T.expectedOutcome} {m.criteria.expectedOutcome}</span> : null}
      </div>},
      {id:"customers",header:T.customers,sortable:true,track:"count",cell:m=><div className="flex flex-wrap items-baseline justify-center gap-x-sm gap-y-xs tabular-nums"><span className="font-medium">{m.matched ?? T.unknown}</span>{m.missing!==null && m.missing>0?<span className="whitespace-nowrap text-body-small text-muted-foreground">{T.missing} {m.missing}</span>:null}</div>},
      {id:"plan",header:T.linkedPlan,align:"left",track:"reference",cell:m=><div className="text-muted-foreground"><StrategyReferences market={m} compact/></div>},
      {id:"status",header:T.status,track:"state",cell:m=><Tag tone={m.status==="active"?"success":"neutral"}>{STRATEGY_TEXT.segmentStatusLabel[m.status]}</Tag>},
    ]}
    rowActions={rowActions}
    empty={<EmptyState title={markets.length ? T.noMatches:T.noMarkets} description={T.noMarketsWhy} />}
  />;
  const render = (rows: readonly MarketView[]) => mode === "list" ? table(rows) : rows.length ? (
    <div className="flex flex-col gap-lg">{sorted.sortRows(rows).map(m => {
      const offerings = strategyOfferings(m.defaultSolutions, m.defaultProducts);
      const criteria = [...m.criteria.industries, ...(m.criteria.sizes ?? []), ...m.criteria.regions].join(" / ");
      return <MarketOfferingCard key={m.id} kind="market" name={m.name} number={m.segmentCode}
        status={<Tag tone={m.status === "active" ? "success" : "neutral"}>{STRATEGY_TEXT.segmentStatusLabel[m.status]}</Tag>}
        actions={rowActions(m)} openLabel={T.openMarket} onOpen={() => setDetail(m.id)}
        summary={<>
          <p className="text-body-small text-muted-foreground">{T.customerNeed}</p>
          <p className="line-clamp-2 text-body" title={m.criteria.customerNeed || m.criteria.buyingScenario}>{m.criteria.customerNeed || m.criteria.buyingScenario || T.notProvided}</p>
          {criteria && <p className="line-clamp-1 text-body-small text-muted-foreground" title={criteria}>{criteria}</p>}
        </>}
        context={<>
          <p className="text-body-small text-muted-foreground">{T.marketDefaultSolutions}</p>
          <div className="flex flex-wrap items-center gap-x-md gap-y-xs text-body-small">
            {offerings.slice(0, 3).map(row => <Link key={row.key} href={row.href} className="inline-flex min-w-0 items-center gap-xs transition-colors hover:text-primary" title={row.name}>
              <Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{row.name}</span>
            </Link>)}
            {offerings.length > 3 && <Button size="sm" variant="ghost" onClick={() => setDetail(m.id)}>+{offerings.length - 3}</Button>}
            {!offerings.length && <span>{m.defaultSolutions == null || m.defaultProducts == null ? T.unknown : T.noPlanSolutions}</span>}
          </div>
        </>}
        facts={<>
          <LibraryCardFact icon="users" label={T.customers}>{m.matched ?? T.unknown}</LibraryCardFact>
          <LibraryCardFact icon="flag" label={T.linkedPlan}>{m.plans?.length ?? T.unknown}</LibraryCardFact>
        </>}
      />;
    })}</div>
  ) : empty;
  const comparisonRows: { id: string; label: string; render: (market: MarketView) => ReactNode }[] = [
    ...(["industries", "sizes", "regions"] as const).map((key, i) => ({ id: key, label: [T.industry, T.size, T.region][i]!, render: (m: MarketView) => {
      const defined = [...m.criteria.industries, ...m.criteria.regions, ...(m.criteria.sizes ?? [])].length > 0;
      return (m.criteria[key] ?? []).join(" / ") || (defined ? T.unlimited : T.undefined);
    } })),
    { id: "matched", label: T.customerCount, render: m => m.matched ?? T.unknown },
    { id: "missing", label: T.missing, render: m => m.missing ?? T.unknown },
    ...(["customerNeed", "buyingScenario", "expectedOutcome", "entryBarrier"] as const).map(key => ({ id: key, label: T[key], render: (m: MarketView) => m.criteria[key] || T.notProvided })),
    { id: "plans", label: T.linkedPlan, render: m => <StrategyReferences market={m}/> },
    { id: "status", label: T.status, render: m => STRATEGY_TEXT.segmentStatusLabel[m.status] },
    { id: "preview", label: T.preview, render: m => <Button variant="secondary" size="md" onClick={()=>{setCompare(false);setDetail(m.id);}}>{T.preview}</Button> },
  ];
  const viewed = markets.find(m=>m.id===detail);
  return <div className="flex min-w-0 flex-col gap-xl" data-market-library>
    <CollectionToolbar title={T.marketRoster} icon="list-checks" count={filtered.length}
      mode={comparing ? undefined : { value: view, onChange: setView }}
      notice={comparing ? <span role="status" className="text-body-small text-muted-foreground">{T.compareLimit}</span> : undefined}
      search={<SearchSlot><Input type="search" aria-label={T.searchMarkets} placeholder={T.searchMarkets} value={query} onChange={e=>{setQuery(e.target.value);setSelected([]);}} /></SearchSlot>}
      onReset={query || status ? ()=>{setQuery("");setStatus("");setSelected([]);}:undefined}
      actions={<div className="flex min-w-0 flex-wrap items-center justify-end gap-sm" data-market-compare-actions>{comparing ? <>
        <Button variant="outline" size="xl" className="px-md" disabled={chosen.length<2 || chosen.length>3} title={T.compareLimit} onClick={()=>setCompare(true)}>{T.compareSelected(chosen.length)}</Button>
        <Button variant="ghost" size="xl" className="px-md" onClick={()=>{setComparing(false);setSelected([]);setCompare(false);}}>{T.cancelCompare}</Button>
      </> : <Button variant="outline" size="xl" className="px-md" disabled={filtered.length<2} onClick={()=>setComparing(true)}>{T.compare}</Button>}{actions}</div>}>
      <FilterSlot><NativeSelect aria-label={T.status} value={status} onChange={e=>{setStatus(e.target.value);setSelected([]);}}><option value="">{T.allStates}</option>{Object.entries(STRATEGY_TEXT.segmentStatusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</NativeSelect></FilterSlot>
    </CollectionToolbar>
    {live.length || !shelved.length ? render(live) : null}
    <CollectionHistory title={T.shelvedMarkets} count={shelved.length} mode={mode}
      revealMatches={!live.length && Boolean(query.trim() || status)}>{table(shelved)}</CollectionHistory>
    {viewed ? <MarketDetails key={viewed.id} market={viewed} canWrite={canWrite} onClose={()=>setDetail(null)} />:null}
    <Drawer open={compare} onClose={()=>setCompare(false)} title={T.compare} description={T.compareWhy} width={collectionDrawerWidth.wide} closeLabel={T.closed}>
      <div className="min-w-0" data-market-comparison>
        <DataTable labels={DATA_TABLE_LABELS} rows={comparisonRows} rowKey={r=>r.id}
          className="[&_table]:min-w-(--container-xl)" columns={[
            { id: "dimension", header: T.compareDimension, align: "left", width: "xs", cell: row => row.label },
            ...chosen.map(m => ({ id: m.id, header: <span title={m.name}>{m.name}</span>, align: "left" as const, width: "sm" as const,
              cell: (row: typeof comparisonRows[number]) => <div className="min-w-0 max-w-48 break-words">{row.render(m)}</div> })),
          ]}/>
      </div>
    </Drawer>
  </div>;
}
