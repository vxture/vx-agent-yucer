import {
  changeBusinessKnowledge,
  createBusinessKnowledge,
  listBusinessKnowledge,
  previewBusinessKnowledge,
  searchKnowledgeMembers,
} from "../../../domains/copilot/knowledge-service";
import { errorResponse } from "../../../platform/envelope";
import { taskRequestContext } from "../tasks/context";
import { privateRequest, readTaskBody, taskResponse } from "../tasks/http";
type Access = Awaited<ReturnType<typeof taskRequestContext>>;
type Operation = "list" | "create" | "change" | "preview" | "members";
export async function knowledgeHttp(
  request: Request,
  operation: Operation,
  id?: string,
  resolve: () => Promise<Access> = taskRequestContext,
): Promise<Response> {
  let input: unknown;
  if (["create", "change", "preview"].includes(operation)) {
    const rejected = privateRequest(request);
    if (rejected) return rejected;
    const parsed = await readTaskBody(request);
    if (!parsed.ok) return parsed.response;
    input = parsed.value;
  }
  try {
    const a = await resolve();
    if (!a)
      return errorResponse(403, "COPILOT_TASK_ACCESS_DENIED", "access refused");
    switch (operation) {
      case "list":
        return taskResponse(
          await listBusinessKnowledge(
            a.context,
            Number(new URL(request.url).searchParams.get("offset") ?? 0),
          ),
        );
      case "create":
        return taskResponse(await createBusinessKnowledge(a.context, input));
      case "change":
        return taskResponse(
          await changeBusinessKnowledge(a.context, id ?? "", input),
        );
      case "preview":
        return taskResponse(await previewBusinessKnowledge(a.context, input));
      case "members":
        return taskResponse(
          await searchKnowledgeMembers(
            a.context,
            new URL(request.url).searchParams.get("q") ?? "",
          ),
        );
    }
  } catch {
    return errorResponse(
      503,
      "COPILOT_TASK_UNAVAILABLE",
      "knowledge unavailable",
    );
  }
}
