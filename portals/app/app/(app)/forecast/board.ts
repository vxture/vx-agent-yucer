import { getCatalogStore, getPlanningStore } from "../../domains/shared/registry";
import { forecastChange, forecastHistory, forecastScorecard, previewCategories } from "../../domains/pipeline/service";
import { inPeriod, inScope, type ForecastScope } from "../../domains/pipeline/lib/forecast";
import { listTerritories } from "../../domains/planning/service";
import { unverifiedAmounts } from "../../domains/pipeline/lib/unverified";
import { assessDeals } from "../pipeline/deal-assessments";
import type { AppSession } from "../lib/session";

// Everything 预测检视台 computes for one period and scope, in one place
// (deal batch 9e). The page renders it; 预测会简报 hands the same numbers to the
// 参谋 - "数字全部来自规则，模型只写叙述" (YC-066) - so the briefing can only
// ever repeat what the page shows.

export async function forecastBoard(session: AppSession, period: string, scope: ForecastScope, rivalWords: readonly string[]) {
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
  const [preview, history, score, territories, change] = await Promise.all([
    previewCategories(ctx),
    // The series, not the latest point - the only reader that makes
    // forecast_snapshot's immutability pay for itself.
    forecastHistory(ctx, period, scope),
    forecastScorecard({ ...ctx, catalog: getCatalogStore() }, period, { scope }),
    listTerritories({ ...ctx, store: getPlanningStore() }),
    // 快照间变化 (batch 9c). A failed read hides the block rather than failing
    // the page (YC-067 section 11: 任一批量读失败，依赖它的列显示读不到).
    forecastChange({ ...ctx, catalog: getCatalogStore() }, period, scope).catch(() => undefined),
  ]);
  if (!preview.ok) return { ok: false as const, violations: preview.violations };

  // THE PERIOD AND SCOPE GOVERN THE LIST TOO. The same two rules the snapshot
  // applies (inPeriod: an open deal by its expected close, a closed one by its
  // close; inScope: territory or owner), so the figures here and the point a
  // snapshot would record describe the same deals.
  const all = preview.value.map((p) => p.opportunity);
  const windowed = inPeriod(all, period);
  const kept = new Set(inScope(windowed ? windowed.kept : all, scope).map((o) => o.id));
  const inView = preview.value.filter((p) => kept.has(p.opportunity.id));
  // Owners from the whole book, not the window: an owner with nothing this
  // quarter is still one somebody may want to look at this quarter for.
  const ownerOptions = [...new Set(all.map((o) => o.ownerSub).filter((o): o is string => !!o))].sort((a, b) => a.localeCompare(b));
  const territoryOptions = territories.ok ? territories.value.map((t) => ({ id: t.id, name: t.name })) : [];

  // 未经证实金额 (batch 9d): 承诺 and 乐观 in view, each deal judged as its own
  // page judges it. A failed assessment hides the block (never "all proven").
  const atStake = inView.filter(
    (p) => p.opportunity.status === "open" && (p.opportunity.forecastCategory === "commit" || p.opportunity.forecastCategory === "best_case"),
  );
  const assessed = await assessDeals(session, atStake, rivalWords).catch(() => null);
  const unverified = assessed
    ? unverifiedAmounts(
        atStake.flatMap((p) => {
          const a = assessed.get(p.opportunity.id);
          return a ? [{ ...a, name: p.opportunity.name, category: p.opportunity.forecastCategory, amount: p.opportunity.amount?.amount ?? 0 }] : [];
        }),
        ["commit", "best_case"],
      )
    : null;

  return {
    ok: true as const,
    preview,
    inView,
    ownerOptions,
    territoryOptions,
    points: history.ok ? history.value : [],
    score,
    change,
    unverified,
  };
}
