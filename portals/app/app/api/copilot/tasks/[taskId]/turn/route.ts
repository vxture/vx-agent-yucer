import { after } from "next/server";
import { captureTaskMemories } from "../../../../../domains/copilot/memory-service";
import { AtlasClient } from "../../../../../agent/atlas/client";
import { RunosClient } from "../../../../../agent/runos/client";
import { tenantIdOf } from "../../../../../(app)/lib/session";
import { runPrivateTaskTurn } from "../../../../../domains/copilot/task-service";
import { errorResponse } from "../../../../../platform/envelope";
import { taskRequestContext } from "../../context";
import { privateRequest, readTaskBody, taskResponse } from "../../http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  route: { params: Promise<{ taskId: string }> },
): Promise<Response> {
  const rejected = privateRequest(request);
  if (rejected) return rejected;
  const parsed = await readTaskBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  try {
    const access = await taskRequestContext();
    if (!access)
      return errorResponse(
        403,
        "COPILOT_TASK_ACCESS_DENIED",
        "task access refused",
      );
    const tenantId = tenantIdOf(access.session);
    if (!tenantId)
      return errorResponse(
        400,
        "COPILOT_TASK_TENANT_REQUIRED",
        "no active tenant",
      );
    const taskId = (await route.params).taskId;
    const deps = {
      tenantId,
      subjectToken: (await access.session.accessToken()) ?? undefined,
      atlasClient: new AtlasClient(),
      runosClient: new RunosClient(),
    };
    const result = await runPrivateTaskTurn(access.context, taskId, body, deps);
    if (result.ok && !result.value.replayed) {
      after(async () => {
        // Extraction is best-effort; it never changes the completed chat receipt.
        // The explicit retry uses the same source-message keys and cannot revive
        // a stopped/corrected memory. Do not log private model text on failure.
        try {
          await captureTaskMemories(access.context, taskId, deps);
        } catch {
          /* Audit/refusal paths keep the task available. */
        }
      });
    }
    return taskResponse(result);
  } catch {
    return errorResponse(
      503,
      "COPILOT_TASK_UNAVAILABLE",
      "task service unavailable",
    );
  }
}
