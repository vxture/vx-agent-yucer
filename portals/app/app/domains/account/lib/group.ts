import type { AccountStatus } from "./health";

// 集团合并视图 (YC-021 L1). A parent company's page answers for the group -
// its own figures plus every unit below it - and can switch back to its own.
//
// The tree is account.parent_id (incr/0025). setAccountParent refuses a
// cycle, but the walk still guards one: a read that loops is worse than a
// read that stops.

export interface UnitRow {
  readonly id: string;
  readonly parentId: string | null;
}

/** Every unit below `rootId`, at any depth, nearest first. Not the root. */
export function descendantsOf(rootId: string, rows: readonly UnitRow[]): string[] {
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = children.get(r.parentId) ?? [];
    list.push(r.id);
    children.set(r.parentId, list);
  }
  const seen = new Set([rootId]);
  const out: string[] = [];
  const queue = [...(children.get(rootId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return out;
}

export interface GroupUnitFacts {
  readonly id: string;
  readonly name: string;
  readonly healthScore: number | null;
  readonly status: AccountStatus | null;
  readonly openDeals: readonly { readonly amount: number | null; readonly currency: string }[];
}

/** Why a unit counts as at risk. Codes - the sentence is the page's. */
export type GroupRiskReason = "low_health" | "churned" | "dormant";

export interface GroupRollup {
  readonly unitCount: number;
  readonly openDealCount: number;
  /** Per currency, never summed across (the same rule as every money total here). */
  readonly amountByCurrency: ReadonlyMap<string, number>;
  readonly atRisk: readonly {
    readonly id: string;
    readonly name: string;
    readonly reasons: readonly GroupRiskReason[];
    readonly healthScore: number | null;
  }[];
}

/**
 * The group's figures over the given units (the root and its descendants).
 *
 * At risk = a health score below `riskBelow` (the danger band the account
 * list colours red), or a derived status of churned / dormant. A unit with no
 * score is not "at risk" - an unknown is not a finding.
 */
export function rollupGroup(units: readonly GroupUnitFacts[], riskBelow = 40): GroupRollup {
  const amountByCurrency = new Map<string, number>();
  let openDealCount = 0;
  const atRisk: GroupRollup["atRisk"][number][] = [];
  for (const u of units) {
    openDealCount += u.openDeals.length;
    for (const d of u.openDeals) {
      if (d.amount === null) continue;
      amountByCurrency.set(d.currency, (amountByCurrency.get(d.currency) ?? 0) + d.amount);
    }
    const reasons: GroupRiskReason[] = [];
    if (u.healthScore !== null && u.healthScore < riskBelow) reasons.push("low_health");
    if (u.status === "churned") reasons.push("churned");
    if (u.status === "dormant") reasons.push("dormant");
    if (reasons.length > 0) atRisk.push({ id: u.id, name: u.name, reasons, healthScore: u.healthScore });
  }
  return { unitCount: units.length, openDealCount, amountByCurrency, atRisk };
}
