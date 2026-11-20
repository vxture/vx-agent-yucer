import type { SegmentCriteria } from "./lifecycle";

export type MarketMatch = "match" | "miss" | "missing" | "undefined";
export interface MarketClassification {
  industry: string | null;
  region: string | null;
  customerSize: string | null;
}

export function readSegmentCriteria(criteria: unknown): SegmentCriteria {
  const raw = (criteria ?? {}) as Partial<Record<keyof SegmentCriteria, unknown>>;
  return {
    industries: Array.isArray(raw.industries) ? raw.industries.map(String) : [],
    regions: Array.isArray(raw.regions) ? raw.regions.map(String) : [],
    sizes: Array.isArray(raw.sizes) ? raw.sizes.map(String) : [],
    ...Object.fromEntries((["needSummary", "customerNeed", "buyingScenario", "expectedOutcome", "entryBarrier"] as const)
      .map(key => [key, raw[key]]).filter(([, value]) => typeof value === "string")),
  };
}

// Shared by live market views and scheduled diagnostics. Assignment is a
// separate fact: it must never silently replace a criteria match.
export function marketMatch(a: MarketClassification, c: SegmentCriteria): MarketMatch {
  const pairs = [[c.industries, a.industry], [c.regions, a.region], [c.sizes ?? [], a.customerSize]] as const;
  const limited = pairs.filter(([values]) => values.length > 0);
  if (!limited.length) return "undefined";
  if (limited.some(([values, value]) => value != null && value !== "" && !values.includes(value))) return "miss";
  return limited.some(([, value]) => value == null || value === "") ? "missing" : "match";
}
