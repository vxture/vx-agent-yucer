"use client";

import Link from "next/link";
import { StrategyInfoCard as Card, StrategyInfoContent as CardContent } from "./strategy-info-card";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@vxture/design-ui";
import { StrategyDetailLabel, StrategyQuantity } from "./strategy-detail-label";
import { Tag } from "./tag";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { strategyPeriodLabel, strategyPeriodRangeLabel } from "../../domains/strategy/lib/plan-period";
import type { StrategyTheme } from "../../domains/strategy/lib/strategy-type";
import type { StrategyView } from "../lib/market-strategy";
import { strategyOfferings } from "../lib/strategy-offerings";
import { StrategyReferenceSummary } from "./strategy-reference-summary";
import { StrategyAdoptionTag } from "./strategy-adoption-tag";
import type { StrategyAdoptionRead } from "../lib/strategy-adoption-read";
import styles from "./strategy-charter-card.module.css";

const looks: Record<StrategyTheme | "corporate", {icon: IconName; color: string}> = {
  focus:{icon:"target",color:"text-primary-text"},
  expand:{icon:"globe",color:"text-info-text"},
  innovate:{icon:"cube",color:"text-primary-text"},
  partner:{icon:"graph",color:"text-success-text"},
  diversify:{icon:"squares-four",color:"text-warning-text"},
  corporate:{icon:"flag",color:"text-primary-text"},
};

function StrategyIdentityTags({ plan:p, draftAvailable }: { readonly plan: StrategyView; readonly draftAvailable: boolean }) {
  const { STRATEGY_CARD_TEXT:C, STRATEGY_RESULT_TEXT:R, MARKET_STRATEGY_TEXT:T, PLAN_STATUS_LABEL }=useMessages();
  const valueProposition=p.resultOptions?.find(o=>o.kind==="value" && o.id===p.result?.valuePropositionId);
  const valueLabel=valueProposition?.name || (p.result?.valuePropositionId?C.valueUnavailable:C.valueUnspecified);
  let versionLabel="";
  if (p.versionNo) versionLabel=` V${p.versionNo}`;
  else if (p.basePlanId) versionLabel=` / ${T.revisionDraft}`;
  return <>
    <Tag><span className={!p.strategyType?"text-muted-foreground":undefined} title={`${T.strategyType}: ${p.strategyType?.description || p.strategyType?.name || T.typeUnclassified}`} data-strategy-type>{p.strategyType?.name || T.typeUnclassified}</span></Tag>
    <Tag className="min-w-0 max-w-full"><span className={`truncate ${valueProposition?"":"text-muted-foreground"}`} title={`${R.value}: ${valueLabel}`} data-strategy-value>{valueLabel}</span></Tag>
    <Tag tone={p.status==="active"?"success":"neutral"}>{PLAN_STATUS_LABEL[p.status]}{versionLabel}</Tag>
    {draftAvailable ? <Tag>{T.draftAvailable}</Tag>:null}
  </>;
}

function StrategyResourceSummary({ plan, currency }: { readonly plan: StrategyView; readonly currency: string }) {
  const { STRATEGY_CARD_TEXT:C, STRATEGY_RESULT_TEXT:R, MARKET_STRATEGY_TEXT:T }=useMessages();
  const locale=useLocale();
  const resources=[
    {key:"people",label:C.resourcePeople,unit:R.peopleUnit,icon:"users"},
    {key:"funds",label:C.resourceFunds,unit:currency,icon:"coins"},
    {key:"technology",label:C.resourceTechnology,unit:R.technologyUnit,icon:"cpu"},
  ] as const;
  return <section className={styles.resourceSection} aria-label={C.resourceTitle} data-strategy-resources>
    <StrategyDetailLabel>{C.resourceTitle}</StrategyDetailLabel>
    <dl className={styles.resources}>
      {resources.map(resource=>{
        const raw=plan.result?.resources[resource.key];
        const amount=raw?.trim() ? Number(raw) : Number.NaN;
        const hasAmount=Number.isFinite(amount);
        const note=plan.result?.resources[`${resource.key}Note`];
        return <div key={resource.key} className={styles.resource} title={note || undefined} data-strategy-resource={resource.key}>
          <dt className="text-body font-normal text-muted-foreground"><Icon name={resource.icon} size="sm" className={styles.resourceIcon} aria-hidden="true"/>{resource.label}</dt>
          <dd className={`min-w-0 text-body tabular-nums text-foreground ${hasAmount?"font-medium":"font-normal"}`}>{hasAmount?<StrategyQuantity value={amount.toLocaleString(locale,{maximumFractionDigits:2})} unit={resource.unit}/>:<span className="text-body-small font-normal text-muted-foreground">{T.resourceUnspecified}</span>}</dd>
        </div>;
      })}
    </dl>
  </section>;
}

export function StrategyCharterCard({plan:p,currency,actions,draftAvailable,adoption}: {
  readonly plan: StrategyView; readonly currency: string; readonly actions: ReactNode; readonly draftAvailable: boolean; readonly adoption: StrategyAdoptionRead;
}) {
  const { STRATEGY_CARD_TEXT:C, STRATEGY_HANDOFF_TEXT:H, STRATEGY_RESULT_TEXT:R, MARKET_STRATEGY_TEXT:T, STRATEGY_DETAIL_TEXT:D }=useMessages();
  const locale=useLocale();
  const theme=p.strategyType?.theme ?? "corporate";
  const look=looks[theme] ?? looks.corporate;
  const href=`/strategy/${p.id}`;
  const markets=p.targetMarkets?.toSorted((a,b)=>Number(b.intent==="focus")-Number(a.intent==="focus"));
  const offerings=p.solutions===null || p.products===null ? null : strategyOfferings(p.solutions,p.products);

  const goals=p.result?.goals.map(g=>({id:g.id,name:g.name,amount:g.target,unit:g.unit && g.unit!=="count"?g.unit:R.count,metric:g.metric}))
    ?? p.expectations?.map(g=>({id:g.id,name:H[g.metric],amount:g.amount,unit:g.currency ?? H.count,metric:g.metric})) ?? [];
  const completedGoals=goals.filter(g=>g.amount.trim()!=="" && Number.isFinite(Number(g.amount)));
  const goalMetrics=["revenue","channels","reference_cases"] as const;
  const orderedGoals=[...goalMetrics.flatMap(metric=>completedGoals.filter(g=>g.metric===metric)),...completedGoals.filter(g=>!g.metric)];
  const visibleGoalCount=orderedGoals.length>=4?4:3;
  const selectedGoals=orderedGoals.slice(0,visibleGoalCount);
  const displayGoals=[
    ...selectedGoals.map(goal=>({key:goal.id,name:goal.name,goal})),
    ...goalMetrics.filter(metric=>!selectedGoals.some(g=>g.metric===metric)).map(metric=>({key:metric,name:H[metric],goal:undefined})),
  ].slice(0,visibleGoalCount);
  const otherGoals=orderedGoals.slice(visibleGoalCount);
  const metrics=[
    {key:"customers",label:T.customerCount,unit:D.customerUnit,value:p.customerCount},
    {key:"campaigns",label:T.campaignCount,unit:D.campaignUnit,value:p.campaigns?.length},
  ] as const;
  return <Card variant="overview" className={`${styles.charter} ${look.color}`} surface="soft" data-strategy-card data-strategy-theme={theme}>
    <div className={styles.ambience} aria-hidden="true"/>
    <div className={styles.illustration} style={{maskImage:`url(/assets/strategy/${theme}.svg)`}} aria-hidden="true"/>
    <CardContent className={styles.content}>
      <div className={styles.heading} data-strategy-card-heading>
        <Icon name={look.icon} size="lg" className={styles.emblem} aria-hidden="true"/>
        <div className="flex min-w-0 flex-col gap-sm">
          <div className="flex flex-wrap items-center gap-sm" data-strategy-card-title>
            <h3 className="text-heading-1 leading-snug text-foreground"><Link href={href} className="break-words transition-colors hover:text-primary-text focus-visible:text-primary-text">{p.name}</Link></h3>
            <StrategyIdentityTags plan={p} draftAvailable={draftAvailable}/>
          </div>
          <div className="flex flex-wrap items-center gap-x-lg gap-y-xs text-body-small text-muted-foreground" data-strategy-card-meta>
            <span className="inline-flex items-center gap-xs" title={p.previousNumbers?.length ? `${T.previousNumbers}: ${p.previousNumbers.join(" / ")}` : undefined}><Icon name="file-text" size="sm" aria-hidden="true"/>{p.planNo}</span>
            <span className="inline-flex items-center gap-xs tabular-nums" title={strategyPeriodRangeLabel(p.period) ?? undefined}><Icon name="calendar" size="sm" aria-hidden="true"/>{strategyPeriodLabel(p.period)}</span>
          </div>
        </div>
        <div className={styles.headingActions}>
          <div className={`${styles.owner} text-body-small text-muted-foreground`} aria-label={T.owner} data-strategy-card-owner>
            <MemberName sub={p.ownerSub} name={p.publishedOwnerName} fallback={T.noOwner}/>
          </div>
          <StrategyAdoptionTag plan={p} adoption={adoption}/>
          <div className="shrink-0 text-foreground">{actions}</div>
        </div>
      </div>
      <div className={styles.body} data-strategy-card-body>
        <div className={`${styles.relations} text-foreground`}>
          <div className={styles.relation} data-strategy-card-direction>
            <StrategyDetailLabel>{T.strategyPosition}</StrategyDetailLabel>
            <div className={styles.directionValue}>
              <Icon name="lightbulb" size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/>
              <p title={p.objective || undefined} className={`${styles.objective} ${styles.referenceText} ${p.objective?"text-foreground":"text-muted-foreground"}`}>{p.objective || T.directionEmpty}</p>
            </div>
          </div>
          <div className={styles.relation} data-strategy-card-relation="markets">
            <StrategyDetailLabel>{T.targetMarketsTitle}</StrategyDetailLabel>
            {markets?.length ? <StrategyReferenceSummary kind="markets" label={C.segments} href={href} rows={markets.map(m=>({id:m.segmentId,name:m.marketName,icon:"globe",href:`/segment/${encodeURIComponent(m.segmentId)}`}))}/>
              : <span className="text-muted-foreground">{markets===null?T.unknown:T.marketEmpty}</span>}
          </div>
          <div className={styles.relation} data-strategy-card-relation="offerings">
            <StrategyDetailLabel>{T.productSolutionsTitle}</StrategyDetailLabel>
            {offerings?.length ? <StrategyReferenceSummary kind="offerings" label={T.productSolutionsTitle} href={href} rows={offerings.map(row=>({...row,id:row.key}))}/>
              : <span className="text-muted-foreground">{offerings===null?T.unknown:T.offeringEmpty}</span>}
          </div>
        </div>
        <div className={styles.outcome} data-strategy-expectation-summary>
          <dl className={styles.goals}>
            {displayGoals.map(({key,name,goal})=><div key={key} className={styles.goal} data-strategy-goal={goal?.metric ?? key}>
              <dt title={goal?.metric ? H[goal.metric] : goal?.name || name}><StrategyDetailLabel>{goal?.metric ? H[goal.metric] : goal?.name || name}</StrategyDetailLabel></dt>
              <dd className="flex min-w-0 flex-wrap items-baseline gap-x-sm gap-y-xs">
                <strong className={`${styles.goalNumber} tabular-nums ${goal?"":"text-muted-foreground"}`} title={goal ? `${Number(goal.amount).toLocaleString(locale)} ${goal.unit}`:undefined}>{goal ? Number(goal.amount).toLocaleString(locale,{notation:Math.abs(Number(goal.amount))>=100_000_000?"compact":"standard",maximumFractionDigits:2}):"\u2014"}</strong>
                {goal ? <span className="text-body-small text-muted-foreground">{goal.unit}</span>:null}
              </dd>
            </div>)}
          </dl>
          {otherGoals.length ? <Link href={href} className="text-body-small text-muted-foreground hover:text-primary-text" title={otherGoals.map(g=>`${g.name} ${Number(g.amount).toLocaleString(locale)} ${g.unit}`).join(" / ")}>+{otherGoals.length} {R.goals}</Link>:null}
        </div>
      </div>
      <div className={styles.footer} data-strategy-support>
        <StrategyResourceSummary plan={p} currency={currency}/>
        <dl className={styles.metrics} data-strategy-metrics>
          {metrics.map(m=><div key={m.key} className={styles.metric} data-strategy-metric>
            <dt className="truncate text-body text-muted-foreground">{m.label}</dt>
            <dd className="text-body font-medium tabular-nums text-foreground">{m.value==null?<span title={T.unknown} aria-label={T.unknown}>&mdash;</span>:<StrategyQuantity value={m.value.toLocaleString(locale)} unit={m.unit}/>}</dd>
          </div>)}
        </dl>
      </div>
    </CardContent>
  </Card>;
}
