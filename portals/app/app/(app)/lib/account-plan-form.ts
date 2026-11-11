import type { AccountPlanDraft, AccountTier } from "../../domains/account/store";
import { accountPlanViolation } from "../../domains/account/lib/account-plan";

export interface OperatingValues {
  enabled: boolean;
  period: string;
  targetAmount: string;
  contactCadenceDays: string;
  execCadenceDays: string;
}

export function operatingValues(period: string, plan?: AccountPlanDraft | null): OperatingValues {
  return {
    enabled: !!plan,
    period: plan?.period ?? period,
    targetAmount: plan?.targetAmount != null ? String(plan.targetAmount) : "",
    contactCadenceDays: String(plan?.contactCadenceDays ?? 30),
    execCadenceDays: String(plan?.execCadenceDays ?? 90),
  };
}

export function operatingPlan(tier: AccountTier, values: OperatingValues): AccountPlanDraft | undefined {
  if (tier !== "strategic" && !values.enabled) return undefined;
  return {
    period: values.period.trim(),
    targetAmount: values.targetAmount.trim() ? Number(values.targetAmount) : null,
    contactCadenceDays: Number(values.contactCadenceDays),
    execCadenceDays: Number(values.execCadenceDays),
  };
}

export function operatingError(tier: AccountTier, values: OperatingValues): string | null {
  return accountPlanViolation(tier, operatingPlan(tier, values))?.code ?? null;
}
