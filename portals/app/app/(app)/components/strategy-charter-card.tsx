"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Card, CardContent, Icon, type IconName } from "@vxture/design-ui";
import { Tag } from "./tag";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { strategyPeriodLabel, strategyPeriodRangeLabel } from "../../domains/strategy/lib/plan-period";
import type { StrategyTheme } from "../../domains/strategy/lib/strategy-type";
import type { StrategyView } from "../lib/market-strategy";
import { strategyOfferings } from "../lib/strategy-offerings";
import styles from "./strategy-charter-card.module.css";

const looks: Record<StrategyTheme | "corporate", {icon: IconName; color: string}> = {
  focus:{icon:"target",color:"text-primary-text"},
  expand:{icon:"globe",color:"text-info-text"},
  innovate:{icon:"cube",color:"text-primary-text"},
  partner:{icon:"graph",color:"text-success-text"},
  diversify:{icon:"squares-four",color:"text-warning-text"},
  corporate:{icon:"flag",color:"text-primary-text"},
};

export function StrategyCharterCard({plan:p,actions,draftAvailable}: {
  readonly plan: StrategyView; readonly actions: ReactNode; readonly draftAvailable: boolean;
}) {
  const { STRATEGY_HANDOFF_TEXT:H, STRATEGY_RESULT_TEXT:R, MARKET_STRATEGY_TEXT:T, PLAN_STATUS_LABEL }=useMessages();
  const locale=useLocale();
  const theme=p.strategyType?.theme ?? "corporate";
  const look=looks[theme] ?? looks.corporate;
  const href=`/strategy/${p.id}`;
  const markets=p.targetMarkets?.toSorted((a,b)=>Number(b.intent==="focus")-Number(a.intent==="focus"));
  const offerings=p.solutions===null || p.products===null ? null : strategyOfferings(p.solutions,p.products);
  let versionBadge: ReactNode=null;
  if(p.versionNo)versionBadge=<Tag>{`V${p.versionNo}`}</Tag>;
  else if(p.basePlanId)versionBadge=<Tag>{T.revisionDraft}</Tag>;
  const goals=p.result?.goals.map(g=>({id:g.id,name:g.name,amount:g.target,unit:g.unit,metric:g.metric}))
    ?? p.expectations?.map(g=>({id:g.id,name:H[g.metric],amount:g.amount,unit:g.currency ?? H.count,metric:g.metric})) ?? [];
  const completedGoals=goals.filter(g=>g.amount.trim()!=="" && Number.isFinite(Number(g.amount)));
  const primaryGoal=completedGoals.find(g=>g.metric==="revenue") ?? completedGoals[0];
  const supportingGoals=completedGoals.filter(g=>g.id!==primaryGoal?.id);
  const value=p.resultOptions?.find(o=>o.id===p.result?.valuePropositionId)?.name;
  const metrics=[
    {key:"markets",icon:"globe",label:T.marketCount,value:p.marketIds?.length},
    {key:"customers",icon:"users",label:T.customerCount,value:p.customerCount},
    {key:"offerings",icon:"stack",label:T.solutionCount,value:offerings?.length},
    {key:"campaigns",icon:"megaphone",label:T.campaignCount,value:p.campaigns?.length},
  ] as const;
  const relation=(title:string,icon:IconName,rows:readonly {id:string;name:string;href:string;icon?:IconName}[] | null | undefined,empty:string)=>
    <div className="flex min-w-0 flex-col gap-sm">
      <span className="inline-flex items-center gap-xs text-body-small text-muted-foreground"><Icon name={icon} size="sm" aria-hidden="true"/>{title}</span>
      <div className="flex flex-wrap items-center gap-x-md gap-y-sm text-body">
        {rows?.slice(0,3).map(row=><Link key={`${row.icon ?? "market"}:${row.id}`} href={row.href} className="inline-flex min-w-0 max-w-full items-center gap-xs transition-colors hover:text-primary-text focus-visible:text-primary-text" title={row.name}>
          {row.icon ? <Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/>:null}<span className="min-w-0 truncate">{row.name}</span>
        </Link>)}
        {rows && rows.length>3 ? <Link href={href} className="text-body-small text-primary-text tabular-nums" title={rows.slice(3).map(r=>r.name).join(" / ")}>+{rows.length-3}</Link>:null}
        {!rows?.length ? <span className="text-body-small text-muted-foreground">{rows===null?T.unknown:empty}</span>:null}
      </div>
    </div>;
  return <Card className={`${styles.charter} ${look.color}`} surface="soft" data-strategy-card data-strategy-theme={theme}>
    <div className={styles.ambience} aria-hidden="true"/>
    <div className={styles.illustration} style={{maskImage:`url(/assets/strategy/${theme}.svg)`}} aria-hidden="true"/>
    <CardContent className={styles.content}>
      <div className={styles.heading} data-strategy-card-heading>
        <Icon name={look.icon} size="lg" className={styles.emblem} aria-hidden="true"/>
        <div className="flex min-w-0 flex-col gap-sm">
          <div className="flex flex-wrap items-center gap-sm" data-strategy-card-title>
            <h3 className="text-heading-1 leading-snug text-foreground"><Link href={href} className="break-words transition-colors hover:text-primary-text focus-visible:text-primary-text">{p.name}</Link></h3>
            <Tag><span title={p.strategyType?.description || undefined}>{p.strategyType?.name ?? T.typeUnclassified}</span></Tag>
            {versionBadge}
            <Tag tone={p.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[p.status]}</Tag>
            {draftAvailable ? <Tag>{T.draftAvailable}</Tag>:null}
          </div>
          <div className="flex flex-wrap items-center gap-x-lg gap-y-xs text-body-small text-muted-foreground" data-strategy-card-meta>
            <span>{p.planNo}</span>
            <span className="inline-flex items-center gap-xs tabular-nums" title={strategyPeriodRangeLabel(p.period) ?? undefined}><Icon name="calendar" size="sm" aria-hidden="true"/>{strategyPeriodLabel(p.period)}</span>
            <span className="inline-flex min-w-0 items-center gap-xs">{T.owner}<MemberName sub={p.ownerSub} name={p.publishedOwnerName} fallback={T.noOwner}/></span>
          </div>
        </div>
        <div className="text-foreground">{actions}</div>
      </div>
      <div className={styles.body} data-strategy-card-body>
        <div className={`${styles.relations} text-foreground`}>
          <div className="flex min-w-0 flex-col gap-sm" data-strategy-card-direction>
            <span className="inline-flex items-center gap-xs text-body-small text-muted-foreground"><Icon name="lightbulb" size="sm" aria-hidden="true"/>{T.strategyPosition}</span>
            <p className={`${styles.objective} text-body ${p.objective?"text-foreground":"text-muted-foreground"}`}>{p.objective || T.directionEmpty}</p>
            {value ? <span className="text-body-small text-muted-foreground">{R.value}<span className="ml-sm text-foreground">{value}</span></span>:null}
          </div>
          {relation(T.targetMarketsTitle,"target",markets?.map(m=>({id:m.segmentId,name:m.marketName,href:`/segment?market=${encodeURIComponent(m.segmentId)}`})),T.marketEmpty)}
          {relation(T.featuredSolutions,"squares-four",offerings,T.offeringEmpty)}
        </div>
        <div className={styles.outcome} data-strategy-expectation-summary>
          <span className="text-body-small text-muted-foreground">{primaryGoal?.name || T.expectedGoal}</span>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-sm gap-y-xs" data-strategy-primary-goal>
            <strong className={`${styles.goalNumber} tabular-nums ${primaryGoal?"":"text-muted-foreground"}`} title={primaryGoal ? `${Number(primaryGoal.amount).toLocaleString(locale)} ${primaryGoal.unit}`:undefined}>{primaryGoal ? Number(primaryGoal.amount).toLocaleString(locale,{notation:Math.abs(Number(primaryGoal.amount))>=100_000_000?"compact":"standard",maximumFractionDigits:2}):"\u2014"}</strong>
            {primaryGoal ? <span className="text-body-small text-muted-foreground">{primaryGoal.unit}</span>:null}
          </div>
          {supportingGoals.length ? <dl className="flex flex-wrap gap-x-lg gap-y-sm text-body-small text-muted-foreground">
            {supportingGoals.slice(0,2).map(g=><div key={g.id} className="inline-flex flex-wrap items-baseline gap-xs"><dt>{g.name}</dt><dd className="tabular-nums text-foreground">{Number(g.amount).toLocaleString(locale)}<span className="ml-xs text-muted-foreground">{g.unit}</span></dd></div>)}
          </dl>:null}
          {supportingGoals.length>2 ? <Link href={href} className="text-body-small hover:text-primary-text" title={supportingGoals.slice(2).map(g=>`${g.name} ${Number(g.amount).toLocaleString(locale)} ${g.unit}`).join(" / ")}>+{supportingGoals.length-2}</Link>:null}
        </div>
      </div>
      <div className={styles.footer}>
        <dl className={styles.metrics} data-strategy-metrics>
          {metrics.map(m=><div key={m.key} className="flex min-w-0 items-center gap-sm" data-strategy-metric>
            <Icon name={m.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/>
            <dt className="truncate text-body-small text-muted-foreground">{m.label}</dt>
            <dd className="text-heading-3 tabular-nums text-foreground">{m.value==null?<span title={T.unknown} aria-label={T.unknown}>&mdash;</span>:m.value.toLocaleString(locale)}</dd>
          </div>)}
        </dl>
        <Button asChild size="md" variant="ghost"><Link href={href}>{T.strategyOpen}<Icon name="arrow-right" size="sm" aria-hidden="true"/></Link></Button>
      </div>
    </CardContent>
  </Card>;
}
