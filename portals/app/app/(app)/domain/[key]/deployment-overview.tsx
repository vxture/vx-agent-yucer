import Link from "next/link";
import { EmptyState, Icon, Input, MetricCard, StatusBadge } from "@vxture/design-ui";
import { CollectionToolbar } from "../../components/collection-layout";
import { PageActionButton } from "../../components/page-header-actions";
import { Tag } from "../../components/tag";
import { getMessages } from "../../lib/i18n/server";
import type { DeploymentOverview } from "./deployment-data";
import { deploymentOverviewFacts } from "./facts";

export function DeploymentYearControl({ year, label, submit }: { year: number; label: string; submit: string }) {
  return <form action="/domain/deployment" method="get" className="flex flex-wrap items-center gap-xs">
    <label htmlFor="deployment-year" className="text-body-small text-muted-foreground">{label}</label>
    <Input id="deployment-year" name="year" type="number" min={2000} max={2200} required defaultValue={year} className="h-control-xl w-24" />
    <PageActionButton type="submit">{submit}</PageActionButton>
  </form>;
}

export async function DeploymentOverviewPanel({ summary, year, canViewAttainment }: { summary: DeploymentOverview; year: number; canViewAttainment: boolean }) {
  const { DEPLOYMENT_HOME_TEXT: T, DOMAIN_FACT_LABEL } = await getMessages();
  const planningHref = `/planning?year=${year}`;
  const facts = deploymentOverviewFacts(summary, year);
  return <section className="flex flex-col gap-md" aria-label={T.overview} data-deployment-overview>
    <CollectionToolbar title={T.overview} icon="target" help={T.help} notice={
      summary.status === "published" ? <>
        {summary.version !== null ? <StatusBadge tone="success">{T.version(summary.version)}</StatusBadge> : null}
        {summary.regionalVersion !== null ? <StatusBadge tone="info">{T.regionalVersion(summary.regionalVersion)}</StatusBadge> : null}
        {summary.closed ? <Tag>{T.closed}</Tag> : null}
      </> : undefined
    } actions={summary.status === "published" && canViewAttainment ? <PageActionButton asChild><Link href={`/attainment?period=Y${year}&planRevision=${encodeURIComponent(summary.revisionId)}`}>
      <Icon name="chart-bar" size="sm" />{T.attainment}
    </Link></PageActionButton> : undefined} />
    {summary.status === "published" ? facts.length ? <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-md">
      {facts.map(f => <Link key={f.key} href={f.href} className="rounded-md focus-visible:outline focus-visible:outline-primary hover:text-primary">
        <MetricCard label={DOMAIN_FACT_LABEL[f.key]} value={f.value} description={T.units[f.key]}
          icon={f.key.includes("Region") || f.key.startsWith("regions") ? "map-pin" : "buildings"}
          tone={f.attention ? "warning" : "info"} />
      </Link>)}
    </div> : <EmptyState title={T.regionsPending} description={T.regionsPendingHint} action={<PageActionButton asChild><Link href={planningHref}>{T.openPlanning}</Link></PageActionButton>} /> : (
      <EmptyState title={T.states[summary.status].title} description={T.states[summary.status].description}
        action={summary.status === "unpublished" ? <PageActionButton asChild><Link href={planningHref}>{T.openPlanning}</Link></PageActionButton> : summary.status === "failed" ? <PageActionButton asChild><Link href={`/domain/deployment?year=${year}`}>{T.retry}</Link></PageActionButton> : undefined} />
    )}
  </section>;
}
