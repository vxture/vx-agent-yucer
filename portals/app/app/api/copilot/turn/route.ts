import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import { getCopilotStore } from "../../../domains/shared/registry";
import { runCopilotTurn } from "../../../domains/copilot/turn-service";
import { resolveAppSession, tenantIdOf } from "../../../(app)/lib/session";
import type { SubjectType } from "../../../domains/copilot/lib/action";

// POST /api/copilot/turn - ask the copilot.
//
// The route is deliberately thin. Everything that decides an outcome lives in
// runCopilotTurn(): both gates, the transcript, the model call, the proposal
// write. A route that made any of those decisions itself would be a second place
// they could be made differently.
//
// Nothing here is cached and nothing is streamed yet. Streaming is available in
// the Atlas client (chatStream) but is not wired: a streamed turn still has to
// persist the same transcript and proposals at the end, and getting that right
// is its own change.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TurnBody {
  question?: unknown;
  sessionId?: unknown;
  subjectType?: unknown;
  subjectId?: unknown;
}

const SUBJECT_TYPES = new Set(["account", "lead", "opportunity", "project", "campaign", "plan"]);

export async function POST(request: Request): Promise<Response> {
  const session = await resolveAppSession();
  if (!session) return json(401, { error: "not_authenticated" });

  const tenantId = tenantIdOf(session);
  if (!tenantId) return json(400, { error: "no_active_tenant" });

  let body: TurnBody;
  try {
    body = (await request.json()) as TurnBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const question = typeof body.question === "string" ? body.question : "";
  if (!question.trim()) return json(400, { error: "question_required" });

  // The subject is only accepted as a matched pair. A type without an id (or the
  // reverse) violates chk_agent_session_subject_pair at the database, and the
  // request is wrong either way.
  const subjectType = typeof body.subjectType === "string" ? body.subjectType : null;
  const subjectId = typeof body.subjectId === "string" ? body.subjectId : null;
  if ((subjectType == null) !== (subjectId == null)) {
    return json(400, { error: "subject_pair_required" });
  }
  if (subjectType != null && !SUBJECT_TYPES.has(subjectType)) {
    return json(400, { error: "unknown_subject_type" });
  }

  const result = await runCopilotTurn(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getCopilotStore(),
    },
    {
      question,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      subject:
        subjectType && subjectId
          ? { type: subjectType as SubjectType, id: subjectId }
          : undefined,
      tenantId,
    },
    { atlasClient: new AtlasClient(), runosClient: new RunosClient() },
  );

  if (!result.ok) {
    const code = result.violations[0]?.code ?? "denied";
    // A gate refusal is 403; a bad reference is 404; everything else is a
    // dependency failure, which is 502 rather than 500 - the fault is upstream
    // and the distinction tells an operator where to look.
    const status = code === "not_found" ? 404 : isGateCode(code) ? 403 : 502;
    return json(status, { error: code, violations: result.violations });
  }

  const { session: chat, answer, proposals, droppedProposals, invocations, truncated } = result.value;
  return json(200, {
    sessionId: chat.id,
    answer,
    // Proposals are returned so the caller can render them immediately. They are
    // `proposed` and nothing has happened yet.
    proposals: proposals.map((p) => ({
      id: p.id,
      actionType: p.actionType,
      subjectType: p.subjectType,
      subjectId: p.subjectId,
      rationale: p.rationale,
      confidence: p.confidence,
      status: p.status,
    })),
    droppedProposals,
    capabilitiesUsed: invocations.filter((i) => i.ok).map((i) => i.capabilityId),
    truncated,
  });
}

function isGateCode(code: string): boolean {
  return (
    code === "no_product_access" ||
    code === "no_data_access" ||
    code === "feature_not_in_tier" ||
    code === "permission_denied"
  );
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}
