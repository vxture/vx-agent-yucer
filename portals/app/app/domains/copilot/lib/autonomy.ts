import type { AgentAction } from "./action";

// Persisted identifiers remain compatible with agent_autonomy's existing CHECK.
export const AUTONOMY_MODES = ["ask_always", "ask_high_risk", "autonomous"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];
export function isAutonomyMode(value: string): value is AutonomyMode {
  return (AUTONOMY_MODES as readonly string[]).includes(value);
}

export type OperationRisk = "routine" | "important" | "destructive";
/** Server-owned risk registration, never a classification supplied by a model.
 * Reads and unsubmitted drafts use read-only tools outside the write executor.
 * All currently executable proposals change business records. Field and role
 * replacements can overwrite existing values, so always require confirmation.
 */
export const ACTION_RISK: Readonly<Record<string, OperationRisk>> = {
  advance_stage: "important",
  fill_account_field: "destructive",
  record_interaction: "important",
  record_evidence: "important",
  set_buying_role: "destructive",
  add_commitment: "important",
  plan_step: "important",
};
export const EXECUTABLE_ACTIONS: readonly string[] = Object.keys(ACTION_RISK);
export function isExecutable(actionType: string): boolean {
  return Object.hasOwn(ACTION_RISK, actionType);
}
export function operationRisk(actionType: string): OperationRisk {
  return Object.hasOwn(ACTION_RISK, actionType) ? ACTION_RISK[actionType]! : "destructive";
}

export const CONFIDENCE_FLOOR = 60;
export type RiskReason = "irreversible" | "important" | "low_confidence";
export function riskOf(action: Pick<AgentAction, "actionType" | "confidence">): RiskReason[] {
  const reasons: RiskReason[] = [];
  const risk = operationRisk(action.actionType);
  if (risk === "destructive") reasons.push("irreversible");
  else if (risk === "important") reasons.push("important");
  if (action.confidence === null || action.confidence < CONFIDENCE_FLOOR) reasons.push("low_confidence");
  return reasons;
}

export type AutonomyVerdict =
  | { readonly kind: "act"; readonly mode: AutonomyMode }
  | { readonly kind: "ask"; readonly reasons: readonly RiskReason[] };

/** Confirmation preference never grants business permission or task scope.
 * Unknown and destructive operations cannot skip confirmation in any mode.
 * The service separately checks entitlement, actor and workspace. Task-scope
 * and execution-time expiry validation are tracked in issue #652.
 */
export function decideAutonomy(action: Pick<AgentAction, "actionType" | "confidence">, mode: AutonomyMode): AutonomyVerdict {
  const reasons = riskOf(action);
  if (mode === "ask_always" || operationRisk(action.actionType) === "destructive") return { kind: "ask", reasons };
  if (mode === "autonomous") return { kind: "act", mode };
  return reasons.length ? { kind: "ask", reasons } : { kind: "act", mode };
}
