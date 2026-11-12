import Link from "next/link";
import { Button, EmptyState } from "@vxture/design-ui";
import { can } from "../../authz/decide";
import { canReadReportingScope } from "../../authz/forecast-scope";
import { periodRange, within } from "../../domains/shared/period";
import { getMessages } from "../lib/i18n/server";
import { executionRow, scopePlanSupport } from "../lib/attainment-progress";
import {
  compareAttainmentPeriods,
  planningHref,
  revenuePool,
  type resolveAttainmentQuery,
} from "../lib/attainment-workspace";
import { resolveLocale } from "../lib/i18n/locale";
import { formatMoney } from "../lib/view-model";
import { AttainmentTargets } from "../components/attainment-targets";
import { AttainmentReport } from "../components/attainment-report";
import {
  loadAttainmentBase,
  loadAttainmentPlan,
  loadAttainmentReport,
} from "./board";

type Selection = ReturnType<typeof resolveAttainmentQuery>;

export async function AttainmentOverview({
  selection,
}: {
  readonly selection: Selection;
}) {
  const data = await loadAttainmentBase();
  if (!data) return null;
  const { ATTAINMENT_PLAN_TEXT: T } = await getMessages();
  if (!data.plans || !data.policy.ok)
    return <EmptyState title={T.loadFailed} />;
  const defaultCurrency = data.policy.value.defaultCurrency;
  const { period, scopeKey } = selection;
  const selectedPlan =
    period === "all"
      ? { ok: true as const, value: data.plans[0] }
      : await loadAttainmentPlan(Number(period.replace(/^Y/, "").slice(0, 4)));
  if (!selectedPlan?.ok) return <EmptyState title={T.loadFailed} />;
  const plan = selectedPlan.value;
  const plans = data.plans;
  const locale = await resolveLocale();
  const canPlan =
    data.session.scope.kind === "workspace" &&
    can(
      data.session.authz,
      data.session.entitlement,
      "planning.target.view",
      "ui",
    ).allowed;
  const makeRow = (
    p: typeof plan,
    scope: string,
    rowPeriod: string,
    name: string,
  ) =>
    executionRow({
      scope,
      period: rowPeriod,
      name,
      target:
        p.targets.find(
          (t) =>
            t.scope === scope &&
            t.period === rowPeriod &&
            t.currency === defaultCurrency,
        ) ??
        p.targets.find((t) => t.scope === scope && t.period === rowPeriod) ??
        null,
      deals: data.deals.ok ? data.deals.value : null,
      defaultCurrency,
    });
  const regionName = (id: string | null) =>
    plan.regions.find((r) => r.id === id)?.name ??
    (data.rawTerritories.ok
      ? data.rawTerritories.value.find((r) => r.id === id)?.name
      : null) ??
    T.region;
  const scopeName =
    selection.scope.scopeType === "workspace"
      ? T.company
      : selection.scope.scopeType === "owner"
        ? T.personal
        : regionName(selection.scope.territoryId);
  if (period === "all")
    return (
      <AttainmentTargets
        row={null}
        periods={[]}
        regions={[]}
        regionPeriods={{}}
        plan={scopePlanSupport(plan, scopeKey, false)}
        plans={plans.map((p) => scopePlanSupport(p, scopeKey, false))}
        canPlan={canPlan}
        selectionScope={selection.selection}
        allRows={plans.flatMap((p) =>
          [
            ...new Set(
              p.targets
                .filter((t) => t.scope === scopeKey)
                .map((t) => t.period),
            ),
          ]
            .sort(compareAttainmentPeriods)
            .map((period) => makeRow(p, scopeKey, period, scopeName)),
        )}
      />
    );
  const row = makeRow(plan, scopeKey, period, scopeName);
  const periods = /^Y\d{4}$/.test(period)
    ? [
        ...new Set(
          plan.targets
            .filter((t) => t.scope === scopeKey && t.period !== period)
            .map((t) => t.period),
        ),
      ]
        .sort(compareAttainmentPeriods)
        .map((period) => makeRow(plan, scopeKey, period, scopeName))
    : [];
  const geographicIds = new Set([
    ...plan.regions.map((r) => r.id),
    ...(data.territories.ok ? data.territories.value.map((r) => r.id) : []),
  ]);
  const range = periodRange(period);
  const regionIds =
    selection.scope.scopeType === "workspace"
      ? [
          ...new Set([
            ...plan.regions.filter((r) => r.included).map((r) => r.id),
            ...plan.targets
              .filter(
                (t) =>
                  t.scope.startsWith("territory:") &&
                  t.period === period &&
                  geographicIds.has(t.scope.slice(10)),
              )
              .map((t) => t.scope.slice(10)),
            ...(data.deals.ok
              ? data.deals.value.flatMap((d) =>
                  d.territoryId &&
                  geographicIds.has(d.territoryId) &&
                  d.status === "won" &&
                  range &&
                  within(range, d.closedAt)
                    ? [d.territoryId]
                    : [],
                )
              : []),
          ]),
        ]
      : [];
  const regions = regionIds
    .filter((id) =>
      canReadReportingScope(
        data.session.scope,
        { scopeType: "territory", territoryId: id, ownerSub: null },
        data.session.user.sub,
      ),
    )
    .map((id) => makeRow(plan, `territory:${id}`, period, regionName(id)));
  const regionPeriods = Object.fromEntries(
    regions.map((r) => [
      r.scope,
      /^Y\d{4}$/.test(period)
        ? [
            ...new Set(
              plan.targets
                .filter((t) => t.scope === r.scope && t.period !== period)
                .map((t) => t.period),
            ),
          ]
            .sort(compareAttainmentPeriods)
            .map((p) => makeRow(plan, r.scope, p, r.name))
        : [],
    ]),
  );
  const report = await loadAttainmentReport(period, scopeKey);
  const unallocated =
    scopeKey === "workspace" && data.deals.ok
      ? revenuePool(
          data.deals.value.filter(
            (d) => !d.territoryId || !regionIds.includes(d.territoryId),
          ),
          period,
          selection.scope,
          row.currency,
        )
      : null;
  const unallocatedClosed = unallocated?.totals.ok
    ? unallocated.totals.value.closedAmount.amount
    : null;
  const canHistory = can(
    data.session.authz,
    data.session.entitlement,
    "pipeline.forecast.view",
    "ui",
  ).allowed;
  return (
    <>
      {selection.planRevision &&
      !plan.historical.some((r) => r.id === selection.planRevision) ? (
        <p role="status" className="text-body-small text-muted-foreground">
          {T.contextMissing}
        </p>
      ) : selection.planRevision &&
        selection.planRevision !== plan.current?.id ? (
        <p className="text-body-small text-muted-foreground">
          {T.contextHint}
          {canPlan ? (
            <>
              {" "}
              <Link
                className="no-underline hover:text-primary-text"
                href={planningHref(
                  plan.year,
                  selection.scope.territoryId,
                  selection.planRevision,
                  period,
                )}
              >
                {T.planContext}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {!row.target && canPlan && selection.scope.scopeType !== "owner" ? (
        <div className="flex items-center justify-between gap-md">
          <span className="text-body-small text-muted-foreground">
            {plan.scheduled
              ? `${T.none} · V${plan.scheduled.version} ${T.effectiveAt} ${new Date(plan.scheduled.effectiveAt).toLocaleString(locale, { timeZone: "UTC" })} UTC`
              : T.none}
          </span>
          <Button asChild size="xl" variant="outline">
            <Link
              href={planningHref(
                plan.year,
                plan.regions.some((r) => r.id === selection.scope.territoryId)
                  ? selection.scope.territoryId
                  : null,
              )}
            >
              {T.planning}
            </Link>
          </Button>
        </div>
      ) : null}
      <AttainmentTargets
        row={row}
        periods={periods}
        regions={regions}
        regionPeriods={regionPeriods}
        plan={scopePlanSupport(plan, scopeKey)}
        canPlan={canPlan}
        selectionScope={selection.selection}
        supportDeals={
          data.deals.ok &&
          plan.support.budgets.length &&
          selection.scope.scopeType !== "owner"
            ? data.deals.value
                .filter(
                  (d) =>
                    d.status === "won" &&
                    plan.support.budgets.some(
                      (b) => b.accountId === d.accountId,
                    ) &&
                    (selection.scope.scopeType === "workspace" ||
                      selection.scope.territoryId === d.territoryId),
                )
                .map(
                  ({
                    id,
                    accountId,
                    territoryId,
                    ownerSub,
                    amount,
                    closedAt,
                  }) => ({
                    id,
                    accountId,
                    territoryId,
                    ownerSub,
                    amount,
                    closedAt,
                  }),
                )
            : null
        }
        report={
          <AttainmentReport
            snapshot={report?.ok ? report.value : null}
            error={!!report && !report.ok}
            period={period}
            scope={selection.selection}
            currentRevision={row.target?.revision?.id ?? null}
            canHistory={canHistory}
            canPlan={canPlan}
          />
        }
      />
      {unallocatedClosed !== null && unallocatedClosed > 0 ? (
        <p
          className="text-body-small text-muted-foreground"
          title={T.unallocatedHint}
        >
          {T.unallocated} {formatMoney(unallocatedClosed, row.currency, locale)}
        </p>
      ) : null}
    </>
  );
}
