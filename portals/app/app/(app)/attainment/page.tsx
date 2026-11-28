import { EmptyState } from "@vxture/design-system";
import { can } from "../../authz/decide";
import { snapshotKey } from "../lib/attainment-progress";
import { loadForecastWorkspace } from "./board";
import { loadAttainmentBase } from "./board";
import { loadAttainmentAnalysis } from "./analysis-board";
import {
  resolveAttainmentQuery,
  revenuePool,
  type AttainmentQuery,
} from "../lib/attainment-workspace";
import { attainmentScreen } from "../lib/attainment-pages";
import { lockedPage } from "../components/locked-page";
import { AttainmentNavRegistration } from "./navigation";
import { AttainmentPageFrame } from "./page-frame";
import { AttainmentWorkspaceHeader } from "./workspace-header";
import {
  CompanyReading,
  CustomerReading,
  PersonalReading,
  RegionalReading,
} from "./reading-views";
import { RegionalCharts, TeamCharts } from "./chart-views";
import { AttainmentForecastView } from "./forecast-view";
import { SubmitForecast } from "../components/submit-forecast";
import {
  prepareForecastSnapshot,
  submitForecastSnapshot,
} from "../pipeline/forecast-action";
import { resolveLocale } from "../lib/i18n/locale";
import { attainmentCopy } from "./copy";
import LegacyAttainmentPage from "./legacy-page";
export const dynamic = "force-dynamic";
type Query = AttainmentQuery & {
  metric?: string | string[];
  filter?: string | string[];
  teamView?: string | string[];
};
export default async function AttainmentPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const base = await loadAttainmentBase();
  if (!base) return null;
  const locked = lockedPage(base.session, "attainment");
  if (locked) return locked;
  if (query.period === "all" && query.screen === undefined)
    return <LegacyAttainmentPage searchParams={Promise.resolve(query)} />;
  const locale = await resolveLocale(),
    T = attainmentCopy(locale);
  let screen = attainmentScreen(query);
  if (
    !screen ||
    Array.isArray(query.metric) ||
    Array.isArray(query.filter) ||
    Array.isArray(query.teamView)
  )
    return <EmptyState title={T.failed} />;
  if (
    !query.screen &&
    screen === "company" &&
    base.session.scope.kind !== "workspace"
  )
    screen = "mine";
  const effectiveScope = screen === "mine" ? "personal" : query.scope;
  const selection = resolveAttainmentQuery(
    { ...query, scope: effectiveScope },
    base.session.user.sub,
    base.session.scope,
  );
  if (selection.invalid) return <EmptyState title={T.failed} />;
  const year = Number(selection.period.replace(/^Y/, "").slice(0, 4));
  const data = await loadAttainmentAnalysis(
    year,
    selection.period,
    selection.planRevision,
  );
  if (!data) return null;
  if (selection.planRevision && !data.revision)
    return <EmptyState title={T.failed} />;
  if (screen === "company" && !data.workspace)
    return <EmptyState title={T.failed} />;
  const scope =
    screen === "company"
      ? "workspace"
      : screen === "mine"
        ? `owner:${data.self}`
        : selection.selection;
  const region = data.regions.find((r) => scope === `territory:${r.id}`);
  if (screen === "region" && !region) return <EmptyState title={T.failed} />;
  const owner = data.members.find((m) => scope === `owner:${m.sub}`);
  const name =
    region?.name ??
    owner?.name ??
    (scope === "workspace" ? T.companyScope : T.selfScope);
  const metric =
    typeof query.metric === "string" &&
    ["revenue", "pipeline", "new_logo", "margin"].includes(query.metric)
      ? (query.metric as "revenue" | "pipeline" | "new_logo" | "margin")
      : "revenue";
  const filter =
    typeof query.filter === "string" &&
    [
      "all",
      "attention",
      "achieved",
      "unverified",
      "commit",
      "missingBasis",
      "delayed",
    ].includes(query.filter)
      ? query.filter
      : "all";
  const forecast = screen === "forecast" || screen === "history";
  const forecastBoard =
    forecast && data.canForecast
      ? await loadForecastWorkspace(selection.period, selection.scopeKey)
      : null;
  const reports = forecastBoard?.ok
    ? forecastBoard.points.map((p) => ({
        key: snapshotKey(p),
        label:
          p.snapshotAt.toLocaleString(locale, {
            timeZone: "UTC",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }) + " UTC",
      }))
    : [];
  const teamView = query.teamView === "rate" ? "rate" : "amount";
  const slice =
    base.deals.ok && base.policy.ok
      ? revenuePool(
          base.deals.value,
          selection.period,
          selection.scope,
          base.policy.value.defaultCurrency,
        )
      : null;
  const totals = slice?.totals.ok ? slice.totals.value : null;
  const submit =
    screen === "forecast" &&
    data.canForecast &&
    totals &&
    selection.selection !== "team" &&
    (!data.revision || data.revision.id === data.current?.id) &&
    can(
      base.session.authz,
      base.session.entitlement,
      "pipeline.forecast.snapshot",
      "ui",
    ).allowed ? (
      <SubmitForecast
        key={`submit-${selection.period}-${selection.scopeKey}`}
        period={selection.period}
        scopeKey={selection.scopeKey}
        currency={totals.closedAmount.currency}
        contextLabel={name}
        canSubmit
        onSubmit={submitForecastSnapshot}
        onPrepare={prepareForecastSnapshot}
      />
    ) : null;
  return (
    <AttainmentPageFrame fitted={screen === "regions" || screen === "team"}>
      <AttainmentNavRegistration
        data={{
          regions: data.regions,
          workspace: data.workspace,
          canForecast: data.canForecast,
        }}
      />
      <AttainmentWorkspaceHeader
        data={data}
        screen={screen}
        scope={scope}
        name={name}
        metric={metric}
        filter={filter}
        teamView={teamView}
        reports={reports}
        snapshot={selection.snapshot}
      />
      {!data.targets || !data.currency ? (
        <EmptyState title={T.failed} />
      ) : screen === "company" ? (
        <CompanyReading data={data} />
      ) : screen === "customers" ? (
        <CustomerReading data={data} filter={filter} scope={scope} />
      ) : screen === "regions" ? (
        <RegionalCharts data={data} metric={metric} />
      ) : screen === "region" ? (
        <RegionalReading data={data} scope={scope} name={name} />
      ) : screen === "team" ? (
        <TeamCharts data={data} view={teamView} />
      ) : screen === "mine" ? (
        <PersonalReading data={data} scope={scope} filter={filter} />
      ) : forecast && data.canForecast ? (
        <AttainmentForecastView
          period={selection.period}
          scopeKey={selection.scopeKey}
          view={screen === "history" ? "history" : "review"}
          canApply={
            can(
              base.session.authz,
              base.session.entitlement,
              "pipeline.forecast.categorize",
              "ui",
            ).allowed
          }
          snapshot={selection.snapshot}
          selectionScope={selection.selection}
          canPlan={data.canPlan}
          canViewTarget={
            can(
              base.session.authz,
              base.session.entitlement,
              "planning.target.view",
              "ui",
            ).allowed
          }
          planRevision={selection.planRevision}
          analysis={data}
          submit={submit}
        />
      ) : (
        <EmptyState title={T.failed} />
      )}
    </AttainmentPageFrame>
  );
}
