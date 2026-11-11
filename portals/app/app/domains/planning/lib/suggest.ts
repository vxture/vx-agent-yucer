// What the planning data can suggest about itself - the assistant beside the
// target forms (owner ruling 2026-09-05).
//
// Pure functions over rows the pages already load. Same contract as every
// suggestion engine in this repo: refuse to guess - empty over invented.

import { TARGET_METRICS, type TargetMetric, type TargetScopeType } from "./target";

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

/**
 * The active territories whose region list covers one region.
 *
 * The new-deal form uses it to suggest the territory a deal should be filed
 * under from its customer's region - the SAME match lead routing runs, so a
 * deal filed by this suggestion lands where its leads would have. Plural
 * because overlapping coverage is legal; the caller shows all and the person
 * picks, since choosing between two owners is a judgement, not a lookup.
 */
export function coveringTerritories(
  region: string | null,
  territories: readonly {
    readonly id: string;
    readonly name: string;
    readonly regions: readonly string[];
    readonly status: string;
  }[],
): { id: string; name: string }[] {
  const r = region?.trim();
  if (!r) return [];
  return territories
    .filter((t) => t.status === "active" && t.regions.includes(r))
    .map((t) => ({ id: t.id, name: t.name }));
}
