import { EmptyState } from "@vxture/design-ui";
import { resolveAppSession } from "../../(app)/lib/session";
import { getMessages } from "../../(app)/lib/i18n/server";
import { SignIn } from "../../(app)/components/sign-in";
import { can } from "../../authz/decide";
import { getCatalogStore, getPlanningStore, getStrategyStore, getSalesPlanStore } from "../../domains/shared/registry";
import { marketComparisonKey } from "../../domains/strategy/lib/diagnostic-snapshots";
import { planVersions } from "../../domains/planning/plan-model";
import { listSegments, strategyDiagnosticSnapshots } from "../../domains/strategy/service";
import { listTerritories } from "../../domains/planning/service";
import { StrategyDiagScreen } from "../components/strategy-diag-screen";
import { strategyDiagnosticView } from "../lib/strategy-diagnostics";

// 战略诊断 - strategy diagnostics screen (batch 11c).
//
// Reads the snapshot tables created in batch 11a and renders three panels:
// segment coverage trend ranking, territory attainment comparison, and
// "false fat" warnings (pipeline amount growing while customer count is
// stagnant). Same (screen) route group as 全国态势屏 and 赋能分析 -
// chromeless, dark ground, meant for a wall display.
//
// GATED ON strategy.plan.view - the same action that gates the strategy
// domain page. No new permission point: this screen only reads what the
// strategy domain already allows.

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function StrategyDiagPage() {
  const { STRATEGY_DIAG_TEXT: T } = await getMessages();
  const session = await resolveAppSession();

  if (!session) {
    return <SignIn />;
  }

  if (!can(session.authz, session.entitlement, "strategy.plan.view", "ui").allowed) {
    return (
      <EmptyState
        title={T.deniedTitle}
        description={T.deniedDescription}
      />
    );
  }

  // Through the domain services, not Prisma (2026-09-27 walkthrough): the
  // page used to query the tables itself, past the data gate and past the
  // store layer - which also made it crash wherever there is no database.
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const now = new Date();
  const [snapshots, segmentsRead, territoriesRead, policy, plans] = await Promise.all([
    strategyDiagnosticSnapshots({ ...base, store: getStrategyStore() }, 10_000, new Date(now.getTime() - WINDOW_DAYS * 86_400_000)),
    listSegments({ ...base, store: getStrategyStore() }),
    listTerritories({ ...base, store: getPlanningStore() }, { includeRetired: true }),
    getCatalogStore().getPricingPolicy(session.workspaceId),
    getSalesPlanStore().list(session.workspaceId),
  ]);
  if (!snapshots.ok) {
    return <EmptyState title={T.deniedTitle} description={T.deniedDescription} />;
  }
  const view = strategyDiagnosticView({
    ...snapshots.value,
    segmentNames: new Map(segmentsRead.ok ? segmentsRead.value.filter(s => s.status === "active").map(s => [s.id, s.name]) : []),
    territoryNames: new Map(territoriesRead.ok ? territoriesRead.value.map(t => [t.id, t.name]) : []),
    currentMarketBasis: new Map(segmentsRead.ok ? segmentsRead.value.map(s => [s.id, marketComparisonKey(s.criteria, policy.defaultCurrency)]) : []),
    currentRevisions: new Set(plans.flatMap(p => { const r = planVersions(p, now.toISOString()).current; return r ? [r.id] : []; })),
    currency: policy.defaultCurrency, now, windowDays: WINDOW_DAYS,
  });
  return <StrategyDiagScreen {...view} currency={policy.defaultCurrency} windowDays={WINDOW_DAYS} />;
}
