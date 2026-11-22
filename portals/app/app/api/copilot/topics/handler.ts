import {
  listTopics,
  openTopic,
  changeTopic,
  type TopicContext,
} from "../../../domains/judgement/topic-service";
import { errorResponse } from "../../../platform/envelope";
import { privateRequest, readTaskBody, taskResponse } from "../tasks/http";
export async function topicsHttp(
  request: Request,
  operation: "list" | "open" | "change",
  id: string,
  resolve: () => Promise<TopicContext | null>,
): Promise<Response> {
  let body: unknown;
  if (operation !== "list") {
    const rejected = privateRequest(request);
    if (rejected) return rejected;
    const parsed = await readTaskBody(request);
    if (!parsed.ok) return parsed.response;
    body = parsed.value;
  }
  try {
    const ctx = await resolve();
    if (!ctx)
      return errorResponse(
        403,
        "COPILOT_TOPIC_ACCESS_DENIED",
        "access refused",
      );
    if (operation === "list") {
      const scope = new URL(request.url).searchParams.get("scope");
      return taskResponse(
        await listTopics(
          ctx,
          scope === "all" || scope === "mine" ? scope : undefined,
        ),
      );
    }
    if (operation === "open") return taskResponse(await openTopic(ctx, body));
    return taskResponse(await changeTopic(ctx, id, body));
  } catch {
    return errorResponse(
      503,
      "COPILOT_TOPIC_UNAVAILABLE",
      "topics unavailable",
    );
  }
}
