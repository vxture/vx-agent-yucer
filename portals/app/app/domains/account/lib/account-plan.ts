import type { AccountPlanDraft, AccountTier } from "../store";
import { violation, type Violation } from "../../shared/result";

/** One validation rule for customer creation, editing and designation. */
export function accountPlanViolation(tier: AccountTier, plan?: AccountPlanDraft): Violation | null {
  if (!plan) return tier === "strategic"
    ? violation("plan_required", "a strategic account needs an operating plan", "plan") : null;
  if (!plan.period.trim() || plan.period.trim().length > 16) {
    return violation("period_required", "a plan needs a period of at most 16 characters", "period");
  }
  if (tier === "strategic" && plan.targetAmount == null) {
    return violation("plan_target_required", "a strategic account needs a target amount", "targetAmount");
  }
  if (plan.targetAmount != null && (!Number.isFinite(plan.targetAmount) || plan.targetAmount < 0 || plan.targetAmount > Number.MAX_SAFE_INTEGER)) {
    return violation("plan_target_invalid", "a target must be a finite nonnegative amount", "targetAmount");
  }
  for (const field of ["contactCadenceDays", "execCadenceDays"] as const) {
    if (!Number.isInteger(plan[field]) || plan[field] <= 0 || plan[field] > 2147483647) {
      return violation("cadence_positive", "a cadence must be a positive integer", field);
    }
  }
  return null;
}
