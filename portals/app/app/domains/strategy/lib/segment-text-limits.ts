/** Shared by the form, domain writes and assistant structured output. */
export const SEGMENT_TEXT_LIMITS = {
  name: 50,
  needSummary: 60,
  customerNeed: 200,
  buyingScenario: 200,
  expectedOutcome: 150,
  entryBarrier: 150,
} as const;

export type SegmentTextField = keyof typeof SEGMENT_TEXT_LIMITS;
