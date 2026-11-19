import type { SegmentCriteria } from "./lifecycle";
import { SEGMENT_TEXT_LIMITS } from "./segment-text-limits";

export const SEGMENT_SUMMARY_LIMIT = SEGMENT_TEXT_LIMITS.needSummary;

/** Prefer the authored summary; old markets retain a bounded text preview. */
export function segmentSummary(criteria: SegmentCriteria): string {
  const text = (criteria.needSummary?.trim() || criteria.customerNeed?.trim() || criteria.expectedOutcome?.trim() || criteria.buyingScenario?.trim() || "").replace(/\s+/g, " ");
  return text.length > SEGMENT_SUMMARY_LIMIT ? `${text.slice(0, SEGMENT_SUMMARY_LIMIT)}\u2026` : text;
}
