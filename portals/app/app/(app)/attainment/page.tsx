import { loadStrategyFulfillment } from "../lib/strategy-fulfillment";
import { StrategyFulfillmentPanel } from "../components/strategy-fulfillment-panel";
import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { can } from "../../authz/decide";
import { resolveLocale } from "../lib/i18n/locale";
import { AttainmentTeam } from "./team";
import { getMessages } from "../lib/i18n/server";
import {
  resolveAttainmentQuery,
  attainmentHref,
  revenuePool,
  type AttainmentQuery,
} from "../lib/attainment-workspace";
import { offeredPeriods } from "../lib/periods";
import { ModuleHeadline } from "../components/module-headline";
import {
  AttainmentControls,
  AttainmentViewActions,
} from "../components/attainment-controls";
import { SubmitForecast } from "../components/submit-forecast";
import { lockedPage } from "../components/locked-page";
import {
  prepareForecastSnapshot,
  submitForecastSnapshot,
} from "../pipeline/forecast-action";
import {
  loadAttainmentBase,
  loadAttainmentPlan,
  loadAttainmentTeam,
} from "./board";
import { AttainmentOverview } from "./overview";
import { AttainmentForecastView } from "./forecast-view";
import { canReadReportingScope } from "../../authz/forecast-scope";
import { AttainmentContext } from "../components/attainment-context";
import { PageActionButton } from "../components/page-header-actions";
import Link from "next/link";
import { AttainmentModuleSummary } from "./summary";
import { Tag } from "../components/tag";

export const dynamic = "force-dynamic";

export default async function AttainmentPage({
  searchParams,
}: {
  searchParams: Promise<AttainmentQuery>;
}) {
  const data = await loadAttainmentBase();
  if (!data) return null;
  const { session } = data;
  const locked = lockedPage(session, "attainment");
  if (locked) return locked;
  const selection = resolveAttainmentQuery(
    await searchParams,
    session.user.sub,
    session.scope,
  );
  const {
    ATTAINMENT_TEXT: { workspace: T },
    ATTAINMENT_PLAN_TEXT: PT,
    ATTAINMENT_DEPLOYMENT_TEXT: DT,
  } = await getMessages();
  if (selection.invalid) return <EmptyState title={PT.invalidScope} />;
  const team = await loadAttainmentTeam();
  const locale = await resolveLocale();
  const selectedYear = Number(selection.period.replace(/^Y/, "").slice(0, 4));
  const periods = offeredPeriods(new Date(Date.UTC(selectedYear, 0, 1)));
  const years = [
    ...new Set([
      new Date(data.observedAt).getUTCFullYear(),
      selectedYear,
      ...(data.plans?.map((p) => p.year) ?? []),
    ]),
  ].sort((a, b) => b - a);
  const candidateOwners = [
    ...new Set([
      session.user.sub,
      ...(data.deals.ok ? data.deals.value.map((d) => d.ownerSub) : []),
      ...(data.plans?.flatMap((p) =>
        p.targets.flatMap((t) =>
          t.scope.startsWith("owner:") ? [t.scope.slice(6)] : [],
        ),
      ) ?? []),
    ]),
  ].filter((sub) =>
    canReadReportingScope(
      session.scope,
      { scopeType: "owner", ownerSub: sub, territoryId: null },
      session.user.sub,
    ),
  );
  const owners =
    selection.perspective === "team"
      ? (team?.members.map((m) => m.sub) ?? [session.user.sub])
      : candidateOwners;
  if (
    selection.perspective === "team" &&
    !owners.includes(selection.scope.ownerSub ?? "")
  )
    return <EmptyState title={PT.invalidScope} />;
  const plan = await loadAttainmentPlan(
    selection.period === "all"
      ? new Date(data.observedAt).getUTCFullYear()
      : Number(selection.period.replace(/^Y/, "").slice(0, 4)),
    selection.planRevision,
  );
  if (selection.planRevision && !plan?.ok) return <ViewLayout><EmptyState title={DT.missing}/><PageActionButton asChild><Link href={attainmentHref({ period: selection.period, scope: selection.selection, view: selection.view })}>{DT.latest}</Link></PageActionButton></ViewLayout>;
  const selectedRevision = plan?.ok ? plan.value.selected ?? plan.value.current : null;
  const historicalTarget = !!selectedRevision && selectedRevision.id !== (plan?.ok ? plan.value.current?.id : null);
  const targetTerritories = new Set(
    data.plans?.flatMap((p) =>
      p.targets.flatMap((t) =>
        t.scope.startsWith("territory:") ? [t.scope.slice(10)] : [],
      ),
    ) ?? [],
  );
  const territories = [
    ...new Map(
      [
        ...(data.territories.ok
          ? data.territories.value.map((t) => ({ id: t.id, name: t.name }))
          : []),
        ...(data.rawTerritories.ok
          ? data.rawTerritories.value
              .filter((t) => targetTerritories.has(t.id))
              .map((t) => ({ id: t.id, name: t.name }))
          : []),
        ...(plan?.ok
          ? plan.value.regions.map((r) => ({ id: r.id, name: r.name }))
          : []),
      ].map((r) => [r.id, r]),
    ).values(),
  ];
  if (
    (selection.scope.scopeType === "territory" &&
      !territories.some((r) => r.id === selection.scope.territoryId)) ||
    (selection.scope.scopeType === "owner" &&
      !owners.includes(selection.scope.ownerSub ?? ""))
  )
    return <EmptyState title={PT.invalidScope} />;
  const forecastGate = can(
    session.authz,
    session.entitlement,
    "pipeline.forecast.view",
    "ui",
  );
  const slice =
    selection.period !== "all" && data.deals.ok && data.policy.ok
      ? revenuePool(
          data.deals.value,
          selection.period,
          selection.scope,
          data.policy.value.defaultCurrency,
        )
      : null;
  const totals = slice?.totals.ok ? slice.totals.value : null;
  const canSubmit =
    forecastGate.allowed &&
    !historicalTarget &&
    can(session.authz, session.entitlement, "pipeline.forecast.snapshot", "ui")
      .allowed &&
    totals !== null &&
    !(selection.perspective === "team" && selection.view === "progress") &&
    canReadReportingScope(session.scope, selection.scope, session.user.sub);
  const submit =
    selection.period !== "all" && selection.view !== "history" && canSubmit ? (
      <SubmitForecast
        key={`${selection.period}|${selection.scopeKey}`}
        period={selection.period}
        scopeKey={selection.scopeKey}
        currency={totals!.closedAmount.currency}
        contextLabel={
          selection.scope.scopeType === "territory"
            ? (territories.find((t) => t.id === selection.scope.territoryId)
                ?.name ?? T.scopeUnavailable)
            : selection.scope.scopeType === "owner"
              ? (team?.members.find((m) => m.sub === selection.scope.ownerSub)
                  ?.name ?? PT.personal)
              : PT.company
        }
        canSubmit
        onSubmit={submitForecastSnapshot}
        onPrepare={prepareForecastSnapshot}
      />
    ) : null;
  const controls = (<AttainmentControls
              period={selection.period}
              perspective={selection.perspective}
              selfSub={session.user.sub}
              years={years}
              selection={selection.selection}
              view={selection.view}
              year={periods.year}
              quarters={periods.quarters}
              planRevision={selection.planRevision}
              owners={owners}
              territories={territories}
              allowWorkspace={session.scope.kind === "workspace"}
            />);
  let scopeName = PT.company;
  if (selection.scope.scopeType === "territory") scopeName = territories.find(r => r.id === selection.scope.territoryId)?.name ?? PT.region;
  if (selection.scope.scopeType === "owner") scopeName = PT.personal;
  return (
    <ViewLayout className="pb-3xl">
      <ModuleHeadline
        moduleKey="attainment"
        help={T.why}
        description={<AttainmentModuleSummary selection={selection} allowForecast={forecastGate.allowed}/>}
        tags={<Tag>{selection.view === "history" ? DT.history : T[selection.view]}</Tag>}
        pageActions={{
          more: (
            <AttainmentViewActions
              value={selection.view}
              allowForecast={forecastGate.allowed}
              reportingScope={
                selection.perspective === "team"
                  ? `owner:${session.user.sub}`
                  : session.scope.kind === "workspace"
                    ? "workspace"
                    : territories.length
                      ? `territory:${territories[0].id}`
                      : "personal"
              }
            />
          ),
          primary: submit,
        }}
      />
      {selection.view === "history" || !plan?.ok ? controls : null}
      {selection.view !== "history" && plan?.ok ? <AttainmentContext controls={controls} period={selection.period} scope={selection.selection}
        scopeName={scopeName}
        view={selection.view} selected={selectedRevision} current={plan.value.current} versions={plan.value.historical}
        canPlan={session.scope.kind === "workspace" && can(session.authz, session.entitlement, "planning.target.view", "ui").allowed}
        canFocus={can(session.authz, session.entitlement, "account.view", "ui").allowed}/>: null}
      {selection.view !== "history" &&
      (selection.period !== "all" || selection.view === "progress") ? (
        selection.perspective === "team" && selection.view === "progress" ? (
          <AttainmentTeam selection={selection} />
        ) : (
          <AttainmentOverview selection={selection} />
        )
      ) : null}
      {selection.period === "all" ? (
        selection.view !== "progress" ? (
          <EmptyState title={T.choosePeriod} description={T.choosePeriodHint} />
        ) : null
      ) : selection.view === "progress" ? null : !forecastGate.allowed ? (
        (lockedPage(session, "forecastRule") ?? (
          <EmptyState title={T.unknownRead} />
        ))
      ) : (
        <AttainmentForecastView
          period={selection.period}
          scopeKey={selection.scopeKey}
          view={selection.view}
          canApply={
            can(
              session.authz,
              session.entitlement,
              "pipeline.forecast.categorize",
              "ui",
            ).allowed
          }
          snapshot={selection.snapshot}
          selectionScope={selection.selection}
          canPlan={session.scope.kind === "workspace"}
          canViewTarget={
            can(
              session.authz,
              session.entitlement,
              "planning.target.view",
              "data",
            ).allowed
          }
          planRevision={selection.planRevision}
        />
      )}
      {selection.view === "progress" && selection.perspective === "regions" ? <StrategyFulfillmentPanel rows={await loadStrategyFulfillment(session, {year:selectedYear,period:selection.period === "all" ? `Y${selectedYear}` : selection.period,regionId:selection.scope.scopeType === "territory" ? selection.scope.territoryId ?? undefined : undefined,revisionId:selection.planRevision ?? undefined})} canRecord={!historicalTarget && can(session.authz,session.entitlement,"planning.target.update","ui").allowed}/> : null}
      <footer
        className="mt-xl border-t border-dashed border-border pt-lg pb-xl text-body-small text-muted-foreground"
        data-attainment-cutoff
      >
        {PT.dataCutoff}{" "}
        <time dateTime={data.observedAt}>
          {new Date(data.observedAt).toLocaleString(locale, {
            timeZone: "UTC",
          })}{" "}
          UTC
        </time>
      </footer>
    </ViewLayout>
  );
}
