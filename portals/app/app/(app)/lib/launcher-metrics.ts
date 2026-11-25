import { fail, violation, type RuleResult } from "../../domains/shared/result";
import type { DataScope } from "../../authz/scope";
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
export function launcherRevenueTargets(rows: readonly TargetRecord[], scope: DataScope, now = new Date()) {
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
  const sums = new Map<string, number>();
  for (const t of visible.filter(t => t.period === period)) if (t.targetValue.unit === "money") {
    sums.set(t.targetValue.currency, (sums.get(t.targetValue.currency) ?? 0) + t.targetValue.amount);
  }
  return [...sums].map(([currency, amount]) => ({ period: period!, currency, amount }));
}
