import type { PlanContent } from "./plan-model";
import { amount, minor } from "./plan-values";

/** Annual commitments and strategic shares are the same budget, not two totals. */
export function commitmentRevenue(content: PlanContent, regionId?: string | null) {
  const scope = regionId ? `territory:${regionId}` : "workspace";
  const targets = content.targets.filter(t => t.scope === scope && t.period === `Y${content.year}` && t.metric === "revenue");
  const rows = (content.strategyAcceptances ?? []).filter(x => x.expectation.metric === "revenue");
  const currencies = new Set([...targets.map(t => t.currency), ...rows.map(x => x.expectation.currency)]);
  return [...currencies].filter((c): c is string => !!c).map(currency => {
    const lines = targets.filter(t => t.currency === currency);
    const annual = lines.length === 1 ? lines[0]!.target : null;
    const strategic = rows.filter(x => x.expectation.currency === currency);
    let total: bigint | null = null;
    let invalidAnnual = false;
    if (annual !== null) {
      try { total = minor(annual); } catch { invalidAnnual = true; }
    }
    const confirmedAnnual = invalidAnnual ? null : annual;
    try {
      const accepted = strategic.reduce((sum, x) => sum + (regionId
        ? x.allocations.filter(a => a.regionId === regionId).reduce((n, a) => n + minor(a.amount), 0n)
        : minor(x.amount)), 0n);
      const difference = total === null ? null : total - accepted;
      const pending = regionId ? strategic.filter(x => !x.allocations.some(a => a.regionId === regionId)).length : 0;
      return { currency, annual: confirmedAnnual, accepted: amount(accepted), remaining: difference === null || difference < 0n || pending > 0 ? null : amount(difference),
        excess: difference !== null && difference < 0n ? amount(-difference) : null,
        pending, invalid: invalidAnnual };
    } catch {
      // In-progress form input must remain editable and never become a false zero.
      return { currency, annual: confirmedAnnual, accepted: null, remaining: null, excess: null, pending: 0, invalid: true };
    }
  });
}

/** Registered identities define customers; matching names never merge records. */
export function commitmentSupport(content: PlanContent, regionId?: string | null) {
  const scope = regionId ? `territory:${regionId}` : "workspace";
  const annual = content.targets.filter(t => t.scope === scope && t.period === `Y${content.year}`);
  const contributions = content.contributions.filter(x => !regionId || x.regionId === regionId);
  const budgetKeys = new Set(contributions.map(x => x.budgetKey));
  const actions = content.actions.filter(a => !regionId || a.regionId === regionId);
  const customers = new Set([...content.budgets.filter(b => budgetKeys.has(b.key)).map(b => b.accountId), ...actions.flatMap(a => a.accountId ? [a.accountId] : [])]);
  const targets = (content.strategyAcceptances ?? []).filter(x => x.expectation.metric !== "revenue" && (!regionId || x.allocations.some(a => a.regionId === regionId)));
  const newCustomers = annual.filter(t => t.metric === "new_logo"), pipeline = annual.filter(t => t.metric === "pipeline");
  const confirmed = (value: string | null) => {
    if (value === null) return null;
    try { minor(value); return value; } catch { return null; }
  };
  return { customers: customers.size, actions: actions.length, datedActions: actions.filter(a => a.due && a.ownerSub).length,
    newCustomers: newCustomers.length === 1 ? confirmed(newCustomers[0]!.target) : null,
    pipeline: pipeline.length === 1 ? { ...pipeline[0]!, target: confirmed(pipeline[0]!.target) } : null, specialTargets: targets.length };
}
