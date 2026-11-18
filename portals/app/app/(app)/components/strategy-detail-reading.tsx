"use client";

import Link from "next/link";
import { Children, type ReactNode } from "react";
import { Button, Card, CardContent, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@vxture/design-ui";
import { Section, SectionHeader } from "./help-section";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { strategyPeriodRangeLabel } from "../../domains/strategy/lib/plan-period";
import { strategyOfferings } from "../lib/strategy-offerings";
import type { StrategyView } from "../lib/market-strategy";
import type { FulfillmentRow } from "../lib/strategy-fulfillment";
import { Tag } from "./tag";
import styles from "./strategy-detail-reading.module.css";

export function StrategyDetailBasic({ plan:p }: { readonly plan:StrategyView }) {
  const { MARKET_STRATEGY_TEXT:T, STRATEGY_RESULT_TEXT:R, STRATEGY_TEXT:S }=useMessages();
  const locale=useLocale();
  const facts=[
    {label:S.newPlanName,value:p.name},
    {label:R.period,value:strategyPeriodRangeLabel(p.period) ?? T.periodNeedsDates},
    {label:S.newPlanOwner,value:<MemberName sub={p.ownerSub} name={p.publishedOwnerName} fallback={T.noOwner}/>},
    {label:T.strategyType,value:p.strategyType?.name ?? T.typeUnclassified},
    {label:R.value,value:p.resultOptions?.find(o=>o.id===p.result?.valuePropositionId)?.name ?? "-"},
    {label:R.paths,value:p.resultOptions?.filter(o=>o.kind==="path" && p.result?.pathIds.includes(o.id)).map(o=>o.name).join(" / ") || "-"},
  ];
  return <Collapsible defaultOpen className="flex min-w-0 flex-col gap-md" data-strategy-basic-section>
    <SectionHeader title={R.basic} icon="clipboard" action={<CollapsibleTrigger asChild><Button size="icon-md" variant="ghost" className="group" aria-label={R.basic}><Icon name="chevron-down" size="sm" className="transition-transform group-data-[state=open]:rotate-180"/></Button></CollapsibleTrigger>}/>
    <CollapsibleContent>
      <Card className="min-w-0 py-lg" data-strategy-basic-card><CardContent className="flex min-w-0 flex-col gap-lg">
        <dl className={styles.facts} data-strategy-basic-facts>{facts.map(f=><div key={f.label} className="flex min-w-0 flex-col gap-xs"><dt className="text-body-small text-muted-foreground">{f.label}</dt><dd className="break-words text-body">{f.value}</dd></div>)}</dl>
        <div className={styles.position} data-strategy-detail-direction><span className="text-body-small text-muted-foreground">{T.strategyPosition}</span><p className="whitespace-pre-wrap break-words text-body">{p.objective || T.directionEmpty}</p></div>
        <div className="flex flex-wrap items-center justify-between gap-md text-body-small text-muted-foreground" data-strategy-publication-meta>
          <span>{T.publishedAt}<span className="ml-sm tabular-nums">{p.approvedAt?new Date(p.approvedAt).toLocaleDateString(locale):"-"}</span></span>
          {p.createdBySub?<span className="inline-flex min-w-0 items-center gap-xs">{T.creator}<MemberName sub={p.createdBySub}/></span>:null}
        </div>
        {p.changeReason?<div className={styles.position}><span className="text-body-small text-muted-foreground">{T.changeReason}</span><p className="whitespace-pre-wrap break-words text-body">{p.changeReason}</p></div>:null}
      </CardContent></Card>
    </CollapsibleContent>
  </Collapsible>;
}

export function StrategyDetailGoals({ plan:p }: { readonly plan:StrategyView }) {
  const { STRATEGY_RESULT_TEXT:R, STRATEGY_HANDOFF_TEXT:H, STRATEGY_DETAIL_TEXT:D }=useMessages();
  const locale=useLocale();
  const goals=p.result?.goals.map(g=>({id:g.id,name:g.name,baseline:g.baseline,target:g.target,unit:g.unit,dueOn:g.dueOn,criterion:g.criterion}))
    ?? p.expectations?.map(g=>({id:g.id,name:H[g.metric],baseline:"",target:g.amount,unit:g.currency ?? H.count,dueOn:"",criterion:g.criterion})) ?? [];
  const format=(v:string)=>v.trim() && Number.isFinite(Number(v))?Number(v).toLocaleString(locale,{maximumFractionDigits:2}):"-";
  return <Section title={R.goals} icon="chart-line-up" help={R.fullHelp}>
    <Card className="min-w-0 py-lg" data-strategy-goals-card><CardContent>
    {!goals.length?<p className="text-body-small text-muted-foreground">{D.emptyGoals}</p>:<div className={styles.goalTable} data-strategy-detail-goals><Table>
      <colgroup><col className={styles.indexColumn}/><col className={styles.goalNameColumn}/><col className={styles.goalValueColumn}/><col className={styles.goalDateColumn}/><col/></colgroup>
      <TableHeader><TableRow><TableHead aria-label={D.order}/><TableHead>{R.name}</TableHead><TableHead>{R.target}</TableHead><TableHead>{R.dueOn}</TableHead><TableHead>{R.criterion}</TableHead></TableRow></TableHeader>
      <TableBody>{goals.map((g,i)=><TableRow key={g.id}>
        <TableCell className="text-center tabular-nums text-muted-foreground">{i+1}</TableCell>
        <TableCell><span className="line-clamp-2 text-body" title={g.name}>{g.name || R.untitled}</span></TableCell>
        <TableCell><div className="flex min-w-0 flex-col gap-xs"><span className="text-body font-medium tabular-nums">{format(g.target)}{g.target.trim()?<span className="ml-xs text-body-small font-normal text-muted-foreground">{g.unit}</span>:null}</span>{g.baseline.trim()?<span className="text-body-small text-muted-foreground">{R.baseline} {format(g.baseline)} {g.unit}</span>:null}</div></TableCell>
        <TableCell className="text-body-small tabular-nums">{g.dueOn || "-"}</TableCell>
        <TableCell><span className="line-clamp-2 whitespace-normal text-body-small text-muted-foreground" title={g.criterion || undefined}>{g.criterion || "-"}</span></TableCell>
      </TableRow>)}</TableBody>
    </Table></div>}
    </CardContent></Card>
  </Section>;
}

// Related records are bounded summaries. The owning page carries full content.
export function StrategyDetailMarkets({ plan:p, actions }: { readonly plan:StrategyView; readonly actions?:(id:string)=>ReactNode }) {
  const { MARKET_STRATEGY_TEXT:T, STRATEGY_RESULT_TEXT:R, STRATEGY_TEXT:S, SEGMENT_FORM_TEXT:F, STRATEGY_DETAIL_TEXT:D }=useMessages();
  const rows=p.targetMarkets;
  return <Section id="target-markets" title={T.targetMarketsTitle} icon="target" help={D.relatedHelp}>
    {!rows?.length?<Card className="py-lg"><CardContent className="text-body-small text-muted-foreground">{rows===null?T.unknown:T.noPlanMarkets}</CardContent></Card>:<RelatedDisclosure count={rows.length} label={T.targetMarketsTitle}>{rows.map(m=>{
      const facts=[{label:F.industries,value:m.criteria.industries.join(" / ")},{label:F.regions,value:m.criteria.regions.join(" / ")},{label:R.sizes,value:m.criteria.sizes?.join(" / ")||R.unlimitedSize}].filter(f=>f.value);
      return <Card key={m.segmentId} className="min-w-0 gap-0 py-lg" data-strategy-target-market><CardContent className="flex min-w-0 flex-1 flex-col gap-md">
        <div className="flex min-w-0 items-start justify-between gap-sm"><Link href={`/segment?market=${encodeURIComponent(m.segmentId)}`} className="inline-flex min-w-0 items-start gap-sm text-body font-medium transition-colors hover:text-primary-text"><Icon name="globe" size="md" className="shrink-0 text-muted-foreground" aria-hidden="true"/><span className="line-clamp-2 break-words" title={m.marketName}>{m.marketName}</span></Link><div className="flex shrink-0 flex-col items-end gap-xs"><Tag tone={m.intent==="focus"?"success":"neutral"}>{m.intent==="focus"?T.focusMarket:m.intent==="validate"?T.validateMarket:T.unclassifiedMarket}</Tag>{m.status!=="active"?<Tag>{S.segmentStatusLabel[m.status]}</Tag>:null}</div></div>
        <dl className="flex min-w-0 flex-col gap-xs" data-strategy-market-facts>{facts.map(f=><div key={f.label} className={styles.referenceFact}><dt className="text-body-small text-muted-foreground">{f.label}</dt><dd className="truncate text-body-small" title={f.value}>{f.value}</dd></div>)}</dl>
        <p className="line-clamp-2 text-body-small text-muted-foreground" title={m.approach || undefined}>{m.approach || T.noMarketApproach}</p>
        <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-sm border-t border-dashed border-border pt-md"><span className="text-body-small text-muted-foreground">{T.customerCount}<span className="ml-sm tabular-nums text-foreground">{m.matched ?? T.unknown}</span></span>{actions?.(m.segmentId)}</div>
      </CardContent></Card>;
    })}</RelatedDisclosure>}
  </Section>;
}

function RelatedDisclosure({ count,label,children }: { readonly count:number; readonly label:string; readonly children:ReactNode }) {
  const { STRATEGY_DETAIL_TEXT:D }=useMessages();
  const entries=Children.toArray(children);
  return <Collapsible className="flex min-w-0 flex-col gap-md" data-related-disclosure>
    <div className={styles.relatedGrid} data-strategy-related-grid>{entries.slice(0,3)}</div>
    {count>3?<CollapsibleTrigger asChild><Button size="md" variant="ghost" className="group self-start text-body-small text-muted-foreground" aria-label={`${D.allRelated} ${label} ${count}`}><span className="group-data-[state=open]:hidden">{D.allRelated} {count}</span><span className="hidden group-data-[state=open]:inline">{D.collapse}</span><Icon name="chevron-down" size="sm" className="transition-transform group-data-[state=open]:rotate-180"/></Button></CollapsibleTrigger>:null}
    {count>3?<CollapsibleContent><div className={styles.relatedGrid} data-strategy-related-grid>{entries.slice(3)}</div></CollapsibleContent>:null}
  </Collapsible>;
}

export function StrategyDetailOfferings({ plan:p }: { readonly plan:StrategyView }) {
  const { MARKET_STRATEGY_TEXT:T, STRATEGY_RESULT_TEXT:R, STRATEGY_DETAIL_TEXT:D }=useMessages();
  const rows=strategyOfferings(p.solutions,p.products);
  return <Section id="primary-solutions" title={T.productSolutionsTitle} icon="squares-four" help={D.relatedHelp}>
    {!rows.length?<Card className="py-lg"><CardContent className="text-body-small text-muted-foreground">{p.solutions===null||p.products===null?T.unknown:T.noPlanSolutions}</CardContent></Card>:<>
      {p.solutions===null||p.products===null?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:null}
      <RelatedDisclosure count={rows.length} label={T.productSolutionsTitle}>{rows.map(row=>{
        const shared=(row.kind==="product"?p.sharedProducts:p.sharedSolutions)?.some(x=>x.id===row.id);
        const markets=p.targetMarkets?.filter(m=>(row.kind==="product"?m.products:m.solutions)?.some(x=>x.id===row.id));
        const scope=shared?T.sharedScope:markets?.length?markets.map(m=>m.marketName).join(" / "):p.targetMarkets===null?T.unknown:T.noPlanMarkets;
        return <Card key={row.key} className="min-w-0 gap-0 py-lg" data-strategy-offering={row.kind}><CardContent className="flex min-w-0 flex-1 flex-col gap-md">
          <Link href={row.href} className="inline-flex min-w-0 items-start gap-sm text-body font-medium transition-colors hover:text-primary-text"><Icon name={row.icon} size="md" className="shrink-0 text-muted-foreground" aria-hidden="true"/><span className="line-clamp-2 break-words" title={row.name}>{row.name}</span></Link>
          <div className="flex min-w-0 flex-wrap items-center gap-xs text-body-small text-muted-foreground"><span>{row.kind==="product"?T.productKind:T.solutionKind}</span>{row.novelty?<Tag>{R[row.novelty]}</Tag>:null}{row.status==="retired"?<Tag>{T.retiredSolution}</Tag>:null}</div>
          <span className="truncate text-body-small text-muted-foreground" title={row.code}>{row.code}</span>
          <div className="mt-auto border-t border-dashed border-border pt-md"><span className="text-body-small text-muted-foreground">{T.targetMarketsTitle}</span><p className="line-clamp-2 min-h-[2lh] break-words text-body-small" title={scope}>{scope}</p></div>
        </CardContent></Card>;
      })}</RelatedDisclosure>
    </>}
  </Section>;
}

export function StrategyDetailHandoff({ plan:p, rows, children }: { readonly plan:StrategyView; readonly rows:readonly FulfillmentRow[]|null; readonly children:ReactNode }) {
  const { MARKET_STRATEGY_TEXT:T, STRATEGY_HANDOFF_TEXT:H, STRATEGY_DETAIL_TEXT:D }=useMessages();
  const linked=[...new Map(rows?.map(r=>[r.revisionId,r]) ?? []).values()];
  return <Section title={T.handoff} icon="workflow" help={H.resultHelp}>
    <Card className="min-w-0 py-lg" data-strategy-handoff-card><CardContent className="flex min-w-0 flex-col gap-lg">
    <div className={styles.handoff}>
      <div className="flex min-w-0 flex-col gap-sm"><div className="flex items-center justify-between gap-md"><span className="text-body font-medium">{T.openPlanning}</span><Button asChild size="md" variant="ghost"><Link href="/planning">{D.viewPlanning}<Icon name="arrow-right" size="sm" aria-hidden="true"/></Link></Button></div>
        {linked.length?<div className="flex flex-wrap gap-sm">{linked.map(r=><Link key={r.revisionId} href={`/planning?year=${r.year}&revision=${r.revisionId}`} className="text-body-small text-muted-foreground transition-colors hover:text-primary-text">{r.year} / V{r.version}</Link>)}</div>:<p className="text-body-small text-muted-foreground">{rows===null?T.unknown:H.none}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-sm"><div className="flex items-center justify-between gap-md"><span className="text-body font-medium">{T.openCampaigns}<span className="ml-sm text-body-small font-normal tabular-nums text-muted-foreground">{p.campaigns?.length ?? "-"}</span></span><Button asChild size="md" variant="ghost"><Link href="/campaign">{D.viewCampaigns}<Icon name="arrow-right" size="sm" aria-hidden="true"/></Link></Button></div><p className="line-clamp-2 text-body-small text-muted-foreground" title={p.campaigns?.map(c=>c.name).join(" / ")}>{p.campaigns?.map(c=>c.name).join(" / ") || (p.campaigns===null?T.unknown:T.noCampaigns)}</p></div>
    </div>
    {rows?.length?<Collapsible className="flex flex-col gap-md"><CollapsibleTrigger asChild><Button size="md" variant="ghost" className="group self-start"><Icon name="chevron-down" size="sm" className="transition-transform group-data-[state=open]:rotate-180"/>{D.handoffDetails}</Button></CollapsibleTrigger><CollapsibleContent>{children}</CollapsibleContent></Collapsible>:null}
    </CardContent></Card>
  </Section>;
}
