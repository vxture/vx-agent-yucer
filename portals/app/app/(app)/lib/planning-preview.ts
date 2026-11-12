import { targetDelta } from "../../domains/planning/plan-state";
import { PlanError } from "../../domains/planning/plan-values";

// Draft fields can contain incomplete input while the user types. Previewing
// such a value must not crash the editor; save/release still validate strictly.
export function previewTargetDelta(
  before: string | null,
  after: string | null,
) {
  try {
    return targetDelta(before, after);
  } catch (error) {
    if (error instanceof PlanError && error.code === "invalid_amount")
      return null;
    throw error;
  }
}

/** Ratio to the formal target; an absent or zero denominator has no ratio. */
export function planningTierPercent(
  value: string | null | undefined,
  target: string | null | undefined,
  locale: string,
): string | null {
  if (
    value == null ||
    target == null ||
    !Number.isFinite(Number(value)) ||
    !Number.isFinite(Number(target)) ||
    Number(target) <= 0
  )
    return null;
  return (Number(value) / Number(target)).toLocaleString(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
}
