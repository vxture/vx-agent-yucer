import { AtlasClient } from "../../../agent/atlas/client";
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
  if (!session) return Response.json({ error: "not_authenticated" }, { status: 401 });

  const tenantId = tenantIdOf(session);
  if (!tenantId) return Response.json({ error: "no_active_tenant" }, { status: 400 });

  let body: { question?: unknown; sessionId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question : "";
  if (!question.trim()) return Response.json({ error: "question_required" }, { status: 400 });

  if (!shouldStream(session.entitlement, session.authz)) {
    // Not an error - this workspace gets proposals, and proposals need the
    // non-streamed path. Saying so is more useful than streaming a draft.
    return Response.json(
      { error: "streaming_not_applicable", use: "/api/copilot/turn" },
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
