import type { AttainmentMetricTarget } from "../../domains/planning/attainment-plan";
import { cache } from "react";
import { can } from "../../authz/decide";
import { listAccounts } from "../../domains/account/service";
import { readPlanActionResults } from "../../domains/planning/action-result";
import { readCooperationHistory } from "../../domains/account/cooperation-service";
import { readFocusWorkspace } from "../../domains/planning/focus-read";
import { getSalesPlanStore } from "../../domains/shared/registry";
import {
  serializeAnalysisDeal,
  type AnalysisAccount,
} from "../../domains/pipeline/lib/attainment-analysis";
import {
  loadAttainmentBase,
  loadAttainmentPlan,
  loadAttainmentTeam,
} from "./board";

/** Request-scoped controlled read orchestration, shared with the page's assistant. */
export const loadAttainmentAnalysis = cache(
  async (year: number, period: string, revision: string | null) => {
    const data = await loadAttainmentBase();
    if (!data) return null;
    const [plan, accountResult, team, history, focus, actionResults] =
      await Promise.all([
        loadAttainmentPlan(year, revision),
        listAccounts({
          ...data.base,
          store: data.session.stores.account(),
        }).catch(() => null),
        loadAttainmentTeam(),
        readCooperationHistory({
          ...data.base,
          store: data.session.stores.account(),
        }).catch(() => null),
        readFocusWorkspace(
          {
            ...data.base,
            scope: data.session.scope,
            store: getSalesPlanStore(),
            accounts: data.session.stores.account(),
          },
          { year, period, revisionId: revision ?? undefined },
          { includeContactDetails: false },
        ).catch(() => null),
        readPlanActionResults(
          {
            ...data.base,
            scope: data.session.scope,
            store: getSalesPlanStore(),
            accounts: data.session.stores.account(),
          },
          { year, period, revisionId: revision ?? undefined },
        ).catch(() => null),
      ]);
    const accounts: AnalysisAccount[] | null = accountResult?.ok
      ? accountResult.value.map((a) => ({
          id: a.id,
          name: a.name,
          accountNo: a.accountNo,
          ownerSub: a.ownerSub,
          status: a.status,
          tier: a.tier,
          regionId: a.regionId ?? null,
        }))
      : null;
    const geographic = data.territories.ok ? data.territories.value : [];
    const regions = [
      ...new Map(
        [
          ...geographic.map((r) => ({ id: r.id, name: r.name })),
          ...(plan?.ok
            ? plan.value.regions
                .filter((r) => r.included)
                .map((r) => ({ id: r.id, name: r.name }))
            : []),
        ].map((r) => [r.id, r]),
      ).values(),
    ];
    return {
      years: data.plans?.map((p) => p.year) ?? [],
      year,
      period,
      observedAt: data.observedAt,
      currency: data.policy.ok ? data.policy.value.defaultCurrency : null,
      dealState: can(
        data.session.authz,
        data.session.entitlement,
        "pipeline.view",
        "data",
      ).allowed
        ? ("failed" as const)
        : ("denied" as const),
      accountState: can(
        data.session.authz,
        data.session.entitlement,
        "account.view",
        "data",
      ).allowed
        ? ("failed" as const)
        : ("denied" as const),
      self: data.session.user.sub,
      workspace: data.session.scope.kind === "workspace",
      completeRoster:
        data.session.scope.kind === "workspace" && !!accountResult?.ok,
      targets: plan?.ok
        ? (plan.value.metricTargets ??
          plan.value.targets.map((t): AttainmentMetricTarget => ({
            ...t,
            metric: "revenue",
          })))
        : null,
      revision: plan?.ok ? (plan.value.selected ?? plan.value.current) : null,
      current: plan?.ok ? plan.value.current : null,
      versions: plan?.ok ? plan.value.historical : [],
      regions,
      members:
        team?.members.map((m) => ({
          ...m,
          name: /[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(m.name) ? "" : m.name,
        })) ?? [],
      deals: data.deals.ok ? data.deals.value.map(serializeAnalysisDeal) : null,
      accounts,
      history: history?.ok
        ? history.value.map((h) => ({
            id: h.id,
            accountId: h.accountId,
            state: h.state,
            firstDate: h.firstDate,
            beforeYear: h.beforeYear,
            acquisitionOwnerSub: h.acquisitionOwnerSub,
            acquisitionTerritoryId: h.acquisitionTerritoryId,
            evidence: h.evidence,
            recordedAt: h.recordedAt,
            recordedBy: h.recordedBy,
            requestKey: h.requestKey,
          }))
        : null,
      actionResults,
      canVerifyAction: can(
        data.session.authz,
        data.session.entitlement,
        "planning.target.update",
        "ui",
      ).allowed,
      focus: focus
        ? { rows: focus.rows, revision: focus.revision, closed: focus.closed }
        : null,
      canPlan:
        data.session.scope.kind === "workspace" &&
        can(
          data.session.authz,
          data.session.entitlement,
          "planning.target.view",
          "ui",
        ).allowed,
      canEditAccount: can(
        data.session.authz,
        data.session.entitlement,
        "account.upsert",
        "ui",
      ).allowed,
      canForecast: can(
        data.session.authz,
        data.session.entitlement,
        "pipeline.forecast.view",
        "ui",
      ).allowed,
    };
  },
);
export type AttainmentAnalysis = NonNullable<
  Awaited<ReturnType<typeof loadAttainmentAnalysis>>
>;
