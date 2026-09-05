// What the planning data can suggest about itself - the assistant beside the
// territory and target forms (owner ruling 2026-09-05).
//
// Pure functions over rows the pages already load. Same contract as every
// suggestion engine in this repo: refuse to guess - empty over invented.

import { TARGET_METRICS, type TargetMetric, type TargetScopeType } from "./target";

/**
 * Regions that have customers and no coverage.
 *
 * THE ROUTING RULE IS WHY THIS MATTERS. Lead routing goes territory-first
 * (owner ruling 2026-08-30), and a territory covers a lead through its
 * `regions` list - so a region that appears on accounts but in no active
 * territory is ground where every lead is unroutable. That is exactly the gap
 * somebody opening the territory form should be shown, with the count that
 * says how much it bites.
 *
 * Retired territories do not count as coverage: their regions are history, and
 * treating them as live would hide a hole behind a tombstone.
 */
export function uncoveredRegions(
  accountRegions: readonly (string | null)[],
  territories: readonly { readonly regions: readonly string[]; readonly status: string }[],
): { region: string; accounts: number }[] {
  const covered = new Set(
    territories.filter((t) => t.status === "active").flatMap((t) => t.regions),
  );
  const counts = new Map<string, number>();
  for (const r of accountRegions) {
    const t = r?.trim();
    if (!t || covered.has(t)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([region, accounts]) => ({ region, accounts }));
}

/**
 * Active territories with no target of any metric this period.
 *
 * A territory without a target is a scope attainment cannot judge - the
 * denominator is missing, which reads on /attainment as "not established"
 * rather than as a number. Naming them beside the target form turns "which
 * scope should I pick" into a list of the ones still owed an answer.
 */
export function untargetedTerritories(
  period: string,
  territories: readonly { readonly id: string; readonly name: string; readonly status: string }[],
  targets: readonly {
    readonly period: string;
    readonly scopeType: TargetScopeType;
    readonly territoryId: string | null;
  }[],
): { id: string; name: string }[] {
  const targeted = new Set(
    targets
      .filter((t) => t.period === period && t.scopeType === "territory" && t.territoryId)
      .map((t) => t.territoryId as string),
  );
  return territories
    .filter((t) => t.status === "active" && !targeted.has(t.id))
    .map((t) => ({ id: t.id, name: t.name }));
}

/**
 * Metrics with no workspace-level target this period.
 *
 * Order is the declaration order of the metric union - revenue first because
 * it is the one every sales organisation sets, and the list exists to say
 * "these are still blank", not to rank importance.
 */
export function unsetWorkspaceMetrics(
  period: string,
  targets: readonly {
    readonly period: string;
    readonly scopeType: TargetScopeType;
    readonly metric: string;
  }[],
): TargetMetric[] {
  const set = new Set(
    targets
      .filter((t) => t.period === period && t.scopeType === "workspace")
      .map((t) => t.metric),
  );
  // TARGET_METRICS is the single source (ADR-020) - a local copy would be a
  // second list that drifts the day a metric is added.
  return TARGET_METRICS.filter((m): m is TargetMetric => !set.has(m));
}
