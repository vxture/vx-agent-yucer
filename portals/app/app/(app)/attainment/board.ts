import { cache } from "react";
import { listAccounts } from "../../domains/account/service";
import { listPipeline } from "../../domains/pipeline/service";
import {
  attainment,
  listTargets,
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
} from "../../domains/shared/registry";
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
  const [deals, targets, territories, policy] = await Promise.all([
    listPipeline(
      { ...base, store: session.stores.pipeline() },
      { includeClosed: true },
    ),
    listTargets({ ...base, store: getPlanningStore() }),
    listTerritories({ ...base, store: getPlanningStore() }),
    pricingPolicy({ ...base, store: getCatalogStore() }),
  ]);
  return { session, base, deals, targets, territories, policy };
});

export const loadPublishedAttainment = cache(async (period: string) => {
  const data = await loadAttainmentBase();
  if (!data) return null;
  return attainment({ ...data.base, store: getPlanningStore() }, period);
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
