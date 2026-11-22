import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import { tenantIdOf } from "../../../(app)/lib/session";
import {
  captureTaskMemories,
  changePrivateMemory,
  createPrivateMemory,
  listPrivateMemories,
  searchPrivateHistory,
} from "../../../domains/copilot/memory-service";
import { errorResponse } from "../../../platform/envelope";
import { taskRequestContext } from "../tasks/context";
import { privateRequest, readTaskBody, taskResponse } from "../tasks/http";
type Access = Awaited<ReturnType<typeof taskRequestContext>>;
type ModelDeps = Parameters<typeof captureTaskMemories>[2];
type Operation = "list" | "create" | "change" | "history" | "capture";
async function modelDeps(
  access: NonNullable<Access>,
): Promise<ModelDeps | null> {
  const tenantId = tenantIdOf(access.session);
  if (!tenantId) return null;
  return {
    tenantId,
    subjectToken: (await access.session.accessToken()) ?? undefined,
    atlasClient: new AtlasClient(),
    runosClient: new RunosClient(),
  };
}
// Providers are server-only dependencies, never fields in an HTTP request.
// Real routes always use fresh identity and the original domain services.
export async function memoryHttp(
  request: Request,
  operation: Operation,
  id?: string,
  resolve: () => Promise<Access> = taskRequestContext,
  models: (a: NonNullable<Access>) => Promise<ModelDeps | null> = modelDeps,
): Promise<Response> {
  if (
    operation === "create" ||
    operation === "change" ||
    operation === "capture"
  ) {
    const rejected = privateRequest(request);
    if (rejected) return rejected;
  }
  let input: unknown;
  if (operation === "create" || operation === "change") {
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
          await listPrivateMemories(
            a.context,
            Number(new URL(request.url).searchParams.get("offset") ?? 0),
          ),
        );
      case "create":
        return taskResponse(await createPrivateMemory(a.context, input));
      case "change":
        return taskResponse(
          await changePrivateMemory(a.context, id ?? "", input),
        );
      case "history":
        return taskResponse(
          await searchPrivateHistory(
            a.context,
            new URL(request.url).searchParams.get("q"),
          ),
        );
      case "capture": {
        const deps = await models(a);
        if (!deps)
          return errorResponse(
            400,
            "COPILOT_TASK_TENANT_REQUIRED",
            "no active tenant",
          );
        return taskResponse(
          await captureTaskMemories(a.context, id ?? "", deps),
        );
      }
    }
  } catch {
    return errorResponse(503, "COPILOT_TASK_UNAVAILABLE", "memory unavailable");
  }
}
