import type { AttainmentAnalysis } from "./analysis-board";
import {
  customerProjects,
  type AnalysisDeal,
} from "../../domains/pipeline/lib/attainment-analysis";
import { dealDiagnosis } from "./deal-diagnosis";
import { customerGoalRows } from "./goal-model";
import { periodPhase } from "./progress-model";

export function personalCustomerGroups(
  data: AttainmentAnalysis,
  scope: string,
  personal: boolean,
) {
  if (!data.accounts || !data.deals) return [];
  const goals = customerGoalRows(data);
  const groups = customerProjects(
    data.accounts,
    data.deals,
    data.self,
    personal ? "workspace" : scope,
    data.period,
  )
    .filter(
      (g) => !personal || g.account.ownerSub === data.self || g.owned.length,
    )
    .map((g) => ({
      ...g,
      goals: goals.find((r) => r.account.id === g.account.id)?.goals ?? [],
    }));
  for (const goal of goals) {
    if (groups.some((g) => g.account.id === goal.account.id)) continue;
    const account = data.accounts.find((a) => a.id === goal.account.id);
    if (account && (!personal || account.ownerSub === data.self))
      groups.push({
        account,
        goals: goal.goals,
        projects: [],
        owned: [],
        other: [],
      });
  }
  return groups;
}
export function matchesProjectFilter(
  deal: AnalysisDeal,
  data: AttainmentAnalysis,
  filter: string,
) {
  const issues = dealDiagnosis(
    deal,
    data.observedAt,
    data.review?.[deal.id],
  ).issues;
  return (
    filter === "all" ||
    (filter === "commit" &&
      deal.status === "open" &&
      deal.forecastCategory === "commit") ||
    (filter === "missingBasis" &&
      issues.some((key) =>
        ["unpriced", "undated", "missingBasis"].includes(key),
      )) ||
    (filter === "delayed" && issues.includes("delayed")) ||
    (filter === "attention" && issues.length > 0)
  );
}
export function personalPending(data: AttainmentAnalysis) {
  if (
    !data.deals ||
    !data.accounts ||
    !data.focus ||
    data.review === null ||
    periodPhase(data.period, data.observedAt) === "ended"
  )
    return null;
  const deals = personalCustomerGroups(data, `owner:${data.self}`, true)
    .flatMap((g) => g.projects)
    .filter((d) => d.ownerSub === data.self && d.status === "open");
  const kinds = { delayed: 0, conditions: 0, missingBasis: 0, goals: 0 };
  for (const d of deals) {
    const diagnosis = dealDiagnosis(d, data.observedAt, data.review?.[d.id]);
    if (diagnosis.kind === "delayed") kinds.delayed++;
    else if (diagnosis.kind === "conditions") kinds.conditions++;
    else if (diagnosis.issues.length) kinds.missingBasis++;
  }
  kinds.goals = customerGoalRows(data)
    .filter((r) => r.account.ownerSub === data.self)
    .flatMap((r) => r.goals)
    .filter((g) => g.state === "attention" || g.state === "unverified").length;
  return { kinds, total: Object.values(kinds).reduce((n, v) => n + v, 0) };
}
