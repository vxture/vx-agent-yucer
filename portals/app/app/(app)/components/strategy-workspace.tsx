"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Collapsible, CollapsibleContent, CollapsibleTrigger, DetailList, DetailRow, Drawer, EmptyState, Icon, Input, LabeledValue, NativeSelect, Section, Tabs, TabsTrigger, Tooltip, TooltipContent, TooltipTrigger, ViewLayout, ViewModeSwitch, useToast, type ActionMenuItem, type FilterBarView } from "@vxture/design-ui";
import { DataTable, FilterBar, TabsList, ViewHeader } from "./business-controls";
import { RowActions, SearchSlot } from "./table-fittings";
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
  const [basis,setBasis]=useState(false);
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
  const marketLinks=(p:StrategyView)=>p.marketIds===null || (!data.canMarkets && p.marketIds.length>0)
    ? T.unknown : p.marketIds.length ? data.markets?.filter(m=>p.marketIds!.includes(m.id)).map(m=>
      <Button key={m.id} asChild size="md" variant="secondary"><Link href={`/strategy?view=markets&market=${encodeURIComponent(m.id)}`}>{m.name}</Link></Button>
    ) : T.noPlanMarkets;
  const solutionLinks=(p:StrategyView)=>p.solutions === null ? T.unknown : p.solutions.length ? p.solutions.map(s => (
    <Button key={s.id} asChild size="md" variant="secondary" className="max-w-full">
      <Link href={`/solution?solution=${encodeURIComponent(s.id)}`} title={`${s.name} · ${s.solutionCode}`}>
        <span className="truncate">{s.name}</span>{s.status === "retired" ? <span className="shrink-0 text-muted-foreground">{T.retiredSolution}</span> : null}
      </Link>
    </Button>
  )) : T.noPlanSolutions;
  const card=(p:StrategyView)=><Card key={p.id} data-strategy-card>
    <CardHeader>
      <div className="flex min-w-0 items-start justify-between gap-lg">
        <div className="flex min-w-0 flex-col gap-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-sm">
            <CardTitle><Link href={`/strategy/${p.id}`} className="transition-colors hover:text-primary">{p.name}</Link></CardTitle>
            <Tag tone={p.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[p.status]}</Tag>
          </div>
          <div className="flex flex-wrap items-center gap-x-lg gap-y-xs text-body-small text-muted-foreground">
            <span title={p.planNo}>{p.period}</span>
            <span>{T.owner} <MemberName sub={p.ownerSub}/></span>
          </div>
        </div>
        <RowActions items={items(p)} disabled={pending}/>
      </div>
    </CardHeader>
    <CardContent>
      <div className="grid min-w-0 grid-cols-1 gap-xl @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-lg">
          <div className="flex flex-col gap-xs">
            <span className="text-body-small text-muted-foreground">{T.direction}</span>
            <p className="line-clamp-2 text-body" title={p.objective ?? undefined}>{p.objective || T.directionEmpty}</p>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-md gap-y-sm text-body-small text-muted-foreground">
            <span className="flex min-h-control-md items-center">{T.currentMarkets}</span>
            <div className="flex min-h-control-md min-w-0 flex-wrap items-center gap-sm">{marketLinks(p)}</div>
            <span className="flex min-h-control-md items-center">{T.primarySolutions}</span>
            <div className="flex min-h-control-md min-w-0 flex-wrap items-center gap-sm">{solutionLinks(p)}</div>
          </div>
        </div>
        <div className="@container min-w-0">
          <div className="grid grid-cols-2 gap-md @sm:grid-cols-4" data-strategy-metrics>
            <LabeledValue label={T.marketCount} value={number(p.marketIds?.length)}/>
            <LabeledValue label={T.customerCount} value={number(p.customerCount)}/>
            <LabeledValue label={T.solutionCount} value={number(p.solutions?.length)}/>
            <LabeledValue label={T.campaignCount} value={number(p.campaigns?.length)}/>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>;
  const table=(rows:StrategyView[])=><DataTable leadingSpacer labels={DATA_TABLE_LABELS} rows={rows} rowKey={p=>p.id} indexStart={1}
    className="[&_table]:min-w-(--container-3xl)" columns={[
      {id:"name",header:T.strategy,align:"left",width:"lg",cell:p=><div className="flex flex-col gap-xs"><Link href={`/strategy/${p.id}`} className="font-medium transition-colors hover:text-primary">{p.name}</Link><span className="text-body-small text-muted-foreground">{p.period} · {p.planNo}</span></div>},
      {id:"direction",header:T.direction,align:"left",width:"lg",cell:p=><span className="line-clamp-2 text-body-small" title={p.objective ?? undefined}>{p.objective || T.directionEmpty}</span>},
      {id:"markets",header:T.marketCount,cell:p=>number(p.marketIds?.length)},
      {id:"customers",header:T.customerCount,cell:p=>number(p.customerCount)},
      {id:"status",header:T.status,cell:p=><Tag tone={p.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[p.status]}</Tag>},
    ]} rowActions={p=><RowActions items={items(p)} disabled={pending}/>}
    empty={<EmptyState title={T.noMatches}/>}/>
  ;
  const current = plans.filter(p=>!["closed","archived"].includes(p.status));
  const history = plans.filter(p=>["closed","archived"].includes(p.status));
  const cards = (rows:StrategyView[]) => <div className="grid grid-cols-1 gap-lg">{rows.map(card)}</div>;
  const tabs = <Tabs value={view} onValueChange={switchView}><TabsList aria-label={T.strategy}>
    {data.canPlan?<TabsTrigger className="text-label-small" value="overview">{T.overview}</TabsTrigger>:null}
    {data.canMarkets?<TabsTrigger className="text-label-small" value="markets">{T.markets}</TabsTrigger>:null}
    {data.canPlan?<TabsTrigger className="text-label-small" value="validation">{T.validation}</TabsTrigger>:null}
  </TabsList></Tabs>;
  const checkButton = <Button size="md" variant="secondary" onClick={()=>setChecks(true)}>{T.checks}<span className="text-body-small text-muted-foreground tabular-nums">{(data.canPlan?data.planAdvice.length:0)+(data.canMarkets?data.segmentAdvice.length:0)}</span></Button>;
  const periodFilter = <div className="w-36 max-w-full"><NativeSelect className="h-control-xl text-body-small font-medium" aria-label={T.period} value={period} onChange={e=>setPeriod(e.target.value)}><option value="">{T.allPeriods}</option>{[...new Set(data.plans?.map(p=>p.period))].map(p=><option key={p}>{p}</option>)}</NativeSelect></div>;
  const layoutSwitch=<ViewModeSwitch value={layout} onChange={setLayout} ariaLabel={T.layout} labels={{list:T.listView,cards:T.cardsView}}/>;
  const basisButton=<Tooltip><TooltipTrigger asChild><Button size="icon-xl" variant="ghost" aria-label={T.basis} onClick={()=>setBasis(true)}><Icon name="info" size="md"/></Button></TooltipTrigger><TooltipContent>{T.basis}</TooltipContent></Tooltip>;
  const overview=<>
    <FilterBar scope={tabs} actions={<div className="flex items-center gap-sm">{layoutSwitch}{checkButton}</div>}
      search={<SearchSlot><Input aria-label={T.searchPlans} placeholder={T.searchPlans} value={query} onChange={e=>setQuery(e.target.value)}/></SearchSlot>}
      onReset={query||period?()=>{setQuery("");setPeriod("");}:undefined}>
      <div className="@3xl:hidden">{periodFilter}</div>
    </FilterBar>
    {!plans.length ? <EmptyState title={data.plans?.length?T.noMatches:T.noPlans} description={T.noPlansWhy}/> : <>
      {current.length ? <div aria-label={T.live}>{layout==="cards" ? cards(current):table(current)}</div> : null}
      {history.length ? <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger asChild><Button size="md" variant="ghost" className="text-muted-foreground"><Icon name={historyOpen?"chevron-up":"chevron-down"} size="sm"/>{T.history}<span className="tabular-nums">{history.length}</span></Button></CollapsibleTrigger>
        <CollapsibleContent className="pt-lg">{table(history)}</CollapsibleContent>
      </Collapsible>:null}
    </>}
  </>;
  const results=(selected:readonly StrategyView[])=>{
    const rows=selected.flatMap(p=>(p.results?.length?p.results:[null]).map(r=>({plan:p,result:r,empty:p.results===null?T.unknown:T.none,key:`${p.id}:${r?.currency ?? "empty"}`})));
    return <div className="flex min-w-0 flex-col gap-md" data-strategy-results>
      <DataTable leadingSpacer labels={DATA_TABLE_LABELS} rows={rows} rowKey={r=>r.key} indexStart={1}
        className="[&_table]:min-w-(--container-3xl)" columns={[
          ...(!detailId?[{id:"strategy",header:T.strategy,align:"left" as const,width:"lg" as const,cell:({plan:p}:typeof rows[number])=><div className="flex flex-col gap-xs"><Link href={`/strategy/${p.id}`} className="font-medium transition-colors hover:text-primary">{p.name}</Link><span className="text-body-small text-muted-foreground">{p.period}</span></div>}]:[]),
          {id:"currency",header:T.currency,width:"xs",cell:({result:r,empty})=>r?.currency ?? empty},
          {id:"pipeline",header:T.pipeline,align:"numeric",width:"sm",cell:({result:r,empty})=>r?money(r.open,r.currency):empty},
          {id:"won",header:T.won,align:"numeric",width:"sm",cell:({result:r,empty})=>r?money(r.won,r.currency):empty},
          {id:"rate",header:T.winRate,align:"numeric",width:"sm",cell:({result:r,empty})=><span className="inline-flex flex-col gap-xs"><span>{r && r.wonCount+r.lostCount>0?`${Math.round(r.wonCount/(r.wonCount+r.lostCount)*100)}%`:empty}</span>{r?<span className="text-body-small text-muted-foreground" title={T.sample}>{r.wonCount} / {r.lostCount}</span>:null}</span>},
        ]} rowActions={({plan:p})=><RowActions items={detailId?[]:[{id:"view",label:T.openPlan,onSelect:()=>router.push(`/strategy/${p.id}`)}]}/>}/>
      {selected.some(p=>p.results===null)?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:null}
      {selected.some(p=>p.attributionIncomplete || p.conflicts || p.results?.some(r=>r.unpriced>0))?<Button size="md" variant="ghost" className="self-start text-muted-foreground" onClick={()=>setBasis(true)}><Icon name="info" size="sm"/>{T.resultNotes}</Button>:null}
    </div>;
  };
  const detailContent=detail?<>
    <Section title={T.direction} icon="flag">
      <p className="whitespace-pre-wrap break-words text-body">{detail.objective || T.directionEmpty}</p>
      <div className="flex flex-wrap items-center gap-sm text-body-small text-muted-foreground">
        <span>{T.primarySolutions}</span>{solutionLinks(detail)}
      </div>
    </Section>
    {!data.canMarkets || data.markets===null?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:<Section title={T.currentMarkets} icon="target"><MarketLibrary markets={data.markets} canWrite={data.canWriteMarket} planId={detail.id}/></Section>}
    <Section title={T.handoff} icon="workflow" description={T.handoffWhy}>
      <DetailList columns={1}><DetailRow label={T.planning} actions={<Button asChild variant="secondary" size="md"><Link href="/planning">{T.openPlanning}</Link></Button>}>{T.planningHint}</DetailRow>
      <DetailRow label={T.campaignCount} actions={<Button asChild variant="secondary" size="md"><Link href="/campaign">{T.openCampaigns}</Link></Button>}>{detail.campaigns?.length ? <div className="flex flex-wrap gap-sm">{detail.campaigns.map(c=><Tag key={c.id}>{c.name}</Tag>)}</div>:detail.campaigns===null?T.unknown:T.noCampaigns}</DetailRow></DetailList>
    </Section>
    <Section title={T.results} icon="chart-line" action={basisButton}>{results([detail])}</Section>
  </>:null;
  return <ViewLayout className="@container" data-strategy-workspace>
    {detail ? <><PageCrumbs trail={[{label:T.strategy,href:"/strategy"}]} current={detail.name}/><ViewHeader icon="graph" title={detail.name} description={detail.planNo} divider secondary={<Tag tone={detail.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[detail.status]}</Tag>} action={<RowActions disabled={pending} items={items(detail)}/>}/></> : <ModuleHeadline moduleKey="strategy" description={T.brief}
      action={<div className="flex max-w-full flex-wrap items-center justify-end gap-sm">{view!=="markets"?<div className="hidden @3xl:block">{periodFilter}</div>:null}{view==="markets"?data.canWriteMarket?<Button asChild size="xl"><Link href="/segment/new">{T.newMarket}</Link></Button>:null:data.canCreate?<Button asChild size="xl"><Link href="/strategy/new">{T.newPlan}</Link></Button>:null}</div>}/>}
    {detail ? <FilterBar scope={<div className="flex flex-wrap items-center gap-x-xl gap-y-sm text-body-small text-muted-foreground"><span>{T.period} {detail.period}</span><span>{T.owner} <MemberName sub={detail.ownerSub}/></span><span>{T.approvedAt} {detail.approvedAt ? new Date(detail.approvedAt).toLocaleDateString(locale):T.none}</span></div>} actions={checkButton}/> : view==="validation" ? <FilterBar scope={tabs} actions={<div className="flex items-center gap-sm">{basisButton}{checkButton}</div>}><div className="@3xl:hidden">{periodFilter}</div></FilterBar> : null}
    {detail?detailContent:!allowedView?<EmptyState title={T.unknown}/>:view==="markets"?data.markets?<MarketLibrary markets={data.markets} canWrite={data.canWriteMarket} initialMarket={params.get("market") ?? undefined} scope={tabs} actions={checkButton}/>:<EmptyState title={T.unknown}/>:data.plans===null?<EmptyState title={T.unknown}/>:view==="validation"?(plans.length?results(plans):<EmptyState title={T.noPlans} description={T.noPlansWhy}/>):overview}
    <footer className="border-t border-dashed border-primary/10 pt-lg pb-2xl text-body-small text-muted-foreground">{view==="validation"?<p className="mb-sm">{T.validationScope}</p>:null}{T.dataAt} {new Date(data.at).toLocaleString(locale)}</footer>
    <Drawer open={basis} onClose={()=>setBasis(false)} width="lg" title={T.basis} description={T.validationWhy} closeLabel={T.closed}>
      <div className="flex flex-col gap-xl"><p className="text-body-small text-muted-foreground">{T.validationScope}</p>
        {(detail?[detail]:plans).map(p=><div key={p.id} className="flex flex-col gap-sm"><h3 className="text-heading-3">{p.name}</h3>
          {p.results===null?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:!p.results.length?<p className="text-body-small text-muted-foreground">{T.noDealsWhy}</p>:null}
          {p.attributionIncomplete?<p className="text-body-small text-muted-foreground">{T.attributionIncomplete}</p>:null}
          {p.conflicts?<p className="text-body-small text-(color:--warning-text)">{T.conflict} · {p.conflicts}</p>:null}
          {p.results?.some(r=>r.unpriced>0)?<p className="text-body-small text-muted-foreground">{p.results.reduce((n,r)=>n+r.unpriced,0)} {T.unpriced}</p>:null}
        </div>)}
      </div>
    </Drawer>
    <Drawer open={checks} onClose={()=>setChecks(false)} width="lg" title={T.checks} description={T.checkWhy} closeLabel={T.closed}>
      <div className="flex flex-col gap-xl">{data.plans===null||data.markets===null||data.markets.some(m=>m.customers===null)||data.plans.some(p=>p.campaigns===null)?<p className="text-body-small text-muted-foreground">{T.checkIncomplete}</p>:null}
        {data.canPlan && data.plans!==null?<PlanAdvicePanel advice={data.planAdvice.filter(a=>!detailId||a.planId===detailId)} canApprove={data.canApprove} onApprove={movePlan}/>:null}
        {data.canMarkets && data.markets!==null?<SegmentAdvicePanel advice={data.segmentAdvice.filter(a=>!detailId||detail?.marketIds?.includes(a.segmentId))}/>:null}
      </div>
    </Drawer>
  </ViewLayout>;
}
