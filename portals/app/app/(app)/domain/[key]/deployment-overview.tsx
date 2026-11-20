import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, Icon, Input, MetricCard, StatusBadge } from "@vxture/design-ui";
import { CollectionToolbar } from "../../components/collection-layout";
import { PageActionButton } from "../../components/page-header-actions";
import { Tag } from "../../components/tag";
import { getMessages } from "../../lib/i18n/server";
import type { Dictionary } from "../../lib/i18n/dictionary";
import type { DeploymentOverview } from "./deployment-data";
import { deploymentOverviewFacts } from "./facts";

type OverviewProps = { readonly summary: DeploymentOverview; readonly year: number };
type Text = Dictionary["DEPLOYMENT_HOME_TEXT"];

export function DeploymentYearControl({ year, label, submit }: { readonly year: number; readonly label: string; readonly submit: string }) {
  return <form action="/domain/deployment" method="get" className="flex flex-wrap items-center gap-xs">
    <label htmlFor="deployment-year" className="text-body-small text-muted-foreground">{label}</label>
    <Input id="deployment-year" name="year" type="number" min={2000} max={2200} required defaultValue={year} className="h-control-xl w-24" />
    <PageActionButton type="submit">{submit}</PageActionButton>
  </form>;
}

function PublicationTags({ summary, text: T }: { readonly summary: DeploymentOverview; readonly text: Text }) {
  if (summary.status !== "published") return null;
  return <>
    {summary.version !== null ? <StatusBadge tone="success">{T.version(summary.version)}</StatusBadge> : null}
    {summary.regionalVersion !== null ? <StatusBadge tone="info">{T.regionalVersion(summary.regionalVersion)}</StatusBadge> : null}
    {summary.closed ? <Tag>{T.closed}</Tag> : null}
  </>;
}

function OverviewContent({ summary, year, text: T, labels }: OverviewProps & { readonly text: Text; readonly labels: Record<string, string> }) {
  const planningAction = <PageActionButton asChild><Link href={`/planning?year=${year}`}>{T.openPlanning}</Link></PageActionButton>;
  if (summary.status !== "published") {
    let action: ReactNode;
    if (summary.status === "unpublished") action = planningAction;
    else if (summary.status === "failed") action = <PageActionButton asChild><Link href={`/domain/deployment?year=${year}`}>{T.retry}</Link></PageActionButton>;
    return <EmptyState {...T.states[summary.status]} action={action} />;
  }
  const facts = deploymentOverviewFacts(summary, year);
  if (!facts.length) return <EmptyState title={T.regionsPending} description={T.regionsPendingHint} action={planningAction} />;
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-md">
    {facts.map(f => <Link key={f.key} href={f.href} className="rounded-md focus-visible:outline focus-visible:outline-primary hover:text-primary">
      <MetricCard label={labels[f.key]} value={f.value} description={T.units[f.key]}
        icon={f.key.includes("Region") || f.key.startsWith("regions") ? "map-pin" : "buildings"}
        tone={f.attention ? "warning" : "info"} />
    </Link>)}
  </div>;
}

export async function DeploymentOverviewPanel({ summary, year, canViewAttainment }: OverviewProps & { readonly canViewAttainment: boolean }) {
  const { DEPLOYMENT_HOME_TEXT: T, DOMAIN_FACT_LABEL } = await getMessages();
  const attainmentAction = summary.status === "published" && canViewAttainment ? <PageActionButton asChild>
    <Link href={`/attainment?period=Y${year}&planRevision=${encodeURIComponent(summary.revisionId)}`}><Icon name="chart-bar" size="sm" />{T.attainment}</Link>
  </PageActionButton> : undefined;
  return <section className="flex flex-col gap-md" aria-label={T.overview} data-deployment-overview>
    <CollectionToolbar title={T.overview} icon="target" help={T.help} notice={<PublicationTags summary={summary} text={T} />} actions={attainmentAction} />
    <OverviewContent summary={summary} year={year} text={T} labels={DOMAIN_FACT_LABEL} />
  </section>;
}
