"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, Icon, ViewLayout, type IconName } from "@vxture/design-ui";
import type { MarketStrategyReference, MarketView } from "../lib/market-strategy";
import { strategyOfferings } from "../lib/strategy-offerings";
import { segmentSummary } from "../../domains/strategy/lib/segment-summary";
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
  const insightRows = insights.filter(row => market.criteria[row.key]?.trim());
  const goalLabel = (goal: MarketStrategyReference["goals"][number]) => goal.name && goal.name !== goal.metric ? goal.name : goal.metric ? H[goal.metric] : R.goals;
  return <ViewLayout className="@container" data-market-detail>
    <PageCrumbs trail={[{ label: T.markets, href: "/segment" }]} current={market.name} />
    <ViewHeader icon="chart-pie-slice" title={market.name} description={<span className="flex min-w-0 flex-col gap-sm"><span className="text-body-small">{market.segmentCode}</span><span className="text-body text-muted-foreground" data-market-detail-summary>{segmentSummary(market.criteria) || T.notProvided}</span></span>}
      secondary={<Tag tone={market.status === "active" ? "success" : "neutral"}>{S.segmentStatusLabel[market.status]}</Tag>}
      help={D.help} divider={false}
      pageActions={{ primary: canWrite ? <PageActionButton asChild><Link href={`/segment/new?id=${encodeURIComponent(market.id)}`}><Icon name="edit" size="sm" aria-hidden="true" />{T.editMarket}</Link></PageActionButton> : undefined }} />
    <Section title={F.conditions} icon="filter" help={<><p>{F.conditionRule}</p><p>{F.noConditions}</p></>}>
      <Card className="min-w-0 py-lg"><CardContent>
        <dl className={styles.conditions}>{conditions.map(row => <div key={row.label} className={styles.field}>
          <dt><StrategyDetailLabel icon={row.icon}>{row.label}</StrategyDetailLabel></dt>
          <dd className="min-w-0 break-words text-body">{row.value.join(" / ") || (defined ? T.unlimited : T.undefined)}</dd>
        </div>)}</dl>
      </CardContent></Card>
    </Section>
    {insightRows.length ? <Section title={F.insights} icon="lightbulb" help={<><p>{T.marketInsightHint}</p><p>{T.qualitativeHint}</p></>}>
      <Card className="min-w-0 py-lg"><CardContent>
        <dl className={styles.insights}>{insightRows.map(row => <div key={row.key} className={styles.insight}>
          <dt><StrategyDetailLabel icon={row.icon}>{F[row.key]}</StrategyDetailLabel></dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-body">{market.criteria[row.key]}</dd>
        </div>)}</dl>
      </CardContent></Card>
    </Section> : null}
    <Section title={T.productSolutionsTitle} icon="squares-four" help={T.marketDefaultSolutionsHint}>
      {offerings.length ? <div className={styles.references} data-market-detail-offerings>{offerings.map(row => <Card key={row.key} className="min-w-0 py-lg">
        <CardContent className="flex min-w-0 flex-col gap-md">
          <Link href={row.href} className="flex min-w-0 items-start gap-sm text-body font-medium no-underline transition-colors hover:text-primary-text hover:no-underline" title={row.name}>
            <Icon name={row.icon} size="md" className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="line-clamp-2 min-w-0 break-words">{row.name}</span>
            <Icon name="arrow-right" size="sm" className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
          <p className="line-clamp-1 min-w-0 text-body-small text-muted-foreground" title={row.code}>{row.code}</p>
          <div className="mt-auto flex flex-wrap items-center gap-sm border-t border-dashed border-border pt-sm text-body-small text-muted-foreground">
            <span>{row.kind === "product" ? T.productKind : T.solutionKind}</span>
            {row.novelty ? <Tag>{R[row.novelty]}</Tag> : null}
            {row.status === "retired" ? <Tag>{T.retiredSolution}</Tag> : null}
          </div>
        </CardContent>
      </Card>)}</div> : market.defaultSolutions != null && market.defaultProducts != null ? <DetailEmpty>{T.noPlanSolutions}</DetailEmpty> : null}
      {market.defaultSolutions == null || market.defaultProducts == null ? <DetailEmpty>{T.unknown}</DetailEmpty> : null}
    </Section>
    <Section title={D.strategies} icon="flag" help={D.strategyHelp}>
      {market.plans?.length ? <div className={styles.references} data-market-detail-strategies>{market.plans.map(plan => <Card key={plan.id} className="min-w-0 py-lg"><CardContent className="flex min-w-0 flex-col gap-md">
        <div className="flex min-w-0 items-center gap-sm" data-market-strategy-heading>
          <Link href={`/strategy/${encodeURIComponent(plan.id)}`} className="flex min-w-0 flex-1 items-center gap-sm text-body font-medium no-underline transition-colors hover:text-primary-text hover:no-underline" title={plan.name}>
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
      <Card className="min-w-0 py-lg"><CardContent className="flex min-w-0 flex-col gap-lg">
        <dl className={styles.coverage}>{[
          { label: T.customerCount, value: market.matched },
          { label: T.assigned, value: market.assigned },
          { label: T.missing, value: market.missing },
        ].map(row => <div key={row.label} className="flex min-w-0 items-baseline gap-sm"><dt className="text-body text-muted-foreground">{row.label}</dt><dd className="text-body font-medium"><StrategyQuantity value={row.value ?? "-"} unit={row.value === null ? undefined : D.customerUnit} /></dd></div>)}</dl>
        <MarketCustomers market={market} />
      </CardContent></Card>
    </Section>
    <footer className="border-t border-dashed border-primary/10 pt-lg pb-2xl text-body-small text-muted-foreground">{T.dataAt} {new Date(at).toLocaleString(locale)}</footer>
  </ViewLayout>;
}

function DetailEmpty({ children }: { readonly children: ReactNode }) {
  return <Card className="min-w-0 py-lg"><CardContent className="text-body text-muted-foreground">{children}</CardContent></Card>;
}
