import type { StrategyAcceptance } from "../../domains/planning/strategy-handoff";
import { acceptanceSummary } from "../../domains/planning/strategy-acceptance-workspace";

export type CompanyHandoffDraft = { active: string; choices: StrategyAcceptance[]; selected: string[] };
export function toggleCompanyStrategy(draft: CompanyHandoffDraft, strategyId: string, checked: boolean, lockedPeriods: readonly string[]) {
  const selected = new Set(draft.selected);
  for (const x of draft.choices.filter(x => x.strategyId === strategyId)) {
    if (checked) selected.add(x.key);
    else if (!x.allocations.some(a => lockedPeriods.includes(a.period))) selected.delete(x.key);
  }
  return { ...draft, selected: [...selected] };
}
export function companyHandoffSummary(draft: CompanyHandoffDraft) {
  const rows = draft.choices.filter(x => draft.selected.includes(x.key));
  try { return { strategies: new Set(rows.map(x => x.strategyId)).size, metrics: rows.length, totals: acceptanceSummary(rows), invalid: false }; }
  catch { return { strategies: new Set(rows.map(x => x.strategyId)).size, metrics: rows.length, totals: [], invalid: true }; }
}
