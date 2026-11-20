import type { FocusChange } from "./focus-model";
import type { PlanContent } from "./plan-model";
import { demand, minor } from "./plan-values";
import { planningEntryLocked, prunePlanningBudgets } from "./plan-entry-state";

/** Pure edits of the existing regional aggregate; never changes customer master data. */
export function applyFocusChange(content: PlanContent, change: FocusChange, accounts: readonly { id: string; name: string; tier: string }[], locked: readonly string[], key: () => string, at: string) {
  const next = structuredClone(content);
  const account = (id: string) => { const a = accounts.find(a => a.id === id); demand(a, "account_unknown"); return a; };
  const region = (id: string) => demand(next.regions.some(r => r.id === id && r.included), "region_unknown");
  const unlocked = (entry: Parameters<typeof planningEntryLocked>[2]) => demand(!planningEntryLocked(next, locked, entry), "closed_period_changed");
  if (change.kind === "add" || change.kind === "action") {
    region(change.regionId);
    const ids = change.kind === "add" ? [...new Set(change.accountIds)] : [change.accountId];
    demand(ids.length > 0 && ids.length <= 100, "invalid_action");
    demand(typeof change.objective === "string" && change.objective.trim().length > 0 && change.objective.length <= 1000, "invalid_action");
    for (const id of ids) {
      account(id);
      const old = change.kind === "action" && change.key ? next.actions.find(a => a.key === change.key && a.accountId === id) : null;
      demand(change.kind !== "action" || !change.key || old, "invalid_action");
      if (old) unlocked(old);
      const action = { key: old?.key ?? key(), accountId: id, regionId: change.regionId, objective: change.objective.trim(), ownerSub: change.ownerSub, due: change.due, targetKey: old?.regionId === change.regionId ? old.targetKey : null, evidenceRefs: old?.evidenceRefs ?? [] };
      unlocked(action);
      if (old) Object.assign(old, action); else next.actions.push(action);
    }
  } else if (change.kind === "removeAction") {
    account(change.accountId);
    const old = next.actions.find(a => a.key === change.key && a.accountId === change.accountId);
    demand(old, "invalid_action"); unlocked(old);
    next.actions = next.actions.filter(a => a !== old);
  } else if (change.kind === "remove") {
    account(change.accountId); region(change.regionId);
    const period = next.periods.find(p => p.key === change.period);
    demand(period, "invalid_period");
    const periods = new Set(next.periods.filter(p => period.start <= p.start && p.end <= period.end).map(p => p.key));
    const budgets = new Set(next.budgets.filter(b => b.accountId === change.accountId && periods.has(b.period)).map(b => b.key));
    const contributions = next.contributions.filter(c => c.regionId === change.regionId && budgets.has(c.budgetKey));
    const actions = next.actions.filter(a => a.regionId === change.regionId && a.accountId === change.accountId && period.start <= a.due && a.due < period.end);
    for (const c of contributions) { const t = next.targets.find(t => t.key === c.targetKey); demand(t, "invalid_target"); unlocked(t); }
    demand(contributions.length || actions.length, "account_unknown");
    actions.forEach(unlocked);
    next.contributions = next.contributions.filter(c => !contributions.includes(c));
    next.actions = next.actions.filter(a => !actions.includes(a));
  } else {
    const a = account(change.accountId); region(change.regionId);
    const target = next.targets.find(t => t.key === change.targetKey && t.scope === `territory:${change.regionId}`);
    demand(target, "invalid_target"); unlocked(target);
    minor(change.budget); minor(change.amount);
    demand(typeof change.note === "string" && change.note.length <= 8000, "invalid_budget");
    const old = change.key ? next.contributions.find(c => c.key === change.key && next.budgets.some(b => b.key === c.budgetKey && b.accountId === a.id)) : null;
    demand(!change.key || old, "invalid_contribution");
    if (old) { const t = next.targets.find(t => t.key === old.targetKey); demand(t, "invalid_target"); unlocked(t); }
    let budget = next.budgets.find(b => b.accountId === a.id && b.period === target.period && b.metric === target.metric && b.currency === target.currency);
    if (budget) {
      demand(budget.amount === change.budget || !next.contributions.some(c => c.budgetKey === budget!.key && next.targets.some(t => t.key === c.targetKey && planningEntryLocked(next, locked, t))), "closed_period_changed");
      if (budget.amount !== change.budget || budget.note !== change.note) budget.sourcePlanId = null;
      Object.assign(budget, { amount: change.budget, note: change.note, name: a.name, tier: a.tier });
    } else {
      budget = { key: key(), accountId: a.id, name: a.name, tier: a.tier, period: target.period, metric: target.metric, currency: target.currency, amount: change.budget, sourcePlanId: null, sourceReadAt: at, note: change.note };
      next.budgets.push(budget);
    }
    const contribution = { key: old?.key ?? key(), budgetKey: budget.key, targetKey: target.key, regionId: change.regionId, amount: change.amount, responsibility: change.responsibility };
    if (old) Object.assign(old, contribution); else next.contributions.push(contribution);
  }
  return prunePlanningBudgets(next, content);
}
