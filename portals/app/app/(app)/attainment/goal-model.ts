import type { AttainmentAnalysis } from "./analysis-board";
import {
  analysisRow,
  verifiedNewLogos,
} from "../../domains/pipeline/lib/attainment-analysis";
import { periodRange } from "../../domains/shared/period";

export type GoalState = "achieved" | "attention" | "unverified" | "inProgress";
export function customerGoalRows(
  data: AttainmentAnalysis,
  scope = "workspace",
) {
  return (data.focus?.rows ?? [])
    .filter((a) =>
      scope.startsWith("territory:")
        ? a.regions.some((r) => r.id === scope.slice(10))
        : scope.startsWith("owner:")
          ? a.ownerSub === scope.slice(6)
          : true,
    )
    .map((account) => {
      const contributions = account.contributions.filter(
        (c) =>
          !scope.startsWith("territory:") || c.regionId === scope.slice(10),
      );
      const deals =
        data.deals?.filter((d) => d.accountId === account.id) ?? null;
      const budgets = [
        ...new Map(
          [
            ...contributions.map((c) => c.budget),
            ...(scope.startsWith("territory:") ? [] : account.unallocated),
          ].map((b) => [b.key, b]),
        ).values(),
      ];
      const numeric = budgets.map((b) => {
        const row = analysisRow({
          scope,
          name: account.name,
          period: b.period,
          currency: b.currency ?? data.currency ?? "CNY",
          targets: [],
          deals,
          observedAt: data.observedAt,
          unavailable: data.dealState,
        });
        const actual =
          b.metric === "revenue"
            ? row.closed.value
            : b.metric === "pipeline"
              ? !!periodRange(b.period) &&
                periodRange(b.period)!.end.toISOString() <= data.observedAt
                ? null
                : row.open.value
              : b.metric === "new_logo"
                ? verifiedNewLogos(
                    data.history,
                    data.accounts?.filter((a) => a.id === account.id) ?? [],
                    scope,
                    b.period,
                    data.completeRoster,
                  ).value
                : null;
        const allocated = contributions.filter((c) => c.budget.key === b.key);
        const target =
          scope.startsWith("territory:") || b.amount === null
            ? allocated.length
              ? Math.round(
                  allocated.reduce((n, c) => n + Number(c.amount), 0) * 100,
                ) / 100
              : null
            : Number(b.amount);
        const range = periodRange(b.period),
          due = range
            ? new Date(range.end.getTime() - 1).toISOString().slice(0, 10)
            : null;
        const state: GoalState =
          actual === null || target === null
            ? "unverified"
            : actual >= target
              ? "achieved"
              : due && due < data.observedAt.slice(0, 10)
                ? "attention"
                : "inProgress";
        return {
          key: b.key,
          kind: "numeric" as const,
          metric: b.metric,
          period: b.period,
          currency: b.currency,
          target,
          actual,
          due,
          state,
        };
      });
      // Execution/visit plans are not customer outcome indicators.
      return { account, goals: numeric };
    })
    .filter((row) => row.goals.length > 0);
}
export function customerGoalSummary(
  data: AttainmentAnalysis,
  scope = "workspace",
) {
  const rows = customerGoalRows(data, scope),
    goals = rows.flatMap((r) => r.goals);
  return {
    accounts: rows.length,
    total: goals.length,
    attention: goals.filter((g) => g.state === "attention").length,
    unverified: goals.filter((g) => g.state === "unverified").length,
    achieved: goals.filter((g) => g.state === "achieved").length,
  };
}
