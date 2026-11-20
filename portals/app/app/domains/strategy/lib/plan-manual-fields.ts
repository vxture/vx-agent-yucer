import type { PlanEdit } from "./lifecycle";

export const PLAN_MANUAL_FIELDS = ["name", "period", "objective", "ownerSub", "strategyTypeId", "changeReason",
  "productIds", "solutionIds", "targetMarkets", "result.valuePropositionId", "result.pathIds", "result.goals",
  "result.resources.people", "result.resources.peopleNote", "result.resources.funds", "result.resources.fundsNote",
  "result.resources.technology", "result.resources.technologyNote", "result.milestones", "result.risks"] as const;
export type PlanManualField = typeof PLAN_MANUAL_FIELDS[number];
function valueAt(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined, value);
}
/** Compare with the last applied draft, never with a fresh model proposal. */
export function changedPlanFields(current: PlanEdit, applied: PlanEdit): PlanManualField[] {
  return PLAN_MANUAL_FIELDS.filter(path => JSON.stringify(valueAt(current, path)) !== JSON.stringify(valueAt(applied, path)));
}
/** A model cannot overwrite corrected fields, including deliberately empty values. */
export function preservePlanManualFields(fields: Record<string, unknown>, current: PlanEdit, manual: readonly PlanManualField[]): Record<string, unknown> {
  const result = structuredClone(fields);
  for (const path of PLAN_MANUAL_FIELDS.filter(path => manual.includes(path))) {
    const parts = path.split("."), key = parts.pop()!;
    let target = result;
    let present = true;
    for (const part of parts) {
      if (!target[part] || typeof target[part] !== "object" || Array.isArray(target[part])) { present = false; break; }
      target = target[part] as Record<string, unknown>;
    }
    if (!present) continue;
    const value = valueAt(current, path);
    if (value === undefined || (parts.length === 0 && value === null)) delete target[key];
    else target[key] = structuredClone(value);
  }
  return result;
}
