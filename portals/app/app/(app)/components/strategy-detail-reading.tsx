"use client";

import Link from "next/link";
import { StrategyInfoCard as Card, StrategyInfoContent as CardContent } from "./strategy-info-card";
import { Children, type ReactNode, type ComponentProps } from "react";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@vxture/design-ui";
import { Section } from "./help-section";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { strategyPeriodRangeLabel } from "../../domains/strategy/lib/plan-period";
import { strategyOfferings } from "../lib/strategy-offerings";
import type { StrategyView } from "../lib/market-strategy";
import type { FulfillmentRow } from "../lib/strategy-fulfillment";
import { StrategyDetailLabel, StrategyQuantity } from "./strategy-detail-label";
import { Tag } from "./tag";
import { StrategyPreviewCard } from "./strategy-preview-card";
import layout from "./strategy-info-card.module.css";
import styles from "./strategy-detail-reading.module.css";

export function StrategyDetailBasic({ plan:p }: { readonly plan:StrategyView }) {
  const { MARKET_STRATEGY_TEXT:T, STRATEGY_RESULT_TEXT:R, STRATEGY_TEXT:S }=useMessages();
  const locale=useLocale();
  const facts=[
    {label:R.period,icon:"calendar",value:strategyPeriodRangeLabel(p.period) ?? T.periodNeedsDates},
    {label:S.newPlanOwner,icon:"user-circle",value:<MemberName sub={p.ownerSub} name={p.publishedOwnerName} fallback={T.noOwner}/>},
    {label:T.publishedAt,icon:"clock",value:<span className="tabular-nums">{p.approvedAt?new Date(p.approvedAt).toLocaleDateString(locale):"-"}</span>},
    {label:T.strategyType,icon:"tree-structure",value:p.strategyType?.name ?? T.typeUnclassified},
    {label:R.value,icon:"seal-check",value:p.resultOptions?.find(o=>o.id===p.result?.valuePropositionId)?.name ?? "-"},
    {label:R.paths,icon:"git-branch",value:p.resultOptions?.filter(o=>o.kind==="path" && p.result?.pathIds.includes(o.id)).map(o=>o.name).join(" / ") || "-"},
  ] satisfies {label:string;icon?:ComponentProps<typeof Icon>["name"];value:ReactNode}[];
  return <Card className="min-w-0" aria-label={R.basic} data-strategy-basic-card data-strategy-basic-section><CardContent>
        <dl className={styles.facts} data-strategy-basic-facts>{facts.map(f=><div key={f.label} className={styles.fieldRow}><dt><StrategyDetailLabel icon={"icon" in f ? f.icon : undefined}>{f.label}</StrategyDetailLabel></dt><dd className="min-w-0 break-words text-body">{f.value}</dd></div>)}</dl>
        <div className={styles.position} data-strategy-detail-direction><StrategyDetailLabel icon="lightbulb">{T.strategyPosition}</StrategyDetailLabel><p className="whitespace-pre-wrap break-words text-body">{p.objective || T.directionEmpty}</p></div>
        {p.changeReason?<div className={styles.position}><StrategyDetailLabel icon="file-text">{T.changeReason}</StrategyDetailLabel><p className="whitespace-pre-wrap break-words text-body">{p.changeReason}</p></div>:null}
  </CardContent></Card>;
}

export function StrategyDetailGoals({ plan:p }: { readonly plan:StrategyView }) {
  const { STRATEGY_RESULT_TEXT:R, STRATEGY_HANDOFF_TEXT:H, STRATEGY_DETAIL_TEXT:D }=useMessages();
  const locale=useLocale();
  const goals=p.result?.goals.map(g=>({id:g.id,name:g.name,baseline:g.baseline,target:g.target,unit:g.unit && g.unit!=="count"?g.unit:R.count,dueOn:g.dueOn,criterion:g.criterion}))
    ?? p.expectations?.map(g=>({id:g.id,name:H[g.metric],baseline:"",target:g.amount,unit:g.currency ?? H.count,dueOn:"",criterion:g.criterion})) ?? [];
  const format=(v:string)=>v.trim() && Number.isFinite(Number(v))?Number(v).toLocaleString(locale,{maximumFractionDigits:2}):"-";
  return <Section title={R.goals} icon="chart-line-up" help={R.fullHelp}>
    <Card className="min-w-0" data-strategy-goals-card><CardContent>
    {!goals.length?<p className="text-body-small text-muted-foreground">{D.emptyGoals}</p>:<div className={styles.goalTable} data-strategy-detail-goals><Table>
      <colgroup><col className={styles.indexColumn}/><col className={styles.goalNameColumn}/><col className={styles.goalValueColumn}/><col className={styles.goalDateColumn}/><col/></colgroup>
      <TableHeader><TableRow><TableHead aria-label={D.order}/><TableHead>{R.name}</TableHead><TableHead>{R.target}</TableHead><TableHead>{R.dueOn}</TableHead><TableHead>{R.criterion}</TableHead></TableRow></TableHeader>
      <TableBody>{goals.map((g,i)=><TableRow key={g.id}>
        <TableCell className="text-center tabular-nums text-muted-foreground">{i+1}</TableCell>
        <TableCell><span className="line-clamp-2 text-body" title={g.name}>{g.name || R.untitled}</span></TableCell>
        <TableCell><div className="flex min-w-0 flex-wrap items-baseline gap-x-md gap-y-xs"><span className="text-body font-medium tabular-nums">{format(g.target)}{g.target.trim()?<span className="ml-xs text-body-small font-normal text-muted-foreground">{g.unit}</span>:null}</span>{g.baseline.trim()?<span className="text-body-small text-muted-foreground">{R.baseline} {format(g.baseline)} {g.unit}</span>:null}</div></TableCell>
        <TableCell className="text-body tabular-nums">{g.dueOn || "-"}</TableCell>
        <TableCell><span className="line-clamp-2 whitespace-normal text-body text-muted-foreground" title={g.criterion || undefined}>{g.criterion || "-"}</span></TableCell>
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
    {!rows?.length?<Card><CardContent className="text-body text-muted-foreground">{rows===null?T.unknown:T.noPlanMarkets}</CardContent></Card>:<RelatedDisclosure count={rows.length} label={T.targetMarketsTitle}>{rows.map(m=>{
      const facts=[{label:F.industries,value:m.criteria.industries.join(" / ")},{label:F.regions,value:m.criteria.regions.join(" / ")},{label:R.sizes,value:m.criteria.sizes?.join(" / ")||R.unlimitedSize}].filter(f=>f.value);
      const context=[{label:T.marketApproach,value:m.approach},{label:F.customerNeed,value:m.criteria.customerNeed},{label:F.buyingScenario,value:m.criteria.buyingScenario},{label:F.expectedOutcome,value:m.criteria.expectedOutcome},{label:F.entryBarrier,value:m.criteria.entryBarrier}].filter(f=>f.value);
      const offerings=strategyOfferings(m.solutions,m.products);
      const detail=<>
        <div className="flex flex-wrap gap-xs"><Tag tone={m.intent==="focus"?"success":"neutral"}>{marketIntentLabel(m.intent, T)}</Tag>{m.status!=="active"?<Tag>{S.segmentStatusLabel[m.status]}</Tag>:null}</div>
        <dl className={styles.previewFacts}>
          {[...facts,...context,{label:T.customerCount,value:<StrategyQuantity value={m.matched ?? T.unknown} unit={m.matched==null?undefined:D.customerUnit}/>}].map(f=><div key={f.label} className={styles.previewFact}><dt><StrategyDetailLabel>{f.label}</StrategyDetailLabel></dt><dd>{f.value}</dd></div>)}
        </dl>
        <div className="flex flex-col gap-sm border-t border-dashed border-border pt-md"><StrategyDetailLabel>{T.productSolutionsTitle}</StrategyDetailLabel><div className={styles.previewLinks}>
          {offerings.map(row=><Link key={row.key} href={row.href} className="transition-colors hover:text-primary-text"><Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground"/><span>{row.name}</span></Link>)}
          {!offerings.length?<p className="text-muted-foreground">{m.products===null||m.solutions===null?T.unknown:T.noPlanSolutions}</p>:null}
        </div></div>
      </>;
      return <StrategyPreviewCard key={m.segmentId} title={m.marketName} detail={detail} className="min-w-0 gap-0" data-strategy-target-market><CardContent className="flex-1">
        <div className="flex min-w-0 items-start justify-between gap-sm"><Link href={`/segment/${encodeURIComponent(m.segmentId)}`} className="inline-flex min-w-0 items-start gap-sm text-body font-medium no-underline transition-colors hover:text-primary-text hover:no-underline"><Icon name="globe" size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/><span className="line-clamp-2 break-words">{m.marketName}</span></Link><div className="flex shrink-0 flex-col items-end gap-xs"><Tag tone={m.intent==="focus"?"success":"neutral"}>{marketIntentLabel(m.intent, T)}</Tag>{m.status!=="active"?<Tag>{S.segmentStatusLabel[m.status]}</Tag>:null}</div></div>
        <dl className={layout.rows} data-strategy-market-facts>{facts.map(f=><div key={f.label} className={styles.referenceFact}><dt><StrategyDetailLabel>{f.label}</StrategyDetailLabel></dt><dd className="line-clamp-2 break-words text-body">{f.value}</dd></div>)}</dl>
        {context.slice(0,2).map(f=><div key={f.label} className={styles.referenceFact}><StrategyDetailLabel>{f.label}</StrategyDetailLabel><p className="line-clamp-2 min-w-0 whitespace-pre-wrap break-words text-body text-muted-foreground">{f.value}</p></div>)}
        <div className={`mt-auto flex min-w-0 flex-wrap items-center justify-between gap-sm ${layout.divider}`}><span className="inline-flex items-center gap-xs"><StrategyDetailLabel>{T.customerCount}</StrategyDetailLabel><StrategyQuantity value={m.matched ?? T.unknown} unit={m.matched==null?undefined:D.customerUnit}/></span><span data-preview-actions>{actions?.(m.segmentId)}</span></div>
      </CardContent></StrategyPreviewCard>;
    })}</RelatedDisclosure>}
  </Section>;
}

function RelatedDisclosure({ count,label,children }: { readonly count:number; readonly label:string; readonly children:ReactNode }) {
  const { STRATEGY_DETAIL_TEXT:D }=useMessages();
  const entries=Children.toArray(children);
  return <Collapsible className="flex min-w-0 flex-col gap-md" data-related-disclosure>
    <div className={styles.relatedGrid} data-strategy-related-grid>{entries.slice(0,3)}</div>
    {count>3?<CollapsibleTrigger asChild><Button size="md" variant="ghost" className="group self-start text-body-small text-muted-foreground" aria-label={`${D.allRelated} ${label} ${count}`}><span className="group-data-[state=open]:hidden">{D.allRelated} <StrategyQuantity value={count} unit={D.recordUnit}/></span><span className="hidden group-data-[state=open]:inline">{D.collapse}</span><Icon name="chevron-down" size="sm" className="transition-transform group-data-[state=open]:rotate-180"/></Button></CollapsibleTrigger>:null}
    {count>3?<CollapsibleContent><div className={styles.relatedGrid} data-strategy-related-grid>{entries.slice(3)}</div></CollapsibleContent>:null}
  </Collapsible>;
}

export function StrategyDetailOfferings({ plan:p }: { readonly plan:StrategyView }) {
  const { MARKET_STRATEGY_TEXT:T, STRATEGY_RESULT_TEXT:R, STRATEGY_DETAIL_TEXT:D }=useMessages();
  const rows=strategyOfferings(p.solutions,p.products);
  return <Section id="primary-solutions" title={T.productSolutionsTitle} icon="squares-four" help={D.relatedHelp}>
    {!rows.length?<Card><CardContent className="text-body-small text-muted-foreground">{p.solutions===null||p.products===null?T.unknown:T.noPlanSolutions}</CardContent></Card>:<>
      {p.solutions===null||p.products===null?<p className="text-body-small text-muted-foreground">{T.unknown}</p>:null}
      <RelatedDisclosure count={rows.length} label={T.productSolutionsTitle}>{rows.map(row=>{
        const shared=(row.kind==="product"?p.sharedProducts:p.sharedSolutions)?.some(x=>x.id===row.id);
        const markets=p.targetMarkets?.filter(m=>(row.kind==="product"?m.products:m.solutions)?.some(x=>x.id===row.id));
        const scope=offeringScope(shared, markets, p.targetMarkets === null, T);
        const titleLink=<Link href={row.href} className="inline-flex min-w-0 items-start gap-sm text-body font-medium no-underline transition-colors hover:text-primary-text hover:no-underline"><Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/><span className="line-clamp-2 break-words">{row.name}</span></Link>;
        const detail=<>
          {row.status==="retired"?<Tag>{T.retiredSolution}</Tag>:null}
          <dl className={styles.previewFacts}>
            <div className={styles.previewFact}><dt><StrategyDetailLabel icon={row.icon}>{row.kind==="product"?T.productKind:T.solutionKind}</StrategyDetailLabel></dt><dd>{row.code}</dd></div>
            {row.novelty?<div className={styles.previewFact}><dt><StrategyDetailLabel>{R.offeringAttribute}</StrategyDetailLabel></dt><dd>{R[row.novelty]}</dd></div>:null}
            <div className={styles.previewFact}><dt><StrategyDetailLabel>{T.targetMarketsTitle}</StrategyDetailLabel></dt><dd className={styles.previewLinks}>{shared?<span>{T.sharedScope}</span>:null}{markets?.length?markets.map(m=><Link key={m.segmentId} href={`/segment/${encodeURIComponent(m.segmentId)}`} className="transition-colors hover:text-primary-text"><Icon name="globe" size="sm" className="shrink-0 text-muted-foreground"/><span>{m.marketName}</span></Link>):!shared?scope:null}</dd></div>
          </dl>
        </>;
        return <StrategyPreviewCard key={row.key} title={row.name} detail={detail} className="min-w-0 gap-0" data-strategy-offering={row.kind}><CardContent className="flex-1">
          {titleLink}
          <div className="flex min-w-0 flex-wrap items-center gap-x-sm gap-y-xs text-body-small text-muted-foreground"><span>{row.kind==="product"?T.productKind:T.solutionKind}</span>{row.novelty?<Tag>{R[row.novelty]}</Tag>:null}{row.status==="retired"?<Tag>{T.retiredSolution}</Tag>:null}<span className="min-w-0 truncate">{row.code}</span></div>
          <div className={`mt-auto ${layout.divider}`}><div className={styles.fieldRow}><StrategyDetailLabel>{T.targetMarketsTitle}</StrategyDetailLabel><p className="line-clamp-2 min-w-0 break-words text-body">{scope}</p></div></div>
        </CardContent></StrategyPreviewCard>;
      })}</RelatedDisclosure>
    </>}
  </Section>;
}

export function StrategyDetailHandoff({ plan:p, rows, children }: { readonly plan:StrategyView; readonly rows:readonly FulfillmentRow[]|null; readonly children:ReactNode }) {
  const { MARKET_STRATEGY_TEXT:T, STRATEGY_HANDOFF_TEXT:H, STRATEGY_DETAIL_TEXT:D }=useMessages();
  const linked=[...new Map(rows?.map(r=>[r.revisionId,r]) ?? []).values()];
  return <Section title={T.handoff} icon="workflow" help={H.resultHelp}>
    <div className={styles.handoff} data-strategy-handoff>
      <Card className="min-w-0" data-strategy-handoff-card="planning"><CardContent>
      <div className={styles.handoffRow}>
        <StrategyDetailLabel icon="chart-bar">{T.openPlanning}</StrategyDetailLabel>
        {linked.length?<div className="flex min-w-0 flex-wrap gap-sm">{linked.map(r=><Link key={r.revisionId} href={`/planning?year=${r.year}&revision=${r.revisionId}`} className="text-body transition-colors hover:text-primary-text">{r.year} / V{r.version}</Link>)}</div>:<p className="text-body">{rows===null?T.unknown:H.none}</p>}
        <Button asChild size="md" variant="ghost"><Link href="/planning">{D.viewPlanning}<Icon name="arrow-right" size="sm" aria-hidden="true"/></Link></Button>
      </div>
    {rows?.length?<Collapsible className="flex flex-col gap-md"><CollapsibleTrigger asChild><Button size="md" variant="ghost" className="group self-start"><Icon name="chevron-down" size="sm" className="transition-transform group-data-[state=open]:rotate-180"/>{D.handoffDetails}</Button></CollapsibleTrigger><CollapsibleContent>{children}</CollapsibleContent></Collapsible>:null}
      </CardContent></Card>
      <Card className="min-w-0" data-strategy-handoff-card="campaign"><CardContent>
      <div className={styles.handoffRow}>
        <StrategyDetailLabel icon="ticket">{T.openCampaigns}</StrategyDetailLabel>
        <div className="flex min-w-0 items-start gap-sm text-body"><span className="shrink-0"><StrategyQuantity value={p.campaigns?.length ?? "-"} unit={p.campaigns===null?undefined:D.campaignUnit}/></span><p className="line-clamp-2 min-w-0" title={p.campaigns?.map(c=>c.name).join(" / ")}>{p.campaigns?.map(c=>c.name).join(" / ") || (p.campaigns===null?T.unknown:T.noCampaigns)}</p></div>
        <Button asChild size="md" variant="ghost"><Link href="/campaign">{D.viewCampaigns}<Icon name="arrow-right" size="sm" aria-hidden="true"/></Link></Button>
      </div>
      </CardContent></Card>
    </div>
  </Section>;
}

function marketIntentLabel(intent: string | null, text: { focusMarket: string; validateMarket: string; unclassifiedMarket: string }) {
  if (intent === "focus") return text.focusMarket;
  if (intent === "validate") return text.validateMarket;
  return text.unclassifiedMarket;
}
function offeringScope(shared: boolean | undefined, markets: readonly { marketName: string }[] | undefined, unknown: boolean, text: { sharedScope: string; unknown: string; noPlanMarkets: string }) {
  if (shared) return text.sharedScope;
  if (markets?.length) return markets.map(m => m.marketName).join(" / ");
  return unknown ? text.unknown : text.noPlanMarkets;
}
