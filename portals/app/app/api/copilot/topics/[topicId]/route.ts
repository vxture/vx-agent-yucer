import { changeTopic } from "../../../../domains/judgement/topic-service";
import { topicRequestContext } from "../../tasks/context";
import { errorResponse } from "../../../../platform/envelope";
import { privateRequest, readTaskBody, taskResponse } from "../../tasks/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  route: { params: Promise<{ topicId: string }> },
) {
  const rejected = privateRequest(request);
  if (rejected) return rejected;
  const body = await readTaskBody(request);
  if (!body.ok) return body.response;
  try {
    const ctx = await topicRequestContext();
    if (!ctx)
      return errorResponse(
        403,
        "COPILOT_TOPIC_ACCESS_DENIED",
        "access refused",
      );
    return taskResponse(
      await changeTopic(ctx, (await route.params).topicId, body.value),
    );
  } catch {
    return errorResponse(
      503,
      "COPILOT_TOPIC_UNAVAILABLE",
      "topics unavailable",
    );
  }
}
