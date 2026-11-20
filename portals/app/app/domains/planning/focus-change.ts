import type { FocusChange } from "./focus-model";
import type { PlanContent } from "./plan-model";
import { demand, minor } from "./plan-values";
import { planningEntryLocked, prunePlanningBudgets } from "./plan-entry-state";
type Accounts = readonly { id: string; name: string; tier: string }[];
type Edit = { next: PlanContent; accounts: Accounts; locked: readonly string[]; key: () => string; at: string };
function account(edit: Edit, id: string) {
  const found = edit.accounts.find(a => a.id === id);
  demand(found, "account_unknown"); return found;
}
function region(edit: Edit, id: string) {
  demand(edit.next.regions.some(r => r.id === id && r.included), "region_unknown");
}
function unlocked(edit: Edit, entry: Parameters<typeof planningEntryLocked>[2]) {
  demand(!planningEntryLocked(edit.next, edit.locked, entry), "closed_period_changed");
}
function changeActions(edit: Edit, change: Extract<FocusChange, { kind: "add" | "action" }>) {
  region(edit, change.regionId);
  const ids = change.kind === "add" ? [...new Set(change.accountIds)] : [change.accountId];
  demand(ids.length > 0 && ids.length <= 100, "invalid_action");
  demand(typeof change.objective === "string" && change.objective.trim().length > 0 && change.objective.length <= 1000, "invalid_action");
  for (const id of ids) {
    account(edit, id);
    const old = change.kind === "action" && change.key ? edit.next.actions.find(a => a.key === change.key && a.accountId === id) : null;
    demand(change.kind !== "action" || !change.key || old, "invalid_action");
    if (old) unlocked(edit, old);
    const action = { key: old?.key ?? edit.key(), accountId: id, regionId: change.regionId, objective: change.objective.trim(), ownerSub: change.ownerSub, due: change.due, targetKey: old?.regionId === change.regionId ? old.targetKey : null, evidenceRefs: old?.evidenceRefs ?? [] };
    unlocked(edit, action);
    if (old) Object.assign(old, action); else edit.next.actions.push(action);
  }
}
function removeRegion(edit: Edit, change: Extract<FocusChange, { kind: "remove" }>) {
  const { next } = edit;
  account(edit, change.accountId); region(edit, change.regionId);
  const period = next.periods.find(p => p.key === change.period);
  demand(period, "invalid_period");
  const periods = new Set(next.periods.filter(p => period.start <= p.start && p.end <= period.end).map(p => p.key));
  const budgets = new Set(next.budgets.filter(b => b.accountId === change.accountId && periods.has(b.period)).map(b => b.key));
  const contributions = next.contributions.filter(c => c.regionId === change.regionId && budgets.has(c.budgetKey));
  const actions = next.actions.filter(a => a.regionId === change.regionId && a.accountId === change.accountId && period.start <= a.due && a.due < period.end);
  for (const c of contributions) {
    const target = next.targets.find(t => t.key === c.targetKey);
    demand(target, "invalid_target"); unlocked(edit, target);
  }
  demand(contributions.length || actions.length, "account_unknown");
  for (const action of actions) unlocked(edit, action);
  next.contributions = next.contributions.filter(c => !contributions.includes(c));
  next.actions = next.actions.filter(a => !actions.includes(a));
}
function changeContribution(edit: Edit, change: Extract<FocusChange, { kind: "contribution" }>) {
  const { next } = edit, customer = account(edit, change.accountId);
  region(edit, change.regionId);
  const target = next.targets.find(t => t.key === change.targetKey && t.scope === `territory:${change.regionId}`);
  demand(target, "invalid_target"); unlocked(edit, target);
  minor(change.budget); minor(change.amount);
  demand(typeof change.note === "string" && change.note.length <= 8000, "invalid_budget");
  const old = change.key ? next.contributions.find(c => c.key === change.key && next.budgets.some(b => b.key === c.budgetKey && b.accountId === customer.id)) : null;
  demand(!change.key || old, "invalid_contribution");
  if (old) {
    const previous = next.targets.find(t => t.key === old.targetKey);
    demand(previous, "invalid_target"); unlocked(edit, previous);
  }
  let budget = next.budgets.find(b => b.accountId === customer.id && b.period === target.period && b.metric === target.metric && b.currency === target.currency);
  if (budget) {
    demand(budget.amount === change.budget || !next.contributions.some(c => c.budgetKey === budget!.key && next.targets.some(t => t.key === c.targetKey && planningEntryLocked(next, edit.locked, t))), "closed_period_changed");
    if (budget.amount !== change.budget || budget.note !== change.note) budget.sourcePlanId = null;
    Object.assign(budget, { amount: change.budget, note: change.note, name: customer.name, tier: customer.tier });
  } else {
    budget = { key: edit.key(), accountId: customer.id, name: customer.name, tier: customer.tier, period: target.period, metric: target.metric, currency: target.currency, amount: change.budget, sourcePlanId: null, sourceReadAt: edit.at, note: change.note };
    next.budgets.push(budget);
  }
  const contribution = { key: old?.key ?? edit.key(), budgetKey: budget.key, targetKey: target.key, regionId: change.regionId, amount: change.amount, responsibility: change.responsibility };
  if (old) Object.assign(old, contribution); else next.contributions.push(contribution);
}
/** Pure edits of the existing regional aggregate; never changes customer master data. */
export function applyFocusChange(content: PlanContent, change: FocusChange, accounts: Accounts, locked: readonly string[], key: () => string, at: string) {
  const edit = { next: structuredClone(content), accounts, locked, key, at };
  switch (change.kind) {
    case "add": case "action": changeActions(edit, change); break;
    case "contribution": changeContribution(edit, change); break;
    case "remove": removeRegion(edit, change); break;
    case "removeAction": {
      account(edit, change.accountId);
      const old = edit.next.actions.find(a => a.key === change.key && a.accountId === change.accountId);
      demand(old, "invalid_action"); unlocked(edit, old);
      edit.next.actions = edit.next.actions.filter(a => a !== old);
    }
  }
  return prunePlanningBudgets(edit.next, content);
}
