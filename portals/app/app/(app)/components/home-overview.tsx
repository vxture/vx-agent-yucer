"use client";

import Link from "next/link";
import { Button, Card, Icon, type IconProps } from "@vxture/design-ui";
import { useMessages, useLocale } from "../lib/i18n/provider";
import { useOptionalXiaoyu } from "./xiaoyu-provider";
import { workspaceHref } from "../lib/xiaoyu-client";
import type { HomeOverview } from "../lib/home-overview";
import { XiaoyuRobot } from "./xiaoyu-robot";
import styles from "./home-overview.module.css";

export function HomeOverviewView({ data }: { readonly data: HomeOverview }) {
  const { HOME_OVERVIEW_TEXT: T, XIAOYU_TEXT: X } = useMessages();
  const locale = useLocale();
  const state = useOptionalXiaoyu();
  const bundle = state?.bundle, tasks = state?.tasks ?? [];
  const number = (value: number | null) => value === null ? "\u2014" : value.toLocaleString(locale);
  const money = (value: number | null, currency: string | null) => value === null ? "\u2014" : new Intl.NumberFormat(locale, { maximumFractionDigits: 2, notation: "compact", compactDisplay: "short" }).format(value) + (currency ? ` ${currency}` : "");
  const stateText = (state: string) => state === "ready" ? "" : state === "missing" ? T.noTarget : state === "unmeasured" ? T.unmeasured : state === "denied" ? T.denied : state === "insufficient" ? T.insufficient : T.unavailable;
  const primaryPipeline = data.pipeline.amounts.length === 1 && !data.pipeline.missingAmounts ? data.pipeline.amounts[0] : null;
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
        <h1 className={styles.title}>{T.hello}</h1>
        <p className="text-body text-muted-foreground">{T.subtitle}</p>
        <div className="flex flex-wrap items-center gap-md">
          {data.canAsk ? <Button asChild size="md"><Link href="/copilot/today"><Icon name="lightbulb" size="sm" />{T.today}<Icon name="arrow-right" size="sm" /></Link></Button> : <Button size="md" disabled><Icon name="lightbulb" size="sm" />{T.today}</Button>}
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
        <div className={styles.supportGrid}>
          <div><p className="text-body-small text-muted-foreground">{data.targetScope === "company" ? T.company : T.personal}{" \u00b7 "}{data.period}</p><p className={styles.supportValue}><span className="text-body text-muted-foreground">{T.target}</span><strong>{money(data.revenue.target, null)}{data.revenue.target !== null && data.revenue.currency ? <span className="text-body text-muted-foreground">{data.revenue.currency}</span> : null}</strong></p></div>
          <div><p className="text-body-small text-muted-foreground">{T.named}</p><p className={styles.supportValue}><strong>{number(data.named.count)} <span className="text-body text-muted-foreground">{T.unitAccount}</span></strong><span className="text-body text-muted-foreground">{data.named.coverageUnavailable ? T.coverageUnknown : `${number(data.named.covered)} ${T.unitAccount} ${T.covered}`}</span></p></div>
        </div>
        <p className="border-t border-border pt-sm text-body-small text-muted-foreground">{T.publishedBasis}</p>
      </Card>
      <Card surface="soft" className={`${styles.section} ${styles.changes}`}>
        <h2 className={styles.sectionTitle}><Icon name="lightbulb" size="sm" />{T.changesTitle}</h2>
        {data.changes.state === "ready" ? data.changes.findings.length ? <ul className={styles.findings}>{data.changes.findings.map(finding => <li key={finding.id}><span className="line-clamp-2">{finding.claim}</span></li>)}</ul> : <p className="text-body text-muted-foreground">{T.noChanges}</p> : <p className="text-body text-muted-foreground">{stateText(data.changes.state)}</p>}
        {data.canAsk ? <Button asChild size="md" variant="ghost" className="self-start"><Link href="/copilot/today">{T.today}<Icon name="arrow-right" size="sm" /></Link></Button> : null}
      </Card>
    </div>
    <Card surface="soft" className={styles.section}>
      <h2 className={styles.sectionTitle}><Icon name="chat-circle" size="sm" />{T.recentTitle}</h2>
      {tasks.length ? <div className="grid gap-sm md:grid-cols-3">{tasks.slice(0, 3).map(task => <Link key={task.id} href={workspaceHref(task.id)} className={styles.recent}>
        <span className="line-clamp-2 text-body">{task.goal}</span><span className="text-body-small text-muted-foreground">{task.status === "active" ? X.statusActive : task.status === "paused" ? X.statusPaused : task.status === "completed" ? X.statusCompleted : X.statusCancelled}<Icon name="arrow-right" size="xs" /></span>
      </Link>)}</div> : <p className="text-body text-muted-foreground">{T.recentEmpty}</p>}
    </Card>
    <p className="text-body-small text-muted-foreground">{T.summaryAt} <time dateTime={data.observedAt}>{new Date(data.observedAt).toLocaleString(locale)}</time></p>
  </section>;
}
