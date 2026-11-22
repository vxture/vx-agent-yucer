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
    return taskResponse(
      await runPrivateTaskTurn(
        access.context,
        (await route.params).taskId,
        body,
        {
          tenantId,
          subjectToken: (await access.session.accessToken()) ?? undefined,
          atlasClient: new AtlasClient(),
          runosClient: new RunosClient(),
        },
      ),
    );
  } catch {
    return errorResponse(
      503,
      "COPILOT_TASK_UNAVAILABLE",
      "task service unavailable",
    );
  }
}
