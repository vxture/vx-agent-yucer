import { fail, violation, type RuleResult } from "../../domains/shared/result";
import type { DataScope } from "../../authz/scope";
import type { AttainmentRow } from "../../domains/planning/service";
import type { TargetRecord } from "../../domains/planning/store";

/** A rejected source is unknown, never an empty successful result. */
export async function readBoardSource<T>(read: () => Promise<RuleResult<T>>): Promise<RuleResult<T>> {
  try { return await read(); }
  catch { return fail(violation("board_read_failed", "board source unavailable")); }
}
export function boardSourceFailed(result: { ok: boolean; violations?: readonly { code: string }[] }) {
  return !result.ok && !!result.violations?.some(v => v.code === "board_read_failed");
}

/** Pick one period and one hierarchy level, never sum company and regional goals. */
function revenueTargetRows(rows: readonly TargetRecord[], scope: DataScope, now = new Date()) {
  const year = now.getUTCFullYear();
  const visible = rows.filter(t => t.status === "committed" && t.metric === "revenue" && t.targetValue.unit === "money" && (
    scope.kind === "workspace" ? t.scopeType === "workspace" : scope.kind === "own" ? t.scopeType === "owner" && t.ownerSub === scope.sub :
      t.scopeType === "territory" && scope.territoryIds.includes(t.territoryId ?? "")
  ));
  const rank = (period: string) => {
    const annual = /^(?:Y)?(\d{4})$/.exec(period), quarter = /^(\d{4})Q([1-4])$/.exec(period);
    if (annual) return Number(annual[1]) >= year ? (Number(annual[1]) - year) * 10 : Infinity;
    if (quarter) return Number(quarter[1]) >= year ? (Number(quarter[1]) - year) * 10 + Number(quarter[2]) : Infinity;
    return Infinity;
  };
  const period = visible.filter(t => Number.isFinite(rank(t.period))).sort((a,b) => rank(a.period) - rank(b.period))[0]?.period;
  return visible.filter(t => t.period === period);
}

export function launcherRevenueTargets(rows: readonly TargetRecord[], scope: DataScope, now = new Date()) {
  const selected = revenueTargetRows(rows, scope, now);
  const sums = new Map<string, number>();
  for (const t of selected) if (t.targetValue.unit === "money") {
    sums.set(t.targetValue.currency, (sums.get(t.targetValue.currency) ?? 0) + t.targetValue.amount);
  }
  return [...sums].map(([currency, amount]) => ({ period: selected[0].period, currency, amount }));
}

/** Missing measurements must not become a measured zero or a partial total. */
export function launcherAttainment(rows: readonly AttainmentRow[], scope: DataScope, now = new Date()) {
  const targets = revenueTargetRows(rows.map(r => r.target), scope, now);
  const groups = launcherRevenueTargets(targets, scope, now);
  return groups.flatMap(group => {
    const selected = targets.filter(t => t.targetValue.unit === "money" && t.targetValue.currency === group.currency);
    let achieved = 0;
    for (const target of selected) {
      const measurement = rows.find(r => r.target.id === target.id)?.measurement;
      if (measurement?.kind !== "measured" || measurement.achieved.unit !== "money" || measurement.achieved.currency !== group.currency) return [];
      achieved += measurement.achieved.amount;
    }
    return group.amount > 0 ? [{ ...group, ratio: achieved / group.amount }] : [];
  });
}

/** Catalog lines have no member scope; intersect them with visible deals. */
export function pendingQuoteOpportunities(
  lines: readonly { opportunityId: string; needsApproval: boolean; approved: boolean }[],
  deals: readonly { id: string }[],
) {
  const visible = new Set(deals.map(d => d.id));
  return [...new Set(lines.filter(l => visible.has(l.opportunityId) && l.needsApproval && !l.approved).map(l => l.opportunityId))];
}
