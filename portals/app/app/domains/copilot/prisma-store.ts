import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import type { ActionPatch, ActionStatus, AgentAction, SubjectType } from "./lib/action";
import type {
  CopilotStore,
  PlaybookFilter,
  PlaybookRecord,
  PlaybookScope,
  MessageRecord,
  NewProposal,
  ProposalFilter,
  SessionRecord,
} from "./store";

// Prisma-backed CopilotStore over yucer_agent.
//
// agent_message and the proposal content are append-only / frozen at the
// database. This adapter never writes them after creation, and every decision
// patch is checked against the column-lock mirror first.

const ACTION_TABLE = "yucer_agent.agent_action";

function toAction(r: Record<string, unknown>): AgentAction {
  return {
    id: String(r.id),
    status: r.status as AgentAction["status"],
    actionType: String(r.actionType),
    subjectType: r.subjectType as SubjectType,
    subjectId: String(r.subjectId),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    rationale: (r.rationale as string | null) ?? null,
    confidence: (r.confidence as number | null) ?? null,
    decidedBySub: (r.decidedBySub as string | null) ?? null,
    decidedAt: (r.decidedAt as Date | null) ?? null,
    executedAt: (r.executedAt as Date | null) ?? null,
    createdAt: r.createdAt as Date,
  };
}

export class PrismaCopilotStore implements CopilotStore {
  async createSession(
    workspaceId: string,
    input: { actorSub: string; subjectType?: SubjectType | null; subjectId?: string | null; title?: string | null },
  ): Promise<SessionRecord> {
    const p = await getPrismaClient();
    const row = await p.agentSession.create({
      data: {
        workspaceId,
        actorSub: input.actorSub,
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        title: input.title ?? null,
      },
    });
    return toSession(row as Record<string, unknown>);
  }

  async getSession(workspaceId: string, id: string): Promise<SessionRecord | null> {
    const p = await getPrismaClient();
    const row = await p.agentSession.findFirst({ where: { id, workspaceId } });
    return row ? toSession(row as Record<string, unknown>) : null;
  }

  async listSessions(workspaceId: string, actorSub: string, limit = 20): Promise<SessionRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.agentSession.findMany({
      where: { workspaceId, actorSub },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    return rows.map((r: Record<string, unknown>) => toSession(r));
  }

  async appendMessage(
    workspaceId: string,
    input: { sessionId: string; role: MessageRecord["role"]; content: string; tokenCount?: number | null },
  ): Promise<MessageRecord> {
    const p = await getPrismaClient();
    const session = await p.agentSession.findFirst({ where: { id: input.sessionId, workspaceId } });
    if (!session) throw new Error(`session ${input.sessionId} is not in workspace ${workspaceId}`);

    // seq is allocated inside the transaction that inserts the row. Reading the
    // max outside one lets two concurrent turns pick the same seq and collide on
    // uidx_agent_message_session_seq.
    return p.$transaction(async (tx) => {
      const last = await tx.agentMessage.findFirst({
        where: { sessionId: input.sessionId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const seq = last ? BigInt(last.seq) + 1n : 1n;
      const row = await tx.agentMessage.create({
        data: {
          workspaceId,
          sessionId: input.sessionId,
          seq,
          role: input.role,
          content: input.content,
          tokenCount: input.tokenCount ?? null,
        },
      });
      // Touching the session keeps the "recent sessions" ordering honest.
      await tx.agentSession.updateMany({
        where: { id: input.sessionId, workspaceId },
        data: { updatedAt: new Date() },
      });
      return toMessage(row as Record<string, unknown>);
    });
  }

  async listMessages(workspaceId: string, sessionId: string): Promise<MessageRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.agentMessage.findMany({
      where: { workspaceId, sessionId },
      orderBy: { seq: "asc" },
    });
    return rows.map((r: Record<string, unknown>) => toMessage(r));
  }

  async createProposals(workspaceId: string, proposals: readonly NewProposal[]): Promise<AgentAction[]> {
    const p = await getPrismaClient();
    const created: AgentAction[] = [];
    for (const proposal of proposals) {
      const row = await p.agentAction.create({
        data: {
          workspaceId,
          sessionId: proposal.sessionId,
          actionType: proposal.actionType,
          subjectType: proposal.subjectType,
          subjectId: proposal.subjectId,
          // JSONB in the DDL. The cast is to Prisma's input JSON type, not a
          // loosening of the shape - NewProposal.payload is already an object.
          payload: proposal.payload as Record<string, never>,
          rationale: proposal.rationale,
          confidence: proposal.confidence,
          // status defaults to `proposed` in the DDL and is not set here: a
          // proposal that arrives already accepted is the failure this whole
          // domain exists to prevent.
        },
      });
      created.push(toAction(row as Record<string, unknown>));
    }
    return created;
  }

  async listProposals(workspaceId: string, filter: ProposalFilter = {}): Promise<AgentAction[]> {
    const p = await getPrismaClient();
    const rows = await p.agentAction.findMany({
      where: {
        workspaceId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.subjectType ? { subjectType: filter.subjectType } : {}),
        ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      },
      orderBy: { createdAt: "desc" },
      ...(filter.limit ? { take: filter.limit } : {}),
    });
    return rows.map((r: Record<string, unknown>) => toAction(r));
  }

  async getProposal(workspaceId: string, id: string): Promise<AgentAction | null> {
    const p = await getPrismaClient();
    const row = await p.agentAction.findFirst({ where: { id, workspaceId } });
    return row ? toAction(row as Record<string, unknown>) : null;
  }

  async listPlaybooks(workspaceId: string, filter: PlaybookFilter = {}): Promise<PlaybookRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.agentPlaybook.findMany({
      where: {
        workspaceId,
        ...(filter.scopeDomain ? { scopeDomain: filter.scopeDomain } : {}),
        ...(filter.activeOnly === false ? {} : { status: "active" }),
      },
      // Newest version first: a play that was revised should ground on its
      // current text, not on whichever row the database happened to return.
      orderBy: [{ version: "desc" }, { playbookCode: "asc" }],
      ...(filter.limit ? { take: filter.limit } : {}),
    });
    return rows.map((r: Record<string, unknown>) => toPlaybook(r));
  }

  async applyDecision(
    workspaceId: string,
    decisions: readonly { id: string; patch: ActionPatch; from: readonly ActionStatus[] }[],
  ): Promise<string[]> {
    if (decisions.length === 0) return [];
    const p = await getPrismaClient();
    const moved: string[] = [];

    for (const d of decisions) {
      const data: Record<string, unknown> = { status: d.patch.status, updatedAt: new Date() };
      if (d.patch.decidedBySub !== undefined) data.decidedBySub = d.patch.decidedBySub;
      if (d.patch.decidedAt !== undefined) data.decidedAt = d.patch.decidedAt;
      if (d.patch.executedAt !== undefined) data.executedAt = d.patch.executedAt;

      const guard = assertWritable(ACTION_TABLE, data);
      if (!guard.ok) {
        throw new Error(
          `refusing to write locked columns: ${guard.violations.map((v) => v.message).join("; ")}`,
        );
      }

      // The `from` set in the WHERE makes this a compare-and-set. Someone else
      // may have moved this proposal between render and submit; their decision
      // and their name must not be overwritten by a stale form.
      const res = await p.agentAction.updateMany({
        where: { id: d.id, workspaceId, status: { in: [...d.from] } },
        data,
      });
      if (res.count > 0) moved.push(d.id);
    }
    return moved;
  }
}

function toPlaybook(r: Record<string, unknown>): PlaybookRecord {
  return {
    id: String(r.id),
    playbookCode: String(r.playbookCode),
    name: String(r.name),
    scopeDomain: r.scopeDomain as PlaybookScope,
    content: String(r.content),
    version: Number(r.version),
    status: String(r.status),
  };
}

function toSession(r: Record<string, unknown>): SessionRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    actorSub: String(r.actorSub),
    subjectType: (r.subjectType as SubjectType | null) ?? null,
    subjectId: (r.subjectId as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    status: String(r.status),
    updatedAt: r.updatedAt as Date,
  };
}

function toMessage(r: Record<string, unknown>): MessageRecord {
  return {
    id: String(r.id),
    sessionId: String(r.sessionId),
    seq: Number(r.seq),
    role: r.role as MessageRecord["role"],
    content: String(r.content),
    tokenCount: (r.tokenCount as number | null) ?? null,
    createdAt: r.createdAt as Date,
  };
}
