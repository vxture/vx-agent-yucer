import type { PlanContent, PlanTarget } from "../../domains/planning/plan-model";
import { amount, minor } from "../../domains/planning/plan-values";

const readMinor = (value: string | null | undefined) => {
  try { return value == null ? null : minor(value); } catch { return null; }
};
const signed = (value: bigint) => value < 0n ? `-${amount(-value)}` : amount(value);
export function planningHref({ year, revision, region, period }: {
  year: number; revision?: string; region?: string | null; period?: string;
}) {
  const query = new URLSearchParams({ year: String(year) });
  if (revision && revision !== "current") query.set("revision", revision);
  if (region) query.set("region", region);
  if (period) query.set("period", period);
  return `/planning?${query}`;
}

/** Snapshot facts only: support is a planning contribution, never actual sales. */
export function planningRegionRows(content: PlanContent) {
  const budgets = new Map(content.budgets.map(b => [b.key, b]));
  return content.regions.map(region => {
    const annual = content.targets.find(t => t.scope === `territory:${region.id}` && t.period === `Y${content.year}` && t.metric === "revenue");
    const contributions = content.contributions.filter(c => c.regionId === region.id);
    const actions = content.actions.filter(a => a.regionId === region.id);
    const customers = new Set([
      ...contributions.flatMap(c => budgets.get(c.budgetKey)?.accountId ?? []),
      ...actions.flatMap(a => a.accountId ?? []),
    ]).size;
    // Use the explicit target link: annual and quarterly support are two views
    // of the same budget, not additional revenue. Missing annual support is
    // unknown even when quarter contributions exist.
    const matching = annual ? contributions.filter(c => c.targetKey === annual.key && budgets.get(c.budgetKey)?.metric === annual.metric && budgets.get(c.budgetKey)?.currency === annual.currency) : [];
    const supported = matching.length ? signed(matching.reduce((sum, c) => sum + minor(c.amount), 0n)) : null;
    const targetAmount = readMinor(annual?.target);
    const gap = targetAmount != null && supported != null ? signed(targetAmount - minor(supported)) : null;
    return { ...region, annual, customers, supported, gap,
      people: new Set(content.team.filter(t => t.regionId === region.id && t.memberSub).map(t => t.memberSub)).size,
      actions: actions.length,
    };
  });
}

/** Excluded regions and incompatible currencies cannot consume a company target. */
export function companyAllocation(content: PlanContent, target: PlanTarget | undefined) {
  const included = content.regions.filter(r => r.included);
  const rows = included.map(r => content.targets.find(t => t.scope === `territory:${r.id}` && t.period === `Y${content.year}` && t.metric === target?.metric && t.currency === target.currency));
  const unknown = rows.filter(t => !target || !t || readMinor(t.target) == null || t.currency !== target.currency).length;
  const allocated = signed(rows.reduce((sum, t) => sum + (t?.currency === target?.currency ? readMinor(t?.target) ?? 0n : 0n), 0n));
  return { allocated, unknown, balance: readMinor(target?.target) != null ? signed(readMinor(target?.target)! - minor(allocated)) : null };
}
