"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { Button, DetailList, DetailRow, Drawer, EmptyState, Input, NativeSelect, Section, TableTitleCell, useListPagination, useToast } from "@vxture/design-ui";
import { DataTable, FilterBar } from "./business-controls";
import { FilterSlot, PaginationFooter, RowActions, SearchSlot, moveItems, useTableSort } from "./table-fittings";
import { Tag } from "./tag";
import { useMessages } from "../lib/i18n/provider";
import type { MarketView } from "../lib/market-strategy";
import { changeSegmentStatus, deleteSegment, moveSegmentRow } from "../strategy/actions";

export function MarketCriteria({ market }: { readonly market: MarketView }) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  return <DetailList columns={1}>
    <DetailRow label={T.industry}>{market.criteria.industries.join(" / ") || T.unlimited}</DetailRow>
    <DetailRow label={T.size}>{market.criteria.sizes?.join(" / ") || T.unlimited}</DetailRow>
    <DetailRow label={T.region}>{market.criteria.regions.join(" / ") || T.unlimited}</DetailRow>
  </DetailList>;
}

export function MarketDetails({ market, canWrite, onClose }: { readonly market: MarketView; readonly canWrite: boolean; readonly onClose: () => void }) {
  const { MARKET_STRATEGY_TEXT: T, DATA_TABLE_LABELS, STRATEGY_TEXT } = useMessages();
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState("");
  const rows = market.customers?.filter(a => (!match || a.match === match) && (!query.trim() || `${a.name} ${a.accountNo}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))) ?? [];
  const pagination = useListPagination(rows, 10);
  return <Drawer open onClose={onClose} width="lg" title={market.name} description={market.segmentCode} closeLabel={T.closed}>
    <div className="flex min-w-0 flex-col gap-xl" data-market-details>
      <Section title={T.criteria} icon="filter"><MarketCriteria market={market} /></Section>
      <DetailList columns={2}>
        <DetailRow label={T.linkedPlan}>{market.planName ? <Link className="transition-colors hover:text-primary" href={`/strategy/${market.planId}`}>{market.planName}</Link> : market.planId ? T.unknown : T.none}</DetailRow>
        <DetailRow label={T.status}>{STRATEGY_TEXT.segmentStatusLabel[market.status]}</DetailRow>
      </DetailList>
      <Section title={T.preview} icon="users" description={T.previewWhy}>
        <FilterBar search={<SearchSlot><Input aria-label={T.search} placeholder={T.search} value={query} onChange={e => setQuery(e.target.value)} /></SearchSlot>}>
          <FilterSlot><NativeSelect aria-label={T.assessment} value={match} onChange={e => setMatch(e.target.value)}>
            <option value="">{T.allCustomers}</option><option value="match">{T.match}</option><option value="missing">{T.missing}</option><option value="miss">{T.miss}</option>
          </NativeSelect></FilterSlot>
        </FilterBar>
        {market.customers === null ? <p className="text-body-small text-muted-foreground">{T.unknown}</p> : <DataTable
          leadingSpacer labels={DATA_TABLE_LABELS} rows={pagination.pageRows} rowKey={a => a.id} indexStart={pagination.indexStart}
          columns={[
            {id:"name",header:T.customerName,cell:a => <TableTitleCell title={<Link href={`/account/${a.id}`} className="transition-colors hover:text-primary">{a.name}</Link>} description={a.accountNo} />},
            {id:"match",header:T.assessment,cell:a => <div className="flex flex-col gap-xs"><Tag tone={a.match === "match" ? "success" : a.match === "missing" ? "warning" : "neutral"}>{T[a.match]}</Tag><span className="text-body-small text-muted-foreground">{[a.industry,a.customerSize,a.region].filter(Boolean).join(" / ")}</span>{a.assigned ? <span className="text-body-small text-muted-foreground">{T.assigned}</span> : null}</div>},
          ]} rowActions={a => <RowActions items={[{id:"open",label:T.readOnly,onSelect:() => { window.location.href = `/account/${a.id}`; }}]} />}
          empty={<EmptyState title={query || match ? T.noMatches : T.noCustomers} description={T.noCustomersWhy} />}
        />}
        {market.customers !== null && rows.length ? <PaginationFooter pagination={pagination} total={market.customers.length} filteredTotal={query || match ? rows.length : undefined}/> : null}
        <p className="text-body-small text-muted-foreground">{T.baseOnly}</p>
      </Section>
      {canWrite && !["closed","archived"].includes(market.planStatus ?? "") ? <Button asChild size="xl" variant="secondary"><Link href={`/segment/new?code=${encodeURIComponent(market.segmentCode)}`}>{T.editMarket}</Link></Button> : null}
    </div>
  </Drawer>;
}

export function MarketLibrary({ markets, canWrite, initialMarket, planId, scope, actions }: { readonly markets: readonly MarketView[]; readonly canWrite: boolean; readonly initialMarket?: string; readonly planId?: string; readonly scope?: ReactNode; readonly actions?: ReactNode }) {
  const { MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT, DATA_TABLE_LABELS, SEGMENT_ERROR, ROW_OPS } = useMessages();
  const [query, setQuery] = useState("");
  const [status,setStatus] = useState("");
  const [selected,setSelected] = useState<readonly string[]>([]);
  const [detail,setDetail] = useState<string | null>(initialMarket ?? null);
  useEffect(()=>setDetail(initialMarket ?? null),[initialMarket]);
  const [compare,setCompare] = useState(false);
  const [pending,start] = useTransition();
  const {toast} = useToast();
  const sorted = useTableSort<MarketView>([],{name:m=>m.name,customers:m=>m.matched});
  const run = (action: () => Promise<{ok:boolean;error?:string}>) => start(async () => {
    try {const r=await action();if(!r.ok)toast({tone:"danger",title:SEGMENT_ERROR[r.error ?? "denied"] ?? SEGMENT_ERROR.denied});}
    catch {toast({tone:"danger",title:SEGMENT_ERROR.denied});}
  });
  const filtered = markets.filter(m => (!planId || m.planId === planId) && (!status || m.status === status) && (!query.trim() || `${m.name} ${m.segmentCode} ${m.planName ?? ""} ${[...m.criteria.industries,...m.criteria.regions,...(m.criteria.sizes ?? [])].join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const live = filtered.filter(m=>m.status === "active"), shelved = filtered.filter(m=>m.status !== "active");
  const chosen = markets.filter(m => selected.includes(m.id));
  const table = (rows: readonly MarketView[]) => <DataTable labels={DATA_TABLE_LABELS} indexStart={1} rowKey={m=>m.id}
    rows={[...sorted.sortRows(rows)]} selectedKeys={selected} onSelectionChange={setSelected} sort={sorted.sort} onSortChange={sorted.onSortChange}
    className="[&_table]:min-w-(--container-3xl)"
    columns={[
      {id:"name",header:T.marketName,sortable:true,cell:m=><TableTitleCell title={<Button variant="link" size="md" className="max-w-full truncate p-0 text-foreground hover:text-primary hover:no-underline" onClick={()=>setDetail(m.id)}>{m.name}</Button>} description={m.segmentCode} />},
      {id:"criteria",header:T.criteria,cell:m=><div className="flex flex-col gap-xs text-body-small"><span className="line-clamp-2" title={[...m.criteria.industries,...(m.criteria.sizes ?? []),...m.criteria.regions].join(" / ")}>{[...m.criteria.industries,...(m.criteria.sizes ?? []),...m.criteria.regions].join(" / ") || T.undefined}</span>{m.planName ? <Link className="text-muted-foreground transition-colors hover:text-primary" href={`/strategy/${m.planId}`}>{m.planName}</Link> : <span className="text-muted-foreground">{m.planId ? T.unknown : T.none}</span>}</div>},
      {id:"customers",header:T.customers,sortable:true,cell:m=><div className="flex flex-col gap-xs whitespace-nowrap text-body-small tabular-nums"><span>{T.match} {m.matched ?? T.unknown}</span>{m.missing !== null && m.missing > 0 ? <span className="text-muted-foreground">{T.missing} {m.missing}</span> : null}</div>},
      {id:"status",header:T.status,width:"sm",cell:m=><Tag tone={m.status === "active" ? "success":"neutral"}>{STRATEGY_TEXT.segmentStatusLabel[m.status]}</Tag>},
    ]}
    rowActions={(m) => <RowActions disabled={pending} items={[
      {id:"view",label:T.openMarket,onSelect:()=>setDetail(m.id)},
      ...(canWrite ? [
        ...(!["closed","archived"].includes(m.planStatus ?? "") ? [
        {id:"edit",label:T.editMarket,onSelect:()=>{window.location.href=`/segment/new?code=${encodeURIComponent(m.segmentCode)}`;}},
        ...(m.status === "active" ? [
          {id:"pause",label:STRATEGY_TEXT.segmentPause,onSelect:()=>run(()=>changeSegmentStatus(m.id,"paused"))},
          {id:"retire",label:STRATEGY_TEXT.segmentRetire,onSelect:()=>run(()=>changeSegmentStatus(m.id,"retired"))},
        ]:[{id:"resume",label:STRATEGY_TEXT.segmentResume,onSelect:()=>run(()=>changeSegmentStatus(m.id,"active"))}]),
        ] : []),
        ...moveItems(ROW_OPS, markets.filter(s=>(s.status==="active")===(m.status==="active")).findIndex(s=>s.id===m.id),markets.filter(s=>(s.status==="active")===(m.status==="active")).length,d=>run(()=>moveSegmentRow(m.id,d))),
        {id:"delete",label:ROW_OPS.remove(STRATEGY_TEXT.segmentNoun),danger:true as const,confirm:{verb:ROW_OPS.remove(STRATEGY_TEXT.segmentNoun),target:m.name,consequence:STRATEGY_TEXT.segmentDeleteConsequence,onConfirm:()=>run(()=>deleteSegment(m.id))}},
      ] : []),
    ]} />}
    empty={<EmptyState title={markets.length ? T.noMatches:T.noMarkets} description={T.noMarketsWhy} />}
  />;
  const viewed = markets.find(m=>m.id===detail || m.segmentCode===detail);
  return <div className="flex min-w-0 flex-col gap-xl" data-market-library>
    <FilterBar scope={scope} count={scope ? undefined : filtered.length} search={<SearchSlot><Input aria-label={T.search} placeholder={T.search} value={query} onChange={e=>setQuery(e.target.value)} /></SearchSlot>}
      onReset={query || status ? ()=>{setQuery("");setStatus("");}:undefined}
      actions={<div className="flex items-center gap-sm"><Button variant="secondary" size="md" disabled={chosen.length<2 || chosen.length>3} title={T.compareLimit} onClick={()=>setCompare(true)}>{T.compare}</Button>{actions}</div>}>
      <FilterSlot><NativeSelect aria-label={T.status} value={status} onChange={e=>setStatus(e.target.value)}><option value="">{T.allStates}</option>{Object.entries(STRATEGY_TEXT.segmentStatusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</NativeSelect></FilterSlot>
    </FilterBar>
    {live.length || !shelved.length ? <Section title={T.library} icon="target" description={T.libraryWhy}>{table(live)}</Section> : null}
    {shelved.length ? <Section title={T.shelvedMarkets} icon="archive">{table(shelved)}</Section>:null}
    <p className="text-body-small text-muted-foreground">{T.baseOnly}</p>
    {viewed ? <MarketDetails key={viewed.id} market={viewed} canWrite={canWrite} onClose={()=>setDetail(null)} />:null}
    <Drawer open={compare} onClose={()=>setCompare(false)} title={T.compare} description={T.compareWhy} width="lg" closeLabel={T.closed}>
      <div className="grid grid-cols-1 gap-xl md:grid-cols-2">{chosen.map(m=><Section key={m.id} title={m.name} action={<Button variant="secondary" size="md" onClick={()=>{setCompare(false);setDetail(m.id);}}>{T.preview}</Button>}><MarketCriteria market={m}/><p className="mt-md text-body-small text-muted-foreground">{T.match} {m.matched ?? T.unknown} · {T.missing} {m.missing ?? T.unknown}</p></Section>)}</div>
    </Drawer>
  </div>;
}
