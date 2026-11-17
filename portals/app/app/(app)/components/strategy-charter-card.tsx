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
  const { MARKET_STRATEGY_TEXT:T, PLAN_STATUS_LABEL }=useMessages();
  const locale=useLocale();
  const theme=p.strategyType?.theme ?? "corporate";
  const look=looks[theme] ?? looks.corporate;
  const href=`/strategy/${p.id}`;
  const markets=p.targetMarkets?.toSorted((a,b)=>Number(b.intent==="focus")-Number(a.intent==="focus"));
  const offerings=p.solutions===null || p.products===null ? null : strategyOfferings(p.solutions,p.products);
  let versionBadge: ReactNode=null;
  if(p.versionNo)versionBadge=<Tag>{`V${p.versionNo}`}</Tag>;
  else if(p.basePlanId)versionBadge=<Tag>{T.revisionDraft}</Tag>;
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
      <div className="flex flex-wrap items-center justify-between gap-sm" data-strategy-card-heading>
        <div className="flex flex-wrap items-center gap-sm">
          <span className="inline-flex items-center gap-sm text-body-small font-medium" title={p.strategyType?.description || undefined}><Icon name={look.icon} size="lg" aria-hidden="true"/>{p.strategyType?.name ?? T.typeUnclassified}</span>
          <span className="text-body-small text-muted-foreground tabular-nums" title={strategyPeriodRangeLabel(p.period) ?? undefined}>{strategyPeriodLabel(p.period)}</span>
        </div>
        <div className="flex items-center gap-sm text-foreground">
          {versionBadge}
          <Tag tone={p.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[p.status]}</Tag>
          {actions}
        </div>
      </div>
      <div className={styles.body} data-strategy-card-body>
        <div className="flex min-w-0 flex-col gap-lg text-foreground">
          <h3 className="text-heading-1 leading-snug"><Link href={href} className="break-words transition-colors hover:text-primary-text focus-visible:text-primary-text">{p.name}</Link></h3>
          <div className="flex min-w-0 flex-col gap-sm" data-strategy-card-direction>
            <span className="text-body-small text-muted-foreground">{T.strategyPosition}</span>
            <p className={`${styles.objective} text-heading-3 ${p.objective?"text-foreground":"text-muted-foreground"}`}>{p.objective || T.directionEmpty}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-lg gap-y-xs text-body-small text-muted-foreground">
            <span>{p.planNo}</span>
            <span className="inline-flex items-center gap-xs">{T.owner}<MemberName sub={p.ownerSub} name={p.publishedOwnerName} fallback={T.noOwner}/></span>
            {draftAvailable ? <span>{T.draftAvailable}</span>:null}
          </div>
        </div>
        <div className={`${styles.relations} text-foreground`}>
          {relation(T.targetMarketsTitle,"target",markets?.map(m=>({id:m.segmentId,name:m.marketName,href:`/strategy?view=markets&market=${encodeURIComponent(m.segmentId)}`})),T.marketEmpty)}
          {relation(T.featuredSolutions,"squares-four",offerings,T.offeringEmpty)}
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
