import {
  listTopics,
  openTopic,
} from "../../../domains/judgement/topic-service";
import { topicRequestContext } from "../tasks/context";
import { errorResponse } from "../../../platform/envelope";
import { privateRequest, readTaskBody, taskResponse } from "../tasks/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const ctx = await topicRequestContext();
    if (!ctx)
      return errorResponse(
        403,
        "COPILOT_TOPIC_ACCESS_DENIED",
        "access refused",
      );
    const scope = new URL(request.url).searchParams.get("scope");
    return taskResponse(
      await listTopics(
        ctx,
        scope === "all" || scope === "mine" ? scope : undefined,
      ),
    );
  } catch {
    return errorResponse(
      503,
      "COPILOT_TOPIC_UNAVAILABLE",
      "topics unavailable",
    );
  }
}
export async function POST(request: Request) {
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
    return taskResponse(await openTopic(ctx, body.value));
  } catch {
    return errorResponse(
      503,
      "COPILOT_TOPIC_UNAVAILABLE",
      "topics unavailable",
    );
  }
}
