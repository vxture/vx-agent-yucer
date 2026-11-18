"use client";

import { DateRangeField } from "./date-range-field";

/** Milestones prefer opening upward to keep the bottom save area unobstructed. */
export function StrategyDateRange(props: {
  readonly id: string;
  readonly startOn: string;
  readonly endOn: string;
  readonly onChange: (startOn: string, endOn: string) => void;
}) {
  return <DateRangeField {...props} side="top" />;
}
