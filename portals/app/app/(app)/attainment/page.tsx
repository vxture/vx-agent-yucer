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
import { submitForecastSnapshot } from "../pipeline/forecast-action";
import { loadAttainmentBase } from "./board";
import { AttainmentOverview } from "./overview";
import { AttainmentProgress } from "./progress";
import { AttainmentForecastView } from "./forecast-view";

export const dynamic = "force-dynamic";

export default async function AttainmentPage({
  searchParams,
}: {
  searchParams: Promise<AttainmentQuery>;
}) {
  const data = await loadAttainmentBase();
  if (!data) return null;
  const { session } = data;
  const selection = resolveAttainmentQuery(
    await searchParams,
    session.user.sub,
  );
  const {
    ATTAINMENT_TEXT: { workspace: T },
    PIPELINE_TEXT,
  } = await getMessages();
  const periods = offeredPeriods();
  const owners = [
    ...new Set([
      session.user.sub,
      ...(data.deals.ok ? data.deals.value.map((d) => d.ownerSub) : []),
      ...(data.targets.ok
        ? data.targets.value.flatMap((t) => (t.ownerSub ? [t.ownerSub] : []))
        : []),
    ]),
  ];
  const territories = data.territories.ok
    ? data.territories.value.map((t) => ({ id: t.id, name: t.name }))
    : [];
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
  const computed = totals
    ? [
        {
          key: "commit",
          label: PIPELINE_TEXT.tCommit,
          amount: totals.commitAmount.amount,
        },
        {
          key: "bestCase",
          label: PIPELINE_TEXT.tBestCase,
          amount: totals.bestCaseAmount.amount,
        },
        {
          key: "pipeline",
          label: PIPELINE_TEXT.tPipeline,
          amount: totals.pipelineAmount.amount,
        },
        {
          key: "closed",
          label: PIPELINE_TEXT.tClosed,
          amount: totals.closedAmount.amount,
        },
      ]
    : [];
  const submit =
    selection.period !== "all" && canSubmit ? (
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
        computed={computed}
        onSubmit={submitForecastSnapshot}
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
            />
            {submit}
          </div>
        }
      />
      <AttainmentViewTabs value={selection.view} />
      <AttainmentOverview selection={selection} />
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
        />
      )}
    </ViewLayout>
  );
}
