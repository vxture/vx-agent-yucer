import {
  continueExecution, proposeExecution, grantExecution, executeStep, readExecutions, revokeExecution, type ExecutionContext,
} from "../../../../../domains/copilot/execution-service";
import { violationEnvelope } from "../../../../../platform/envelope";
import { privateRequest, readTaskBody } from "../../http";
function refused(error: unknown) {
  const code =
    error instanceof Error && /^[a-z_]{1,64}$/.test(error.message)
      ? error.message
      : "execution_unavailable";
  const status = ["not_found"].includes(code)
    ? 404
    : [
          "access_changed",
          "permission_denied",
          "grant_unavailable",
          "grant_revoked",
        ].includes(code)
      ? 403
      : code === "execution_unavailable"
        ? 503
        : 409;
  const message = "execution request refused";
  return Response.json(violationEnvelope(code, message, "COPILOT_EXECUTION", false), {
    status: code === "invalid_execution_request" ? 400 : code === "method_not_allowed" ? 405 : status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function executionHttp(
  request: Request,
  taskId: string,
  resolve: () => Promise<ExecutionContext | null>,
): Promise<Response> {
  if (request.method === "GET") return read(taskId, resolve);
  if (request.method !== "POST") return refused(Error("method_not_allowed"));
  return mutate(request, taskId, resolve);
}
async function read(taskId: string, resolve: () => Promise<ExecutionContext | null>) {
  try {
    const ctx = await resolve();
    if (!ctx)
      return refused(Error("access_changed"));
    return Response.json(
      await readExecutions(ctx, taskId),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return refused(error);
  }
}
async function mutate(request: Request, taskId: string, resolve: () => Promise<ExecutionContext | null>) {
  const rejection = privateRequest(request);
  if (rejection) return rejection;
  const parsed = await readTaskBody(request);
  if (!parsed.ok) return parsed.response;
  try {
    const ctx = await resolve();
    if (!ctx)
      return refused(Error("access_changed"));
    const value = parsed.value as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("invalid_execution_request");
    const { action, ...input } = value;
    let result: unknown;
    if (action === "propose")
      result = await proposeExecution(ctx, taskId, input);
    else if (action === "grant") {
      const grant = await grantExecution(ctx, taskId, input);
      const completed = [];
      for (const stepId of grant.stepIds) {
        try {
          completed.push(
            await executeStep(ctx, taskId, { stepId, grantId: grant.id }),
          );
        } catch {
          return Response.json(
            { grant, completed, state: "partial_or_waiting" },
            { headers: { "Cache-Control": "private, no-store" } },
          );
        }
      }
      result = { grant, completed, state: "succeeded" };
    } else if (
      action === "continue" &&
      Object.keys(input).length === 1 &&
      typeof input.receiptId === "string"
    )
      result = await continueExecution(ctx, taskId, input.receiptId);
    else if (action === "execute")
      result = await executeStep(ctx, taskId, input);
    else if (
      action === "revoke" &&
      Object.keys(input).length === 1 &&
      typeof input.grantId === "string"
    )
      result = await revokeExecution(ctx, taskId, input.grantId);
    else throw Error("invalid_execution_request");
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return refused(error);
  }
}
