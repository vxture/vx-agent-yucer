import type { SegmentCriteria, SegmentStatus } from "./lifecycle";

// ICP 拟合度 (YC-021 L1, owner 2026-09-24): "给出拟合分及其依据的三个特征,
// 依据可点开". The ideal customer profile IS the workspace's own target
// segments - there is no second definition to drift from them. A customer is
// compared against every ACTIVE segment that states at least one condition,
// and the best one is reported with its three features:
//
//   hit            the customer's value is in the segment's list
//   open           the segment sets no condition on this dimension - anything fits
//   miss           the customer's value is not in the list
//   missing_value  the segment has a condition and the customer's field is empty
//
// Fit = hits + opens, out of 3. A missing value is NOT a miss of the customer's
// fit, it is a gap in our record - it is reported as its own status so the
// reader fills the field rather than writing the customer off.

export const ICP_DIMENSIONS = ["industry", "size", "region"] as const;
export type IcpDimension = (typeof ICP_DIMENSIONS)[number];
export type IcpFeatureStatus = "hit" | "open" | "miss" | "missing_value";

export interface IcpFeature {
  readonly dimension: IcpDimension;
  readonly status: IcpFeatureStatus;
  readonly value: string | null;
  readonly targets: readonly string[];
}

export interface IcpFit {
  readonly segmentCode: string;
  readonly segmentName: string;
  /** Features that fit (hit or open), 0-3. */
  readonly fit: number;
  readonly features: readonly IcpFeature[];
}

export interface IcpSegment {
  readonly segmentCode: string;
  readonly name: string;
  readonly priority: number;
  readonly status: SegmentStatus;
  readonly criteria: SegmentCriteria;
}

function feature(dimension: IcpDimension, value: string | null, targets: readonly string[]): IcpFeature {
  if (targets.length === 0) return { dimension, status: "open", value, targets };
  if (value === null || value === "") return { dimension, status: "missing_value", value: null, targets };
  return { dimension, status: targets.includes(value) ? "hit" : "miss", value, targets };
}

/**
 * The best-fitting target segment for this customer, or null when the
 * workspace has no active segment with any condition - there is then no ICP
 * to measure against, and a score would be invented.
 *
 * Ties go to the segment the workspace ranked first (lower priority number).
 */
export function icpFit(
  account: { industry: string | null; customerSize: string | null; region: string | null },
  segments: readonly IcpSegment[],
): IcpFit | null {
  let best: IcpFit | null = null;
  let bestPriority = Infinity;
  for (const g of segments) {
    const sizes = g.criteria.sizes ?? [];
    if (g.status !== "active") continue;
    if (g.criteria.industries.length === 0 && g.criteria.regions.length === 0 && sizes.length === 0) continue;
    const features = [
      feature("industry", account.industry, g.criteria.industries),
      feature("size", account.customerSize, sizes),
      feature("region", account.region, g.criteria.regions),
    ];
    const fit = features.filter((f) => f.status === "hit" || f.status === "open").length;
    if (!best || fit > best.fit || (fit === best.fit && g.priority < bestPriority)) {
      best = { segmentCode: g.segmentCode, segmentName: g.name, fit, features };
      bestPriority = g.priority;
    }
  }
  return best;
}
