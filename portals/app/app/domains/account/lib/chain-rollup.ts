import type { DecisionRole } from "./health";

// 账户级覆盖聚合 (YC-021 L2): across every open deal's chain, READ ONLY.
// A buying role is a fact about one purchase (incr/0027), so nothing here can
// be edited - the aggregate is a count over per-deal facts, and changing one
// of those facts happens on that deal's page.

export interface DealChainFacts {
  readonly covered: readonly DecisionRole[];
  readonly missing: readonly DecisionRole[];
  /** Active people with a stated role on this deal. */
  readonly personIds: readonly string[];
}

export interface ChainRollup {
  readonly deals: number;
  /** Roles covered on at least one deal. */
  readonly coveredAnywhere: readonly DecisionRole[];
  /** Per required role, how many deals lack it - only roles some deal lacks. */
  readonly missingOn: readonly { readonly role: DecisionRole; readonly deals: number }[];
  /** Distinct people across all deals' chains. */
  readonly people: number;
}

export function rollupChains(chains: readonly DealChainFacts[]): ChainRollup {
  const covered = new Set<DecisionRole>();
  const missing = new Map<DecisionRole, number>();
  const people = new Set<string>();
  for (const c of chains) {
    for (const r of c.covered) covered.add(r);
    for (const r of c.missing) missing.set(r, (missing.get(r) ?? 0) + 1);
    for (const p of c.personIds) people.add(p);
  }
  return {
    deals: chains.length,
    coveredAnywhere: [...covered],
    missingOn: [...missing].map(([role, deals]) => ({ role, deals })).sort((a, b) => b.deals - a.deals),
    people: people.size,
  };
}
