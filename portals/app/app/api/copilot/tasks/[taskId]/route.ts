import {
  changePrivateTask,
  readPrivateTask,
} from "../../../../domains/copilot/task-service";
import { errorResponse } from "../../../../platform/envelope";
import { taskRequestContext } from "../context";
import { privateRequest, readTaskBody, taskResponse } from "../http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Route = { params: Promise<{ taskId: string }> };
export async function GET(_request: Request, route: Route): Promise<Response> {
  try {
    const access = await taskRequestContext();
    if (!access)
      return errorResponse(
        403,
        "COPILOT_TASK_ACCESS_DENIED",
        "task access refused",
      );
    return taskResponse(
      await readPrivateTask(access.context, (await route.params).taskId),
    );
  } catch {
    return errorResponse(
      503,
      "COPILOT_TASK_UNAVAILABLE",
      "task service unavailable",
    );
  }
}
export async function PATCH(request: Request, route: Route): Promise<Response> {
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
    return taskResponse(
      await changePrivateTask(
        access.context,
        (await route.params).taskId,
        body,
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
