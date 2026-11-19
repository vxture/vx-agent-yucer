"use client";

import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, EmptyState, Icon, Input, NativeSelect, useToast } from "@vxture/design-ui";
import { DataTable } from "./business-controls";
import { CollectionHistory, CollectionToolbar, collectionDrawerWidth } from "./collection-layout";
import { CollectionTable, CollectionTitleCell } from "./collection-table";
import { useCollectionView } from "./collection-view-provider";
import { FilterSlot, RowActions, SearchSlot, moveItems, useTableSort } from "./table-fittings";
import { strategyOfferings } from "../lib/strategy-offerings";
import { LibraryCardFact, MarketOfferingCard } from "./market-offering-card";
import { StrategyQuantity } from "./strategy-detail-label";
import { Tag } from "./tag";
import { useMessages } from "../lib/i18n/provider";
import type { MarketView } from "../lib/market-strategy";
import { changeSegmentStatus, deleteSegment, moveSegmentRow } from "../strategy/actions";
import styles from "./market-library.module.css";

function StrategyReferences({ market }: { readonly market: MarketView }) {
  const { MARKET_STRATEGY_TEXT: T } = useMessages();
  if (market.plans === null) return T.unknown;
  if (!market.plans.length) return T.none;
  return <div className="flex min-w-0 max-w-full flex-col gap-xs">{market.plans.map(p => (
    <Link key={p.id} className="truncate transition-colors hover:text-primary" href={`/strategy/${p.id}`} title={`${p.name} · ${p.period}`}>{p.name}</Link>
  ))}</div>;
}

export function MarketLibrary({ markets, canWrite, actions }: { readonly markets: readonly MarketView[]; readonly canWrite: boolean; readonly actions?: ReactNode }) {
  const { MARKET_STRATEGY_TEXT: T, STRATEGY_TEXT, DATA_TABLE_LABELS, SEGMENT_ERROR, ROW_OPS, TABLE_TOOLBAR_TEXT, SEGMENT_DETAIL_TEXT: D } = useMessages();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useCollectionView("cards");
  const [status,setStatus] = useState("");
  const [selected,setSelected] = useState<readonly string[]>([]);
  const [comparing,setComparing] = useState(false);
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
      {id:"view",label:T.openMarket,onSelect:()=>router.push(`/segment/${encodeURIComponent(m.id)}`)},
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
  const table = (rows: readonly MarketView[]) => <CollectionTable className={styles.table} labels={DATA_TABLE_LABELS} indexStart={1} rowKey={m=>m.id}
    compactSelection={{ label: m => TABLE_TOOLBAR_TEXT.selectRecord(m.name), alwaysVisible: true }}
    rows={[...sorted.sortRows(rows)]} selectedKeys={comparing ? selected : undefined} onSelectionChange={comparing ? setSelected : undefined} sort={sorted.sort} onSortChange={sorted.onSortChange}
    columns={[
      {id:"name",header:T.marketName,track:"subject",sortable:true,cell:m=><CollectionTitleCell title={<Link href={`/segment/${encodeURIComponent(m.id)}`} className="no-underline transition-colors hover:text-primary-text hover:no-underline">{m.name}</Link>} description={m.segmentCode}
        tooltip={[m.name,m.segmentCode].filter(Boolean).join(" / ")} />},
      {id:"criteria",header:T.criteria,track:"criteria",align:"left",cell:m=><div className="flex min-w-0 flex-col gap-xs" title={`${T.industry}: ${m.criteria.industries.join(" / ") || T.unlimited}; ${T.size}: ${m.criteria.sizes?.join(" / ") || T.unlimited}; ${T.region}: ${m.criteria.regions.join(" / ") || T.unlimited}`}>
        <span className="line-clamp-1">{m.criteria.industries.join(" / ") || ([...m.criteria.regions,...(m.criteria.sizes ?? [])].length ? T.unlimited : T.undefined)}</span>
        <span className="line-clamp-1 text-body-small text-muted-foreground">{[m.criteria.sizes?.join(" / "),m.criteria.regions.join(" / ")].filter(Boolean).join(" \u00b7 ") || T.unlimited}</span>
      </div>},
      {id:"customers",header:T.customerCount,sortable:true,track:"count",cell:m=><StrategyQuantity value={m.matched ?? "-"} unit={m.matched === null ? undefined : D.customerUnit}/>},
      {id:"offerings",header:T.productSolutionsTitle,track:"count",cell:m=>m.defaultSolutions == null || m.defaultProducts == null ? T.unknown : <StrategyQuantity value={m.defaultSolutions.length + m.defaultProducts.length} unit={D.recordUnit}/>},
      {id:"plan",header:T.linkedPlan,track:"count",cell:m=><span title={m.plans?.map(p=>p.name).join(" / ")}><StrategyQuantity value={m.plans?.length ?? "-"} unit={m.plans === null ? undefined : D.strategyUnit}/></span>},
      {id:"status",header:T.status,track:"state",cell:m=><Tag tone={m.status==="active"?"success":"neutral"}>{STRATEGY_TEXT.segmentStatusLabel[m.status]}</Tag>},
    ]}
    rowActions={rowActions}
    empty={<EmptyState title={markets.length ? T.noMatches:T.noMarkets} description={T.noMarketsWhy} />}
  />;
  const render = (rows: readonly MarketView[]) => mode === "list" ? table(rows) : rows.length ? (
    <div className="flex flex-col gap-lg">{sorted.sortRows(rows).map(m => {
      const offerings = strategyOfferings(m.defaultSolutions, m.defaultProducts);
      const criteria = [...m.criteria.industries, ...(m.criteria.sizes ?? []), ...m.criteria.regions];
      const need = m.criteria.customerNeed || m.criteria.expectedOutcome || m.criteria.buyingScenario || T.notProvided;
      const excerpt = Array.from(need.replace(/\s+/g, " ").trim());
      return <MarketOfferingCard key={m.id} kind="market" name={m.name} number={m.segmentCode}
        status={<Tag tone={m.status === "active" ? "success" : "neutral"}>{STRATEGY_TEXT.segmentStatusLabel[m.status]}</Tag>}
        actions={rowActions(m)} openLabel={T.openMarket} href={`/segment/${encodeURIComponent(m.id)}`}
        summary={<div className={styles.portrait} data-market-card-portrait>
          <div className={styles.field}>
            <span className={styles.label}><Icon name="users" size="xs" aria-hidden="true" />{D.audience}</span>
            <div className="flex min-w-0 flex-wrap items-center gap-xs" data-market-card-audience>
              {criteria.slice(0, 3).map((value, index) => <Tag key={`${index}:${value}`}>{value}</Tag>)}
              {criteria.length > 3 ? <Link href={`/segment/${encodeURIComponent(m.id)}`} className="text-body-small text-muted-foreground no-underline transition-colors hover:text-primary-text hover:no-underline" title={criteria.slice(3).join(" / ")}>+{criteria.length - 3}</Link> : null}
              {!criteria.length ? <span className="text-body-small text-muted-foreground">{T.undefined}</span> : null}
            </div>
          </div>
          <div className={styles.field}><span className={styles.label}><Icon name="lightbulb" size="xs" aria-hidden="true" />{T.customerNeed}</span><p className={`${styles.need} text-body`} data-market-card-need>{excerpt.slice(0, 120).join("")}{excerpt.length > 120 ? "\u2026" : ""}</p></div>
        </div>}
        context={<div className={styles.field} data-market-card-offerings>
          <span className={styles.label}><Icon name="squares-four" size="xs" aria-hidden="true" />{T.productSolutionsTitle}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-lg gap-y-sm">
            {offerings.slice(0, 2).map(row => <Link key={row.key} href={row.href} className={styles.offering} title={row.name}>
              <Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 truncate text-body">{row.name}</span>
            </Link>)}
            {!offerings.length && <p className="text-body text-muted-foreground">{m.defaultSolutions == null || m.defaultProducts == null ? T.unknown : T.noPlanSolutions}</p>}
            {offerings.length > 2 && <Link href={`/segment/${encodeURIComponent(m.id)}`} className="text-body-small text-muted-foreground no-underline transition-colors hover:text-primary-text hover:no-underline">+{offerings.length - 2}</Link>}
          </div>
        </div>}
        facts={<>
          <LibraryCardFact icon="users" label={T.customerCount}><StrategyQuantity value={m.matched ?? "-"} unit={m.matched === null ? undefined : D.customerUnit}/></LibraryCardFact>
          <LibraryCardFact icon="squares-four" label={T.productSolutionsTitle}><StrategyQuantity value={m.defaultSolutions == null || m.defaultProducts == null ? "-" : offerings.length} unit={m.defaultSolutions == null || m.defaultProducts == null ? undefined : D.recordUnit}/></LibraryCardFact>
          <LibraryCardFact icon="flag" label={T.linkedPlan}><StrategyQuantity value={m.plans?.length ?? "-"} unit={m.plans === null ? undefined : D.strategyUnit}/></LibraryCardFact>
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
    { id: "preview", label: T.openMarket, render: m => <Button asChild variant="secondary" size="md"><Link href={`/segment/${encodeURIComponent(m.id)}`}>{T.openMarket}</Link></Button> },
  ];
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
