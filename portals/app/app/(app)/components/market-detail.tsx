"use client";

import Link from "next/link";
import links from "./business-reference.module.css";
import { StrategyInfoCard as Card, StrategyInfoContent as CardContent } from "./strategy-info-card";
import type { ReactNode } from "react";
import { Icon, ViewLayout, type IconName } from "@vxture/design-ui";
import type { MarketStrategyReference, MarketView } from "../lib/market-strategy";
import { strategyOfferings } from "../lib/strategy-offerings";
import { strategyPeriodLabel, strategyPeriodRangeLabel } from "../../domains/strategy/lib/plan-period";
import { MemberName } from "../lib/member-names";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { ViewHeader } from "./business-controls";
import { PageCrumbs } from "./page-crumbs";
import { PageActionButton } from "./page-header-actions";
import { Section } from "./help-section";
import { StrategyDetailLabel, StrategyQuantity } from "./strategy-detail-label";
import { MarketCustomers } from "./market-customers";
import { Tag } from "./tag";
import layout from "./strategy-info-card.module.css";
import styles from "./market-detail.module.css";

/** The segment owns its definition. Related records stay bounded references. */
export function MarketDetail({ market, canWrite, at }: {
  readonly market: MarketView; readonly canWrite: boolean; readonly at: string;
}) {
  const { MARKET_STRATEGY_TEXT: T, SEGMENT_FORM_TEXT: F, SEGMENT_DETAIL_TEXT: D, STRATEGY_RESULT_TEXT: R, STRATEGY_HANDOFF_TEXT: H, STRATEGY_TEXT: S, PLAN_STATUS_LABEL } = useMessages();
  const locale = useLocale();
  const defined = [...market.criteria.industries, ...market.criteria.regions, ...(market.criteria.sizes ?? [])].length > 0;
  const conditions = [
    { label: F.industries, icon: "buildings", value: market.criteria.industries },
    { label: F.sizes, icon: "users", value: market.criteria.sizes ?? [] },
    { label: T.region, icon: "globe", value: market.criteria.regions },
  ] satisfies { label: string; icon: IconName; value: readonly string[] }[];
  const insights = [
    { key: "customerNeed", icon: "lightbulb" },
    { key: "buyingScenario", icon: "ticket" },
    { key: "expectedOutcome", icon: "chart-line-up" },
    { key: "entryBarrier", icon: "shield-check" },
  ] as const;
  const offerings = strategyOfferings(market.defaultSolutions, market.defaultProducts);
  const needSummary = market.criteria.needSummary?.trim();
  const insightRows = insights.filter(row => market.criteria[row.key]?.trim());
  const goalLabel = (goal: MarketStrategyReference["goals"][number]) => goal.name && goal.name !== goal.metric ? goal.name : goal.metric ? H[goal.metric] : R.goals;
  return <ViewLayout className="@container" data-market-detail>
    <PageCrumbs trail={[{ label: T.markets, href: "/segment" }]} current={market.name} />
    <ViewHeader icon="chart-pie-slice" title={market.name} description={market.segmentCode}
      secondary={<Tag tone={market.status === "active" ? "success" : "neutral"}>{S.segmentStatusLabel[market.status]}</Tag>}
      help={D.help} divider={false}
      pageActions={{ primary: canWrite ? <PageActionButton asChild><Link href={`/segment/new?id=${encodeURIComponent(market.id)}`}><Icon name="edit" size="sm" aria-hidden="true" />{T.editMarket}</Link></PageActionButton> : undefined }} />
    <Section title={F.conditions} icon="filter" help={<><p>{F.conditionRule}</p><p>{F.noConditions}</p></>}>
      <Card className="min-w-0"><CardContent>
        <dl className={styles.conditions}>{conditions.map(row => <div key={row.label} className={styles.field}>
          <dt><StrategyDetailLabel icon={row.icon}>{row.label}</StrategyDetailLabel></dt>
          <dd className="min-w-0 break-words text-body">{row.value.join(" / ") || (defined ? T.unlimited : T.undefined)}</dd>
        </div>)}</dl>
      </CardContent></Card>
    </Section>
    {needSummary || insightRows.length ? <Section title={F.insights} icon="lightbulb" help={<><p>{F.help.needSummary}</p><p>{T.marketInsightHint}</p><p>{T.qualitativeHint}</p></>}>
      <Card className="min-w-0"><CardContent>
        <dl className={styles.insights}>
          <div className={`${styles.insight} col-span-full`} data-market-detail-summary>
            <dt><StrategyDetailLabel icon="clipboard">{F.needSummary}</StrategyDetailLabel></dt>
            <dd className={`min-w-0 break-words text-body ${needSummary ? "" : "text-muted-foreground"}`}>{needSummary || T.notProvided}</dd>
          </div>
          {insightRows.map(row => <div key={row.key} className={styles.insight}>
          <dt><StrategyDetailLabel icon={row.icon}>{F[row.key]}</StrategyDetailLabel></dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-body">{market.criteria[row.key]}</dd>
        </div>)}</dl>
      </CardContent></Card>
    </Section> : null}
    <Section title={T.productSolutionsTitle} icon="squares-four" help={T.marketDefaultSolutionsHint}>
      {offerings.length ? <div className={styles.references} data-market-detail-offerings>{offerings.map(row => <Card variant="reference" key={row.key} className="min-w-0">
        <CardContent>
          <Link href={row.href} className={`${links.link} flex min-w-0 items-start gap-sm text-body font-medium`} title={row.name}>
            <Icon name={row.icon} size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="line-clamp-2 min-w-0 break-words">{row.name}</span>
            <Icon name="arrow-right" size="sm" className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
          <p className="line-clamp-1 min-w-0 text-body-small text-muted-foreground" title={row.code}>{row.code}</p>
          <div className={`mt-auto flex flex-wrap items-center gap-sm text-body-small text-muted-foreground ${layout.divider}`}>
            <span>{row.kind === "product" ? T.productKind : T.solutionKind}</span>
            {row.novelty ? <Tag>{R[row.novelty]}</Tag> : null}
            {row.status === "retired" ? <Tag>{T.retiredSolution}</Tag> : null}
          </div>
        </CardContent>
      </Card>)}</div> : market.defaultSolutions != null && market.defaultProducts != null ? <DetailEmpty>{T.noPlanSolutions}</DetailEmpty> : null}
      {market.defaultSolutions == null || market.defaultProducts == null ? <DetailEmpty>{T.unknown}</DetailEmpty> : null}
    </Section>
    <Section title={D.strategies} icon="flag" help={D.strategyHelp}>
      {market.plans?.length ? <div className={styles.references} data-market-detail-strategies>{market.plans.map(plan => <Card variant="reference" key={plan.id} className="min-w-0"><CardContent className={layout.rows}>
        <div className="flex min-w-0 items-center gap-sm" data-market-strategy-heading>
          <Link href={`/strategy/${encodeURIComponent(plan.id)}`} className={`${links.link} flex min-w-0 flex-1 items-center gap-sm text-body font-medium`} title={plan.name}>
            <Icon name="graph" size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 truncate">{plan.name}</span>
          </Link>
          <span className="inline-flex max-w-1/4 shrink-0 items-center gap-xs text-body-small text-muted-foreground" title={strategyPeriodRangeLabel(plan.period) ?? plan.period}><Icon name="calendar" size="xs" className="shrink-0" aria-hidden="true" /><span className="min-w-0 truncate">{strategyPeriodLabel(plan.period)}</span></span>
          <span className="flex min-w-0 max-w-1/4 shrink-0 items-center text-body-small text-muted-foreground" aria-label={T.owner}><MemberName sub={plan.ownerSub} name={plan.ownerName} fallback={T.noOwner} /></span>
          <Tag tone={plan.status === "active" ? "success" : "neutral"}>{PLAN_STATUS_LABEL[plan.status]}{plan.versionNo ? ` V${plan.versionNo}` : ""}</Tag>
        </div>
        <div className="flex min-w-0 items-center gap-sm text-body" data-market-strategy-objective>
          {plan.strategyTypeName ? <Tag>{plan.strategyTypeName}</Tag> : null}
          <p className={`min-w-0 truncate ${plan.objective ? "" : "text-muted-foreground"}`} title={plan.objective || undefined}>{plan.objective || T.directionEmpty}</p>
        </div>
        <div className="flex min-w-0 items-center gap-sm overflow-x-auto" data-market-strategy-meta aria-label={R.goals} tabIndex={plan.goals.length ? 0 : undefined}>
          {plan.goals.length ? plan.goals.map(goal => <Tag key={goal.id}>
            <span className="inline-flex items-baseline gap-sm whitespace-nowrap" title={`${goalLabel(goal)}: ${Number(goal.target).toLocaleString(locale)} ${goal.unit && goal.unit !== "count" ? goal.unit : R.count}`}>
              <span className="text-body-small font-normal text-muted-foreground">{goalLabel(goal)}</span>
              <span className="text-body font-medium text-foreground"><StrategyQuantity value={Number(goal.target).toLocaleString(locale, { maximumFractionDigits: 2 })} unit={goal.unit && goal.unit !== "count" ? goal.unit : R.count} /></span>
            </span>
          </Tag>) : <span className="truncate text-body-small text-muted-foreground">{H.empty}</span>}
        </div>
      </CardContent></Card>)}</div> : <DetailEmpty>{market.plans === null ? T.unknown : D.noStrategies}</DetailEmpty>}
    </Section>
    <Section title={D.coverage} icon="users" help={<><p>{D.coverageHelp}</p><p>{T.previewWhy}</p><p>{T.baseOnly}</p></>}>
      <Card className="min-w-0"><CardContent className="flex min-w-0 flex-col gap-lg">
        <MarketCustomers market={market} />
      </CardContent></Card>
    </Section>
    <footer className="border-t border-dashed border-primary/10 pt-lg pb-2xl text-body-small text-muted-foreground">{T.dataAt} {new Date(at).toLocaleString(locale)}</footer>
  </ViewLayout>;
}

function DetailEmpty({ children }: { readonly children: ReactNode }) {
  return <Card className="min-w-0"><CardContent className="text-body text-muted-foreground">{children}</CardContent></Card>;
}
