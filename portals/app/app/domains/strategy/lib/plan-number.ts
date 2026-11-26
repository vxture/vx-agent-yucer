import { nextBusinessCode } from "../../shared/business-code";

/** A lineage code uses the Beijing creation day, independent of execution dates. */
export function nextStrategyNumber(existing: readonly string[], now = new Date()): string {
  return nextBusinessCode("STR", existing, now);
}

export function strategyNumbers(plan: { planNo: string; previousNumbers?: readonly string[] }): string[] {
  return [plan.planNo, ...(plan.previousNumbers ?? [])];
}
export function matchesStrategyNumber(plan: { planNo: string; previousNumbers?: readonly string[] }, number: string): boolean {
  return strategyNumbers(plan).includes(number);
}
