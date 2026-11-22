import type { BusinessForm } from "./lib/business-form";
import type { AutonomyMode, OperationRisk } from "./lib/autonomy";
export const EXECUTION_RULE_VERSION = "xiaoyu-execution/1";
export function executionRisk(
  form: BusinessForm,
  operation: "save" | "publish",
): OperationRisk {
  if (operation === "publish") return "destructive";
  return form.targetId || form.module === "sales_plan"
    ? "important"
    : "routine";
}
export function needsExecutionConfirmation(
  mode: AutonomyMode,
  risk: OperationRisk,
): boolean {
  return (
    mode === "ask_always" ||
    risk === "destructive" ||
    (mode === "ask_high_risk" && risk !== "routine")
  );
}
export function executionAllowed(input: {
  mode: AutonomyMode;
  risk: OperationRisk;
  confirmed: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
  stepExpiresAt: Date;
  used: number;
  budget: number;
  now: Date;
}): void {
  if (input.revokedAt) throw Error("grant_revoked");
  if (input.expiresAt <= input.now || input.stepExpiresAt <= input.now)
    throw Error("authorization_expired");
  if (input.used >= input.budget) throw Error("execution_budget_exhausted");
  if (needsExecutionConfirmation(input.mode, input.risk) && !input.confirmed)
    throw Error("human_decision_required");
}
