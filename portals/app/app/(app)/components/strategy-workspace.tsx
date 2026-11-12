"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, DetailList, DetailRow, Drawer, EmptyState, Icon, Input, MetricListCard, NativeSelect, Section, SectionHeader, Tabs, TabsTrigger, ViewLayout, useToast, type ActionMenuItem, type FilterBarView } from "@vxture/design-ui";
import { DataTable, FilterBar, TabsList, ViewHeader } from "./business-controls";
import { FilterSlot, RowActions, SearchSlot } from "./table-fittings";
import { ModuleHeadline } from "./module-headline";
import { PageCrumbs } from "./page-crumbs";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { nextPlanStatuses } from "../../domains/strategy/lib/lifecycle";
import { PlanAdvicePanel } from "./plan-advice-panel";
import { SegmentAdvicePanel } from "./segment-advice-panel";
import { MarketLibrary } from "./market-library";
import { Tag } from "./tag";
import type { StrategyWorkspaceData } from "../strategy/workspace-data";
import type { StrategyView } from "../lib/market-strategy";
import { movePlan } from "../strategy/actions";

export type StrategyTab = "overview" | "markets" | "validation";
export function StrategyWorkspace({ data, view, detailId }: { readonly data: StrategyWorkspaceData; readonly view: StrategyTab; readonly detailId?: string }) {
  const { MARKET_STRATEGY_TEXT: T, PLAN_STATUS_LABEL, PLAN_ERROR, STRATEGY_TEXT, DATA_TABLE_LABELS } = useMessages();
  const locale=useLocale();
  const router=useRouter(), params=useSearchParams();
  const [layout,setLayout]=useState<FilterBarView>("cards");
  const [query,setQuery]=useState("");
  const period=params.get("period") ?? "";
  const setPeriod=(value:string)=>{
    const q=new URLSearchParams(params);
    if(value)q.set("period",value);else q.delete("period");
    router.replace(`/strategy?${q}`,{scroll:false});
  };
  const [checks,setChecks]=useState(false);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [pending,start]=useTransition();
  const {toast}=useToast();
  const detail=data.plans?.find(p=>p.id===detailId);
  const plans=data.plans?.filter(p=>(!period || p.period===period) && (!query.trim() || `${p.name} ${p.planNo} ${p.objective ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))) ?? [];
  const allowedView = view === "markets" ? data.canMarkets : data.canPlan;
  const switchView=(next:string)=>{
    const q=new URLSearchParams(params);q.set("view",next);q.delete("market");
    router.push(`/strategy?${q}`,{scroll:false});
  };
  const run=(id:string,to:string)=>start(async()=>{
    try {const r=await movePlan(id,to);if(!r.ok)toast({tone:"danger",title:PLAN_ERROR[r.error ?? "denied"] ?? PLAN_ERROR.denied});}
    catch {toast({tone:"danger",title:PLAN_ERROR.denied});}
  });
  const items=(p:StrategyView):ActionMenuItem[]=>[
    {id:"view",label:T.openPlan,onSelect:()=>router.push(`/strategy/${p.id}`)},
    ...(data.canEdit && !["closed","archived"].includes(p.status) ? [{id:"edit",label:T.editPlan,onSelect:()=>router.push(`/strategy/new?no=${encodeURIComponent(p.planNo)}`)}]:[]),
    ...nextPlanStatuses(p.status).filter(s=>s==="approved"?data.canApprove:data.canEdit).map(s=>({id:s,label:STRATEGY_TEXT.planMoveTo(PLAN_STATUS_LABEL[s] ?? s),onSelect:()=>run(p.id,s)})),
  ];
  const number=(n:number|null|undefined)=>n==null ? T.unknown:n.toLocaleString(locale);
  const money=(n:number,currency:string)=>new Intl.NumberFormat(locale,{style:"currency",currency,maximumFractionDigits:0}).format(n);
  const card=(p:StrategyView)=><MetricListCard key={p.id}
    title={<Link href={`/strategy/${p.id}`} className="transition-colors hover:text-primary">{p.name}</Link>}
    description={<span>{p.period} · {p.planNo}</span>}
    badges={<div className="flex flex-wrap items-center gap-sm"><Tag tone={p.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[p.status]}</Tag><span className="text-body-small text-muted-foreground">{T.owner} <MemberName sub={p.ownerSub} /></span></div>}
    actions={<RowActions items={items(p)} disabled={pending}/>}
    note={<div className="flex flex-col gap-sm"><p className="text-body-small text-muted-foreground">{T.direction}</p><p className="line-clamp-2 text-body" title={p.objective ?? undefined}>{p.objective || T.directionEmpty}</p></div>}
    metrics={[{key:"markets",label:T.marketCount,value:number(p.marketIds?.length)},{key:"customers",label:T.customerCount,value:number(p.customerCount)},{key:"campaigns",label:T.campaignCount,value:number(p.campaigns?.length)}]}
    footer={<div className="flex flex-wrap items-center gap-xs text-body-small text-muted-foreground">{p.marketIds===null || (!data.canMarkets && p.marketIds.length>0)?T.unknown:p.marketIds.length ? data.markets?.filter(m=>p.marketIds!.includes(m.id)).map(m=><Link key={m.id} href={`/strategy?view=markets&market=${encodeURIComponent(m.id)}`} className="transition-colors hover:text-primary">{m.name}</Link>):T.noPlanMarkets}</div>}
  />;
  const table=(rows:StrategyView[])=><DataTable leadingSpacer labels={DATA_TABLE_LABELS} rows={rows} rowKey={p=>p.id} indexStart={1}
    className="[&_table]:min-w-(--container-3xl)" columns={[
      {id:"name",header:T.strategy,cell:p=><div className="flex flex-col gap-xs"><Link href={`/strategy/${p.id}`} className="font-medium transition-colors hover:text-primary">{p.name}</Link><span className="text-body-small text-muted-foreground">{p.period} · {p.planNo}</span></div>},
      {id:"direction",header:T.direction,cell:p=><span className="line-clamp-2 text-body-small" title={p.objective ?? undefined}>{p.objective || T.directionEmpty}</span>},
      {id:"markets",header:T.marketCount,cell:p=>number(p.marketIds?.length)},
      {id:"customers",header:T.customerCount,cell:p=>number(p.customerCount)},
      {id:"status",header:T.status,cell:p=><Tag tone={p.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[p.status]}</Tag>},
    ]} rowActions={p=><RowActions items={items(p)} disabled={pending}/>}
    empty={<EmptyState title={T.noMatches}/>}/>
  ;
  const current = plans.filter(p=>!["closed","archived"].includes(p.status));
  const history = plans.filter(p=>["closed","archived"].includes(p.status));
  const cards = (rows:StrategyView[]) => <div className={rows.length > 1 ? "grid grid-cols-1 gap-lg md:grid-cols-2" : "grid grid-cols-1 gap-lg"}>{rows.map(card)}</div>;
  const tabs = <Tabs value={view} onValueChange={switchView}><TabsList aria-label={T.strategy}>
    {data.canPlan?<TabsTrigger className="text-label-small" value="overview">{T.overview}</TabsTrigger>:null}
    {data.canMarkets?<TabsTrigger className="text-label-small" value="markets">{T.markets}</TabsTrigger>:null}
    {data.canPlan?<TabsTrigger className="text-label-small" value="validation">{T.validation}</TabsTrigger>:null}
  </TabsList></Tabs>;
  const checkButton = <Button size="md" variant="secondary" onClick={()=>setChecks(true)}>{T.checks}<span className="text-body-small text-muted-foreground tabular-nums">{(data.canPlan?data.planAdvice.length:0)+(data.canMarkets?data.segmentAdvice.length:0)}</span></Button>;
  const periodFilter = <FilterSlot><NativeSelect aria-label={T.period} value={period} onChange={e=>setPeriod(e.target.value)}><option value="">{T.allPeriods}</option>{[...new Set(data.plans?.map(p=>p.period))].map(p=><option key={p}>{p}</option>)}</NativeSelect></FilterSlot>;
  const overview=<>
    <FilterBar view={layout} onViewChange={setLayout} scope={tabs} actions={checkButton}
      search={<SearchSlot><Input aria-label={T.search} placeholder={T.search} value={query} onChange={e=>setQuery(e.target.value)}/></SearchSlot>}
      onReset={query||period?()=>{setQuery("");setPeriod("");}:undefined}>
      {periodFilter}
    </FilterBar>
    {!plans.length ? <EmptyState title={data.plans?.length?T.noMatches:T.noPlans} description={T.noPlansWhy}/> : <>
      {current.length ? <Section icon="flag" title={T.live}>{layout==="cards" ? cards(current):table(current)}</Section> : null}
      {history.length ? <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <SectionHeader divider={historyOpen} icon="archive" title={<span>{T.history} <span className="text-body-small text-muted-foreground">{history.length}</span></span>}
          action={<CollapsibleTrigger asChild><Button size="md" variant="ghost"><Icon name={historyOpen?"chevron-up":"chevron-down"} size="sm"/>{historyOpen?T.collapse:T.expand}</Button></CollapsibleTrigger>}/>
        <CollapsibleContent className="pt-lg">{layout==="cards"?cards(history):table(history)}</CollapsibleContent>
      </Collapsible>:null}
    </>}
  </>;
  const results=(selected:readonly StrategyView[])=><Section title={T.results} icon="chart-line" description={T.validationWhy}>
    <p className="mb-lg text-body-small text-muted-foreground">{T.validationScope}</p>
    <div className="flex flex-col gap-xl">{selected.map(p=><Section key={p.id} title={<Link className="transition-colors hover:text-primary" href={`/strategy/${p.id}`}>{p.name}</Link>}>
      {p.results===null?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:!p.results.length?<EmptyState title={T.noDeals} description={T.noDealsWhy}/>:<DataTable leadingSpacer labels={DATA_TABLE_LABELS} rows={p.results} rowKey={r=>r.currency} indexStart={1}
        columns={[
          {id:"currency",header:T.currency,cell:r=>r.currency},
          {id:"pipeline",header:T.pipeline,align:"numeric",cell:r=>money(r.open,r.currency)},
          {id:"won",header:T.won,align:"numeric",cell:r=>money(r.won,r.currency)},
          {id:"rate",header:T.winRate,align:"numeric",cell:r=><div className="flex flex-col gap-xs"><span>{r.wonCount+r.lostCount>0?`${Math.round(r.wonCount/(r.wonCount+r.lostCount)*100)}%`:T.none}</span><span className="text-body-small text-muted-foreground" title={T.sample}>{r.wonCount} / {r.lostCount}</span></div>},
        ]} rowActions={()=> <RowActions items={[]}/>}/>
      }
      {p.attributionIncomplete ? <p className="mt-md text-body-small text-muted-foreground">{T.attributionIncomplete}</p>:null}
      {p.conflicts ? <p className="mt-md text-body-small text-(color:--warning-text)">{T.conflict} · {p.conflicts}</p>:null}
      {p.results?.some(r=>r.unpriced > 0)?<p className="mt-md text-body-small text-muted-foreground">{p.results.reduce((n,r)=>n+r.unpriced,0)} {T.unpriced}</p>:null}
    </Section>)}</div>
  </Section>;
  const detailContent=detail?<>
    <DetailList columns={3}><DetailRow label={T.period}>{detail.period}</DetailRow><DetailRow label={T.owner}><MemberName sub={detail.ownerSub}/></DetailRow><DetailRow label={T.approvedAt}>{detail.approvedAt ? new Date(detail.approvedAt).toLocaleDateString(locale):T.none}</DetailRow></DetailList>
    <Section title={T.direction} icon="flag"><p className="whitespace-pre-wrap break-words text-body">{detail.objective || T.directionEmpty}</p></Section>
    {!data.canMarkets || data.markets===null?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:<MarketLibrary markets={data.markets} canWrite={data.canWriteMarket} planId={detail.id}/>}
    <Section title={T.handoff} icon="workflow" description={T.handoffWhy}>
      <DetailList columns={1}><DetailRow label={T.openPlanning} actions={<Button asChild variant="secondary" size="md"><Link href="/planning">{T.openPlanning}</Link></Button>}>{T.planningHint}</DetailRow>
      <DetailRow label={T.campaignCount} actions={<Button asChild variant="secondary" size="md"><Link href="/campaign">{T.openCampaigns}</Link></Button>}>{detail.campaigns?.length ? <div className="flex flex-wrap gap-sm">{detail.campaigns.map(c=><Tag key={c.id}>{c.name}</Tag>)}</div>:detail.campaigns===null?T.unknown:T.noCampaigns}</DetailRow></DetailList>
    </Section>
    {results([detail])}
  </>:null;
  return <ViewLayout data-strategy-workspace>
    {detail ? <><PageCrumbs trail={[{label:T.strategy,href:"/strategy"}]} current={detail.name}/><ViewHeader icon="graph" title={detail.name} description={detail.planNo} divider secondary={<Tag tone={detail.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[detail.status]}</Tag>} action={<RowActions disabled={pending} items={items(detail)}/>}/></> : <ModuleHeadline moduleKey="strategy" description={T.brief}
      action={view==="markets"?data.canWriteMarket?<Button asChild size="xl"><Link href="/segment/new">{T.newMarket}</Link></Button>:null:data.canCreate?<Button asChild size="xl"><Link href="/strategy/new">{T.newPlan}</Link></Button>:null}/>}
    {detail ? <FilterBar actions={checkButton}/> : view==="validation" ? <FilterBar scope={tabs} actions={checkButton}>{periodFilter}</FilterBar> : null}
    {detail?detailContent:!allowedView?<EmptyState title={T.unknown}/>:view==="markets"?data.markets?<MarketLibrary markets={data.markets} canWrite={data.canWriteMarket} initialMarket={params.get("market") ?? undefined} scope={tabs} actions={checkButton}/>:<EmptyState title={T.unknown}/>:data.plans===null?<EmptyState title={T.unknown}/>:view==="validation"?(plans.length?results(plans):<EmptyState title={T.noPlans} description={T.noPlansWhy}/>):overview}
    <footer className="mt-xl border-t border-dashed border-primary/10 pt-lg pb-xl text-body-small text-muted-foreground">{T.dataAt} {new Date(data.at).toLocaleString(locale)}</footer>
    <Drawer open={checks} onClose={()=>setChecks(false)} width="lg" title={T.checks} description={T.checkWhy} closeLabel={T.closed}>
      <div className="flex flex-col gap-xl">{data.plans===null||data.markets===null||data.markets.some(m=>m.customers===null)||data.plans.some(p=>p.campaigns===null)?<p className="text-body-small text-muted-foreground">{T.checkIncomplete}</p>:null}
        {data.canPlan && data.plans!==null?<PlanAdvicePanel advice={data.planAdvice.filter(a=>!detailId||a.planId===detailId)} canApprove={data.canApprove} onApprove={movePlan}/>:null}
        {data.canMarkets && data.markets!==null?<SegmentAdvicePanel advice={data.segmentAdvice.filter(a=>!detailId||detail?.marketIds?.includes(a.segmentId))}/>:null}
      </div>
    </Drawer>
  </ViewLayout>;
}
