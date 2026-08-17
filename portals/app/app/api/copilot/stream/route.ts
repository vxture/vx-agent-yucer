import { AtlasClient } from "../../../agent/atlas/client";
import { envelope, errorResponse } from "../../../platform/envelope";
import { getCopilotStore } from "../../../domains/shared/registry";
import { streamCopilotTurn, shouldStream } from "../../../domains/copilot/streaming-turn";
import { resolveAppSession, tenantIdOf } from "../../../(app)/lib/session";

// POST /api/copilot/stream - a streamed turn, as server-sent events.
//
// The frame shape deliberately mirrors what Atlas itself sends, including the
// rule that makes it safe: an error arrives as a FRAME, not as a status code,
// because the response is already 200 by the time anything can fail. A consumer
// that only checks the status would read a truncated answer as a complete one -
// which is the exact trap the Atlas client converts into a throw upstream, and
// the one this endpoint must not reintroduce.
//
// 202 with a redirect hint rather than a stream when the workspace bought
// proposals: those need the tool loop, which needs whole responses.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const session = await resolveAppSession();
  if (!session) return errorResponse(401, "COPILOT_NOT_AUTHENTICATED", "no signed-in member for this request");

  const tenantId = tenantIdOf(session);
  if (!tenantId) return errorResponse(400, "COPILOT_NO_ACTIVE_TENANT", "the session carries no active platform tenant");

  let body: { question?: unknown; sessionId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(400, "COPILOT_BODY_INVALID", "request body is not valid JSON", { field: "body" });
  }

  const question = typeof body.question === "string" ? body.question : "";
  if (!question.trim()) return errorResponse(400, "COPILOT_QUESTION_REQUIRED", "ask something", { field: "question" });

  if (!shouldStream(session.entitlement, session.authz)) {
    // Not an error - this workspace gets proposals, and proposals need the
    // non-streamed path. Saying so is more useful than streaming a draft.
    // Still not a failure: this workspace gets proposals, and proposals need
    // the non-streamed path. The envelope carries the redirect alongside the
    // code rather than instead of it.
    return Response.json(
      { ...envelope("COPILOT_STREAMING_NOT_APPLICABLE", "this workspace uses the proposal path"), use: "/api/copilot/turn" },
      { status: 409 },
    );
  }

  const events = streamCopilotTurn(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getCopilotStore(),
    },
    { question, sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined, tenantId },
    { atlasClient: new AtlasClient() },
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`data:${JSON.stringify(event)}\n\n`));
        }
      } catch (e) {
        // Any failure the generator did not already convert into an error event.
        controller.enqueue(
          encoder.encode(
            `data:${JSON.stringify({ type: "error", code: "stream_failed", message: String(e) })}\n\n`,
          ),
        );
      } finally {
        // The sentinel is sent on every path. A consumer waiting for it after a
        // failure would otherwise hang until its own timeout.
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
    cancel() {
      // The browser went away. Returning the generator runs its finally block,
      // which is what persists the partial answer the member already read.
      void events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
