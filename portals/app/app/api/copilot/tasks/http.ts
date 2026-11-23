import { errorResponse, violationEnvelope } from "../../../platform/envelope";
import type { RuleResult } from "../../../domains/shared/result";
import { getOidcConfig } from "../../../auth/lib/config";
import { isDeployedStage } from "../../../lib/deploy-stage";

export function taskResponse<T>(result: RuleResult<T>): Response {
  if (result.ok)
    return Response.json(result.value, {
      headers: { "Cache-Control": "private, no-store" },
    });
  const code = result.violations[0]?.code ?? "task_refused";
  const status =
    code === "not_found" || code === "source_unavailable"
      ? 404
      : [
            "permission_denied",
            "no_product_access",
            "no_data_access",
            "feature_not_in_tier",
            "access_changed",
          ].includes(code)
        ? 403
        : ["task_model_failed"].includes(code)
          ? 502
          : [
                "task_conflict",
                "request_conflict",
                "turn_in_progress",
                "request_in_progress",
                "request_already_attempted",
                "rule_changed",
                "source_changed",
                "memory_source_changed",
                "memory_conflict",
                "knowledge_conflict",
                "knowledge_source_changed",
                "knowledge_review_changed",
                "checkpoint_changed",
                "task_finished",
                "task_not_active",
              ].includes(code)
            ? 409
            : 400;
  const message = "task request refused";
  return Response.json(
    violationEnvelope(code, message, "COPILOT_TASK", false),
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
function mutationOrigin(request: Request): string | null {
  // A TLS proxy can leave Request.url pointing at the HTTP container. Only
  // server configuration establishes the public origin; forwarded headers do not.
  const configured = getOidcConfig().appOrigin;
  const candidate = configured || (isDeployedStage() ? "" : request.url);
  try {
    const url = new URL(candidate);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username && !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function privateRequest(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const expectedOrigin = mutationOrigin(request);
  if (
    !expectedOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== expectedOrigin)
  )
    return errorResponse(
      403,
      "COPILOT_TASK_ORIGIN_DENIED",
      "request origin refused",
    );
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 32768)
    return errorResponse(
      413,
      "COPILOT_TASK_BODY_TOO_LARGE",
      "request too large",
    );
  return null;
}

// Content-Length is optional and untrusted. Bound the actual streamed body too.
export async function readTaskBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (!reader) throw new Error("empty_body");
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32768) {
        await reader.cancel();
        return {
          ok: false,
          response: errorResponse(
            413,
            "COPILOT_TASK_BODY_TOO_LARGE",
            "request too large",
          ),
        };
      }
      chunks.push(value);
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)),
    };
  } catch {
    return {
      ok: false,
      response: errorResponse(
        400,
        "COPILOT_TASK_BODY_INVALID",
        "invalid request body",
      ),
    };
  } finally {
    reader?.releaseLock();
  }
}
