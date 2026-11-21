import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { canReadReportingScope } from "../../../authz/forecast-scope";
import { PageCrumbs } from "../../components/page-crumbs";
import { ViewHeader } from "../../components/business-controls";
import { PeriodTabs } from "../../components/period-tabs";
import { lockedPage } from "../../components/locked-page";
import { attainmentHref, resolveAttainmentQuery, type AttainmentQuery } from "../../lib/attainment-workspace";
import { getMessages } from "../../lib/i18n/server";
import { resolveLocale } from "../../lib/i18n/locale";
import { offeredPeriods } from "../../lib/periods";
import { loadAttainmentBase, loadAttainmentPlan, loadAttainmentTeam } from "../board";
import { AttainmentProgress } from "../progress";

export const dynamic = "force-dynamic";

export default async function AttainmentCoveragePage({ searchParams }: {
  searchParams: Promise<AttainmentQuery>;
}) {
  const data = await loadAttainmentBase();
  if (!data) return null;
  const locked = lockedPage(data.session, "attainment");
  if (locked) return locked;
  const selection = resolveAttainmentQuery(await searchParams, data.session.user.sub, data.session.scope);
  const { ATTAINMENT_PLAN_TEXT: T, DOMAIN_LABEL, ATTAINMENT_DEPLOYMENT_TEXT: D } = await getMessages();
  const team = selection.perspective === "team" ? await loadAttainmentTeam() : null;
  if (selection.invalid || !canReadReportingScope(data.session.scope, selection.scope, data.session.user.sub) ||
      (selection.perspective === "team" && !team?.members.some((m) => m.sub === selection.scope.ownerSub)))
    return <EmptyState title={T.invalidScope} />;
  const year = Number(selection.period.replace(/^Y/, "").slice(0, 4));
  const periods = offeredPeriods(new Date(Date.UTC(year, 0, 1)));
  const scopeName = selection.scope.scopeType === "workspace" ? T.company :
    selection.scope.scopeType === "owner" ? team?.members.find((m) => m.sub === selection.scope.ownerSub)?.name ?? T.personal :
    data.plans?.flatMap((p) => p.regions).find((r) => r.id === selection.scope.territoryId)?.name ??
    (data.rawTerritories.ok ? data.rawTerritories.value.find((r) => r.id === selection.scope.territoryId)?.name : null) ?? T.region;
  const selectedPlan = await loadAttainmentPlan(year, selection.planRevision);
  if (selection.planRevision && !selectedPlan?.ok) return <EmptyState title={T.contextMissing}/>;
  const back = attainmentHref({ period: selection.period, scope: selection.selection, perspective: selection.perspective, planRevision: selection.planRevision });
  const locale = await resolveLocale();
  const revisionLabel = selectedPlan?.ok && selectedPlan.value.selected ? `V${selectedPlan.value.selected.version}` : null;
  return (
    <ViewLayout className="pb-3xl">
      <PageCrumbs trail={[{ label: DOMAIN_LABEL.attainment, href: back }]} current={D.evidence} />
      <ViewHeader
        icon="chart-pie-slice"
        title={D.evidence}
        description={[scopeName, selection.period, D.live, revisionLabel].filter(Boolean).join(" / ")}
        help={D.evidenceHelp}
        divider
        pageActions={{ context: <PeriodTabs value={selection.period} periods={periods.quarters} yearLabel={periods.year} yearText={T.periodYear} compact resetParams={["snapshot"]} /> }}
      />
      <AttainmentProgress selection={selection} />
      <footer className="mt-xl border-t border-dashed border-border pt-lg pb-xl text-body-small text-muted-foreground" data-attainment-cutoff>
        {T.dataCutoff}{" "}<time dateTime={data.observedAt}>{new Date(data.observedAt).toLocaleString(locale, { timeZone: "UTC" })} UTC</time>
      </footer>
    </ViewLayout>
  );
}
