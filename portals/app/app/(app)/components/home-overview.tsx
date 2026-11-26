"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Icon, type IconProps } from "@vxture/design-ui";
import { useMessages, useLocale } from "../lib/i18n/provider";
import { useOptionalXiaoyu } from "./xiaoyu-provider";
import { workspaceHref } from "../lib/xiaoyu-client";
import type { HomeOverview } from "../lib/home-overview";
import { XiaoyuRobot } from "./xiaoyu-robot";
import styles from "./home-overview.module.css";
import { homeHeadlineIndex } from "../lib/home-headline";

export function HomeOverviewView({ data }: { readonly data: HomeOverview }) {
  const { HOME_OVERVIEW_TEXT: T, XIAOYU_TEXT: X } = useMessages();
  const locale = useLocale();
  const state = useOptionalXiaoyu();
  const [headline, setHeadline] = useState(() => homeHeadlineIndex(Date.parse(data.observedAt)));
  useEffect(() => {
    let timer: number;
    const update = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      setHeadline(homeHeadlineIndex(now));
      timer = window.setTimeout(update, 3_600_000 - now % 3_600_000);
    };
    update();
    window.addEventListener("focus", update);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", update); };
  }, []);
  const bundle = state?.bundle, tasks = state?.tasks ?? [];
  const number = (value: number | null) => value === null ? "\u2014" : value.toLocaleString(locale);
  const money = (value: number | null, currency: string | null) => value === null ? "\u2014" : new Intl.NumberFormat(locale, { maximumFractionDigits: 2, notation: "compact", compactDisplay: "short" }).format(value) + (currency ? ` ${currency}` : "");
  const stateText = (state: string) => state === "ready" ? "" : state === "missing" ? T.noTarget : state === "unmeasured" ? T.unmeasured : state === "denied" ? T.denied : state === "insufficient" ? T.insufficient : T.unavailable;
  const primaryPipeline = data.pipeline.amounts.length === 1 && !data.pipeline.missingAmounts ? data.pipeline.amounts[0] : null;
  const goals = [
    { key: "revenue", label: T.goalRevenue, icon: "coins", metric: data.revenue, support: T.revenue },
    { key: "new_logo", label: T.goalNewCustomers, icon: "user-plus", metric: data.newCustomers, support: T.newCustomers },
    { key: "pipeline", label: T.goalPipeline, icon: "trend-up", metric: data.pipelineTarget, support: T.publishedPipeline },
    { key: "margin", label: data.margin.rate === null && data.margin.target !== null ? T.goalMargin : T.goalMarginRate, icon: "percent", metric: data.margin, support: T.actualMargin },
  ] as const;
  const goalNumber = (key: string, amount: number | null, currency: string | null) => key === "new_logo" ? `${number(amount)}${amount === null ? "" : ` ${T.unitAccount}`}` : money(amount, currency);
  const supportText = (metric: (typeof goals)[number]["metric"], key: string) =>
    metric.state === "ready" ? goalNumber(key, metric.amount, metric.currency) :
    metric.state === "unmeasured" ? key === "margin" ? T.noCostData : T.supportPending :
    metric.state === "missing" ? T.goalMissing : stateText(metric.state);
  const stats: { key: string; label: string; icon: IconProps["name"]; value: string; unit: string | null; detail: string; href: string; state: string }[] = [
    { key: "revenue", label: T.revenue, icon: "coins", value: money(data.revenue.amount, null), unit: data.revenue.currency, detail: stateText(data.revenue.state) || `${T.target} ${money(data.revenue.target, data.revenue.currency)}`, href: `/attainment?period=${data.period}`, state: data.revenue.state },
    { key: "pipeline", label: T.pipeline, icon: "trend-up", value: primaryPipeline ? money(primaryPipeline.amount, null) : number(data.pipeline.count), unit: primaryPipeline ? primaryPipeline.currency : T.unitDeal, detail: stateText(data.pipeline.state) || (data.pipeline.missingAmounts ? T.missingAmounts : data.pipeline.amounts.length > 1 ? T.multiCurrency : `${number(data.pipeline.count)} ${T.unitDeal}`), href: "/pipeline", state: data.pipeline.state },
    { key: "named", label: T.named, icon: "buildings", value: number(data.named.count), unit: T.unitAccount, detail: (data.named.state === "missing" ? T.noNamed : stateText(data.named.state)) || (data.named.coverageUnavailable ? T.coverageUnknown : `${number(data.named.covered)} ${T.unitAccount} ${T.covered}`), href: "/named", state: data.named.state },
    { key: "new", label: T.newCustomers, icon: "user-plus", value: number(data.newCustomers.amount), unit: T.unitAccount, detail: stateText(data.newCustomers.state) || `${T.target} ${number(data.newCustomers.target)} ${T.unitAccount}`, href: `/attainment?period=${data.period}`, state: data.newCustomers.state },
  ];
  return <section className={styles.home} data-home-overview>
    <div className={styles.hero}>
      <div className={styles.welcome}>
        <p className={styles.eyebrow}><Icon name="sparkles" size="sm" /><span>{T.title}</span><span className={styles.period}>{data.period}</span></p>
        <h1 className={styles.title}>{T.headlines[headline]}</h1>
        <p className="text-body text-muted-foreground">{T.subtitle}</p>
        <div className="flex flex-wrap items-center gap-md">
          {data.canAsk ? <Button asChild size="xl"><Link href="/copilot/today"><Icon name="lightbulb" size="sm" />{T.today}<Icon name="arrow-right" size="sm" /></Link></Button> : <Button size="xl" disabled><Icon name="lightbulb" size="sm" />{T.today}</Button>}
          <span className="text-body-small text-muted-foreground">{data.scope === "workspace" ? T.scopeWorkspace : T.scopeVisible}</span>
        </div>
      </div>
      {data.canAsk ? <Link href={workspaceHref(bundle?.task.id)} className={styles.robotEntry} aria-label={`${T.partner}: ${T.bubble} ${T.start}`} data-home-xiaoyu>
        <span className={styles.robot}><XiaoyuRobot /></span>
        <span className={styles.bubble}>{T.bubble}</span>
      </Link> : null}
    </div>
    <div className={styles.stats}>
      {stats.map(stat => <Card key={stat.key} surface="strong" className={styles.stat} data-home-stat={stat.key}>
        <div className={styles.statLabel}><Icon name={stat.icon} size="sm" /><span>{stat.label}</span></div>
        <p className={styles.statValue}>{stat.value}{stat.unit && stat.value !== "\u2014" ? <span className="text-body text-muted-foreground">{stat.unit}</span> : null}</p>
        <p className={styles.statDetail}>{stat.detail}</p>
        {stat.state !== "denied" ? <Link href={stat.href} className={styles.source} aria-label={`${stat.label}: ${T.source}`}><Icon name="arrow-right" size="sm" /></Link> : null}
      </Card>)}
    </div>
    <div className={styles.lower}>
      <Card surface="soft" className={styles.section}>
        <h2 className={styles.sectionTitle}><Icon name="target" size="sm" />{T.supportTitle}</h2>
        <div className={styles.supportGrid} role="table" aria-label={T.supportTitle} data-home-goals>
          <div className={styles.supportHeader} role="row"><span role="columnheader">{data.targetScope === "company" ? T.company : T.personal}{" \u00b7 "}{data.period}</span><span role="columnheader">{T.supportHeading}</span></div>
          {goals.map(goal => <div className={styles.goalRow} key={goal.key} role="row" data-home-goal={goal.key}>
            <div className={styles.goalCell} role="cell">
              <span className={styles.goalLabel}><Icon name={goal.icon} size="sm" />{goal.label}</span>
              <strong className={styles.goalValue}>{goal.key === "margin" && data.margin.rate !== null ? new Intl.NumberFormat(locale, {style:"percent",maximumFractionDigits:1}).format(data.margin.rate) : goalNumber(goal.key, goal.metric.target, goal.metric.currency)}</strong>
              {goal.metric.target === null ? <span className={styles.goalHint}>{["denied", "unavailable"].includes(goal.metric.state) ? stateText(goal.metric.state) : T.goalMissing}</span> : goal.key === "margin" ? <span className={styles.goalHint}>{data.margin.rate === null ? T.marginBasisMissing : `${T.estimatedProfit} ${money(data.margin.target, data.margin.currency)} \u00b7 ${T.marginBasis}`}</span> : null}
            </div>
            <div className={styles.goalCell} role="cell">
              <span className={styles.goalLabel}>{goal.support}</span>
              <span className={goal.metric.state === "ready" ? styles.supportValue : styles.supportState}>{supportText(goal.metric, goal.key)}</span>
            </div>
          </div>)}
        </div>
        <p className="border-t border-border pt-sm text-body-small text-muted-foreground">{T.publishedBasis}</p>
      </Card>
      <Card surface="soft" className={`${styles.section} ${styles.changes}`}>
        <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}><Icon name="lightbulb" size="sm" />{T.changesTitle}</h2>
          {data.canAsk ? <Button asChild size="xl" variant="ghost" data-control-size="preserve"><Link href="/copilot/today">{T.today}<Icon name="arrow-right" size="sm" /></Link></Button> : null}
        </div>
        {data.changes.state === "ready" ? data.changes.findings.length ? <ul className={styles.findings}>{data.changes.findings.map(finding => <li key={finding.id} data-urgency={finding.urgency}><Link href={finding.href} title={`${finding.claim} \u00b7 ${finding.subjectType === "opportunity" ? T.openOpportunity : finding.subjectType === "team" ? T.openPlanning : T.openAccount}`}>
          <span className={styles.findingClaim}>{finding.claim}</span><Icon name="arrow-right" size="sm" />
        </Link></li>)}</ul> : <p className="text-body text-muted-foreground">{T.noChanges}</p> : <p className="text-body text-muted-foreground">{stateText(data.changes.state)}</p>}
      </Card>
    </div>
    <Card surface="soft" className={styles.section}>
      <h2 className={styles.sectionTitle}><Icon name="chat-circle" size="sm" />{T.recentTitle}</h2>
      {tasks.length ? <div className="grid gap-sm md:grid-cols-3">{tasks.slice(0, 3).map(task => <Link key={task.id} href={workspaceHref(task.id)} className={styles.recent} data-home-recent>
        <span className="line-clamp-2 text-body">{task.goal}</span><span className="text-body-small text-muted-foreground">{task.status === "active" ? X.statusActive : task.status === "paused" ? X.statusPaused : task.status === "completed" ? X.statusCompleted : X.statusCancelled}<Icon name="arrow-right" size="xs" /></span>
      </Link>)}</div> : <p className="text-body text-muted-foreground">{state?.loading ? T.recentLoading : state?.error ? T.unavailable : T.recentEmpty}</p>}
    </Card>
    <p className="text-body-small text-muted-foreground">{T.summaryAt} <time dateTime={data.observedAt}>{new Date(data.observedAt).toLocaleString(locale)}</time></p>
  </section>;
}
