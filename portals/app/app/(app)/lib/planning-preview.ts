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
