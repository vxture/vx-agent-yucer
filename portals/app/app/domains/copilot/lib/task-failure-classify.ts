import { AtlasError } from "../../../agent/atlas/errors";
import { LoginStateUnavailableError } from "../../../auth/lib/login-state";
import { TASK_ATLAS_FAILURE_CODES, type TaskFailureDiagnostic } from "./task-failure";

/** Server-only classification. No error message, raw envelope, cause chain or
 * Prisma metadata is copied into either the private receipt or server log. */
export function classifyTaskFailure(stage: TaskFailureDiagnostic["stage"], error: unknown, refusal?: string) {
  const failure = { stage, category: "unexpected" as TaskFailureDiagnostic["category"], code: undefined as string | undefined };
  const serviceCode = stage === "persist" ? "task_persistence_failed" : stage === "verify" ? "task_verification_unavailable"
    : stage === "complete" ? "task_completion_failed" : stage === "model" || stage === "validate" ? "task_model_failed" : "task_service_unavailable";
  if (refusal) return { errorCode: refusal, ...failure, category: "rule" as const };
  if (error instanceof LoginStateUnavailableError) return { errorCode: "task_verification_unavailable", ...failure, category: "authorization" as const };
  if (error instanceof AtlasError) return { errorCode: "task_model_failed", ...failure, category: "model" as const,
    code: TASK_ATLAS_FAILURE_CODES.includes(error.code as typeof TASK_ATLAS_FAILURE_CODES[number]) ? error.code : "OTHER" };
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (typeof code === "string" && /^P\d{4}$/.test(code)) return { errorCode: serviceCode, ...failure, category: "database" as const, code };
  if (error instanceof TypeError) failure.code = "TYPE_ERROR";
  else if (error instanceof SyntaxError) failure.code = "SYNTAX_ERROR";
  else if (error instanceof RangeError) failure.code = "RANGE_ERROR";
  return { errorCode: serviceCode, ...failure };
}
