export const TASK_FAILURE_STAGES = ["prepare", "model", "tool", "validate", "verify", "persist", "complete"] as const;
export const TASK_FAILURE_CATEGORIES = ["model", "authorization", "database", "unexpected", "rule"] as const;
export const TASK_ATLAS_FAILURE_CODES = ["LOCAL_DEADLINE", "BODY_TIMEOUT", "OUTPUT_BUDGET_EXHAUSTED", "CONTEXT_LENGTH_EXCEEDED",
  "DEADLINE_EXCEEDED", "PROVIDER_UNAVAILABLE", "RATE_LIMITED", "NOT_ENTITLED", "GRANT_DENIED",
  "QUOTA_EXCEEDED", "CHAT_MESSAGES_INVALID", "THINKING_MODE_UNSUPPORTED"] as const;
const SAFE_CODES = new Set<string>([...TASK_ATLAS_FAILURE_CODES, "OTHER", "TYPE_ERROR", "SYNTAX_ERROR", "RANGE_ERROR"]);
export interface TaskFailureDiagnostic {
  stage: (typeof TASK_FAILURE_STAGES)[number];
  category: (typeof TASK_FAILURE_CATEGORIES)[number];
  code?: string;
  modelFinished: boolean;
  sourceCount: number;
  formCount: number;
  modelRequests: number;
  toolCalls: number;
}
export function validFailureCode(value: unknown): value is string {
  return typeof value === "string" && (SAFE_CODES.has(value) || /^P\d{4}$/.test(value));
}

export function validFailureDiagnostic(value: unknown): value is TaskFailureDiagnostic {
  if (!value || typeof value !== "object") return false;
  const v = value as TaskFailureDiagnostic;
  return Object.keys(v).every(k => ["stage", "category", "code", "modelFinished", "sourceCount", "formCount", "modelRequests", "toolCalls"].includes(k)) &&
    TASK_FAILURE_STAGES.includes(v.stage) && TASK_FAILURE_CATEGORIES.includes(v.category) &&
    (v.code === undefined || validFailureCode(v.code)) && typeof v.modelFinished === "boolean" &&
    [v.sourceCount, v.formCount, v.modelRequests, v.toolCalls].every(n => Number.isSafeInteger(n) && n >= 0);
}
