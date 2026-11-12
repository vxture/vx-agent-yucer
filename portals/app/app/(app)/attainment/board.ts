import { cache } from "react";
import {
  listAccounts,
  listMarketDivisions,
} from "../../domains/account/service";
import {
  listPipeline,
} from "../../domains/pipeline/service";
import { attainmentTeamMembers } from "../lib/attainment-team";
import { getAuthzStore } from "../../authz/store";
import { listWorkspaceMembers } from "../../authz/admin";
import {
  listOrgUnits,
  listOrgMembers,
  listTerritories,
} from "../../domains/planning/service";
import {
  listProducts,
  listOpportunityLines,
  pricingPolicy,
} from "../../domains/catalog/service";
import {
  getCatalogStore,
  getPlanningStore,
  getSalesPlanStore,
} from "../../domains/shared/registry";
import { readAttainmentPlans } from "../../domains/planning/attainment-plan";
import { canReadReportingScope } from "../../authz/forecast-scope";
import { salesRegionTerritories } from "../lib/sales-regions";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { forecastBoard } from "../forecast/board";
import { parseForecastScope } from "../lib/forecast-scope";

// Shared by the page and the parallel assistant route within one request.
export const loadAttainmentBase = cache(async () => {
  const session = await resolveAppSession();
  if (!session) return null;
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const observedAt = new Date().toISOString();
  const [deals, territories, policy, divisions, plans] = await Promise.all([
    listPipeline(
      { ...base, store: session.stores.pipeline() },
      { includeClosed: true },
    ),
    listTerritories(
      { ...base, store: getPlanningStore() },
      { includeRetired: true },
    ),
    pricingPolicy({ ...base, store: getCatalogStore() }),
    listMarketDivisions({ ...base, store: session.stores.account() }),
    readAttainmentPlans({
      ...base,
      scope: session.scope,
      store: getSalesPlanStore(),
      targets: getPlanningStore(),
      now: () => new Date(observedAt),
    }).catch(() => null),
  ]);
  return {
    session,
    base,
    deals,
    policy,
    observedAt,
    plans,
    rawTerritories: territories.ok
      ? {
          ...territories,
          value: territories.value.filter((t) =>
            canReadReportingScope(
              session.scope,
              { scopeType: "territory", territoryId: t.id, ownerSub: null },
              session.user.sub,
            ),
          ),
        }
      : territories,
    territories:
      territories.ok && divisions.ok
        ? {
            ...territories,
            value: salesRegionTerritories(
              divisions.value,
              territories.value,
            ).filter((t) =>
              canReadReportingScope(
                session.scope,
                { scopeType: "territory", territoryId: t.id, ownerSub: null },
                session.user.sub,
              ),
            ),
          }
        : !territories.ok
          ? territories
          : divisions,
  };
});

export const loadAttainmentPlan = cache(async (year: number) => {
  const data = await loadAttainmentBase();
  if (!data) return null;
  if (!data.plans) return { ok: false as const };
  return {
    ok: true as const,
    value: data.plans.find((p) => p.year === year) ?? {
      year,
      observedAt: data.observedAt,
      current: null,
      baseline: null,
      scheduled: null,
      historical: [],
      targets: [],
      regions: [],
      support: { budgets: [], contributions: [], team: [], actions: [] },
      supportRestricted: true,
    },
  };
});

export const loadAttainmentComposition = cache(async () => {
  const data = await loadAttainmentBase();
  if (!data) return null;
  const ctx = { ...data.base, store: getCatalogStore() };
  const [lines, products, accounts] = await Promise.all([
    listOpportunityLines(ctx),
    listProducts(ctx),
    listAccounts({ ...data.base, store: data.session.stores.account() }),
  ]);
  return { lines, products, accounts };
});

export const loadForecastWorkspace = cache(
  async (period: string, scopeKey: string) => {
    const session = await resolveAppSession();
    if (!session) return null;
    const { POSITION_TEXT } = await getMessages();
    return forecastBoard(
      session,
      period,
      parseForecastScope(scopeKey),
      POSITION_TEXT.rivalWords,
    );
  },
);

export const loadAttainmentTeam = cache(async () => {
  const data = await loadAttainmentBase();
  if (!data) return null;
  const ctx = { ...data.base, store: getPlanningStore() };
  const [units, placements, members] = await Promise.all([
    listOrgUnits(ctx),
    listOrgMembers(ctx),
    listWorkspaceMembers({ ...data.base, store: getAuthzStore() }),
  ]);
  const self = {
    sub: data.session.user.sub,
    name: data.session.user.displayName ?? data.session.user.sub,
    unit: "",
  };
  if (!units.ok || !placements.ok || !members.ok)
    return { placed: false, restricted: true, members: [self] };
  const team = attainmentTeamMembers({
    sub: data.session.user.sub,
    access: data.session.scope,
    units: units.value,
    placements: placements.value,
    members: members.value,
  });
  return {
    ...team,
    restricted: data.session.scope.kind !== "workspace",
    members: team.members.some((m) => m.sub === self.sub)
      ? team.members
      : [self, ...team.members],
  };
});
