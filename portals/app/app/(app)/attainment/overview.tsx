import Link from "next/link";
import { Button, EmptyState } from "@vxture/design-ui";
import { can } from "../../authz/decide";
import { canReadReportingScope } from "../../authz/forecast-scope";
import { periodRange, within } from "../../domains/shared/period";
import { getMessages } from "../lib/i18n/server";
import { executionRow, scopePlanSupport, unallocatedExecutionRow } from "../lib/attainment-progress";
import {
  compareAttainmentPeriods,
  planningHref,
  type resolveAttainmentQuery,
} from "../lib/attainment-workspace";
import { resolveLocale } from "../lib/i18n/locale";
import { AttainmentTargets } from "../components/attainment-targets";
import {
  loadAttainmentBase,
  loadAttainmentPlan,
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
  const canReadSelection = canReadReportingScope(
    data.session.scope,
    selection.scope,
    data.session.user.sub,
  );
  const visibleRegionIds = (p: typeof plan, rowPeriod: string) => {
    const geographicIds = new Set([
      ...p.regions.map((r) => r.id),
      ...(data.territories.ok ? data.territories.value.map((r) => r.id) : []),
    ]);
    const range = rowPeriod === "all" ? null : periodRange(rowPeriod);
    return [
      ...new Set([
        ...p.regions.filter((r) => r.included).map((r) => r.id),
        ...p.targets
          .filter(
            (t) =>
              t.scope.startsWith("territory:") &&
              (rowPeriod === "all" || t.period === rowPeriod) &&
              geographicIds.has(t.scope.slice(10)),
          )
          .map((t) => t.scope.slice(10)),
        ...(data.deals.ok
          ? data.deals.value.flatMap((d) =>
              d.territoryId &&
              geographicIds.has(d.territoryId) &&
              d.status === "won" &&
              (range
                ? within(range, d.closedAt)
                : d.closedAt?.getUTCFullYear() === p.year)
                ? [d.territoryId]
                : [],
            )
          : []),
      ]),
    ].filter((id) =>
      canReadReportingScope(
        data.session.scope,
        { scopeType: "territory", territoryId: id, ownerSub: null },
        data.session.user.sub,
      ),
    );
  };
  const makeUnallocated = (
    p: typeof plan,
    rowPeriod: string,
    ids: readonly string[],
    includeEmpty = false,
  ) => canReadSelection && scopeKey === "workspace"
    ? unallocatedExecutionRow({
        name: T.unallocated,
        period: rowPeriod,
        regionIds: ids,
        deals: data.deals.ok ? data.deals.value : null,
        defaultCurrency,
        companyTarget: makeRow(p, "workspace", rowPeriod, T.company).target,
        regionTargets: ids.flatMap((id) => {
          const t = makeRow(p, `territory:${id}`, rowPeriod, regionName(id)).target;
          return t ? [t] : [];
        }),
        includeEmpty,
      })
    : null;
  if (period === "all") {
    return (
      <>
        {plans.map((p) => {
          const nameOfRegion = (id: string) =>
            p.regions.find((r) => r.id === id)?.name ?? regionName(id);
          const ids = visibleRegionIds(p, "all");
          const regionRows = selection.teamOverview
            ? ids.map((id) =>
                makeRow(p, `territory:${id}`, `Y${p.year}`, nameOfRegion(id)),
              )
            : [];
          const unallocated = makeUnallocated(p, `Y${p.year}`, ids);
          if (unallocated && selection.teamOverview) regionRows.push(unallocated);
          const allRows = canReadSelection
            ? [
                ...new Set(
                  p.targets
                    .filter((t) => t.scope === scopeKey)
                    .map((t) => t.period),
                ),
              ]
                .sort(compareAttainmentPeriods)
                .map((period) => makeRow(p, scopeKey, period, scopeName))
            : [];
          return (
            <AttainmentTargets
              key={p.year}
              row={null}
              periods={[]}
              regions={regionRows}
              regionPeriods={Object.fromEntries(
                regionRows.map((r) => [
                  r.scope,
                  [
                    ...new Set(
                      p.targets
                        .filter(
                          (t) => t.scope === (r.scope === "unallocated" ? "workspace" : r.scope) && t.period !== r.period,
                        )
                        .map((t) => t.period),
                    ),
                  ]
                    .sort(compareAttainmentPeriods)
                    .map((period) => r.scope === "unallocated"
                      ? makeUnallocated(p, period, ids, true)!
                      : makeRow(p, r.scope, period, r.name)),
                ]),
              )}
              plan={scopePlanSupport(p, scopeKey)}
              canPlan={canPlan}
              selectionScope={selection.selection}
              allRows={allRows.length ? allRows : undefined}
              expandPeriods={selection.teamOverview}
            />
          );
        })}
      </>
    );
  }
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
  const regionIds =
    selection.scope.scopeType === "workspace"
      ? visibleRegionIds(plan, period)
      : [];
  const regions = regionIds.map((id) =>
    makeRow(plan, `territory:${id}`, period, regionName(id)),
  );
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
  const unallocated = makeUnallocated(plan, period, regionIds);
  if (unallocated) {
    regions.push(unallocated);
    regionPeriods[unallocated.scope] = periods.map((p) =>
      makeUnallocated(plan, p.period, regionIds, true)!,
    );
  }
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
      {canReadSelection &&
      !row.target &&
      canPlan &&
      selection.scope.scopeType !== "owner" ? (
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
        row={canReadSelection ? row : null}
        expandPeriods={selection.teamOverview}
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
      />
    </>
  );
}
