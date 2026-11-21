import type { PlanTarget } from "../../domains/planning/plan-model";

export const planningMetricOrder: readonly PlanTarget["metric"][] = [
  "revenue",
  "new_logo",
  "pipeline",
  "margin",
];
// Scenarios choose existing, well-defined measures; they never rename revenue to ARR or bookings.
export const planningMetricPresets = {
  general: ["revenue", "new_logo", "pipeline"],
  projects: ["revenue", "pipeline", "margin"],
  products: ["revenue", "new_logo", "margin"],
  services: ["revenue", "new_logo", "pipeline", "margin"],
} as const satisfies Record<string, readonly PlanTarget["metric"][]>;
export type PlanningMetricPreset = keyof typeof planningMetricPresets;
