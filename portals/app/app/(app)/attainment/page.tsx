import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { can } from "../../authz/decide";
import { getMessages } from "../lib/i18n/server";
import {
  resolveAttainmentQuery,
  revenuePool,
  type AttainmentQuery,
} from "../lib/attainment-workspace";
import { offeredPeriods } from "../lib/periods";
import { ModuleHeadline } from "../components/module-headline";
import {
  AttainmentControls,
  AttainmentViewTabs,
} from "../components/attainment-controls";
import { SubmitForecast } from "../components/submit-forecast";
import { lockedPage } from "../components/locked-page";
import {
  prepareForecastSnapshot,
  submitForecastSnapshot,
} from "../pipeline/forecast-action";
import { loadAttainmentBase, loadAttainmentPlan } from "./board";
import { AttainmentOverview } from "./overview";
import { AttainmentProgress } from "./progress";
import { AttainmentForecastView } from "./forecast-view";
import { canReadReportingScope } from "../../authz/forecast-scope";

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
  } = await getMessages();
  if (selection.invalid) return <EmptyState title={PT.invalidScope} />;
  const periods = offeredPeriods();
  const owners = [
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
  const plan = await loadAttainmentPlan(
    selection.period === "all"
      ? new Date(data.observedAt).getUTCFullYear()
      : Number(selection.period.replace(/^Y/, "").slice(0, 4)),
  );
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
    can(session.authz, session.entitlement, "pipeline.forecast.snapshot", "ui")
      .allowed &&
    totals !== null;
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
            : T.wholeTeam
        }
        canSubmit
        onSubmit={submitForecastSnapshot}
        onPrepare={prepareForecastSnapshot}
      />
    ) : null;
  return (
    <ViewLayout>
      <ModuleHeadline
        className="[&>div:last-child]:max-w-full [&>div:last-child>div]:min-w-0 [&>div:last-child>div]:max-w-full"
        moduleKey="attainment"
        description={T.why}
        action={
          <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-sm">
            <AttainmentControls
              period={selection.period}
              selection={selection.selection}
              view={selection.view}
              year={periods.year}
              quarters={periods.quarters}
              owners={owners}
              territories={territories}
              allowWorkspace={session.scope.kind === "workspace"}
            />
            {submit}
          </div>
        }
      />
      <AttainmentViewTabs value={selection.view} />
      {selection.view !== "history" &&
      (selection.period !== "all" || selection.view === "progress") ? (
        <AttainmentOverview selection={selection} />
      ) : null}
      {selection.period === "all" ? (
        selection.view !== "progress" ? (
          <EmptyState title={T.choosePeriod} description={T.choosePeriodHint} />
        ) : null
      ) : selection.view === "progress" ? (
        <AttainmentProgress selection={selection} />
      ) : !forecastGate.allowed ? (
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
        />
      )}
    </ViewLayout>
  );
}
