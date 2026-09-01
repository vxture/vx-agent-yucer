// D8 copilot persistence port.
//
// The interface deliberately offers NO way to update a proposal's content.
// There is `createProposals` and there is `applyDecision`, and nothing that
// takes a payload/rationale/confidence for an existing row. The column locks
// enforce that at the database and assertProposalUnchanged() enforces it in the
// rules, but the strongest version of the rule is an API through which the
// wrong write cannot be expressed at all.
//
// Messages are append-only for the same reason: an edited transcript is not a
// transcript.

import type { ActionPatch, ActionStatus, AgentAction, SubjectType } from "./lib/action";
import type { AutonomyMode } from "./lib/autonomy";
import { asc, by, desc } from "../shared/order";

export interface SessionRecord {
  id: string;
  workspaceId: string;
  actorSub: string;
  subjectType: SubjectType | null;
  subjectId: string | null;
  title: string | null;
  status: string;
  updatedAt: Date;
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  seq: number;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tokenCount: number | null;
  createdAt: Date;
}

export interface NewProposal {
  sessionId: string | null;
  actionType: string;
  /** ADR-015. Set at creation; the column has no UPDATE grant. */
  capability?: string | null;
  subjectType: SubjectType;
  subjectId: string;
  payload: Record<string, unknown>;
  rationale: string | null;
  confidence: number | null;
}

/** The eight capability domains a play can be filed under. */
export type PlaybookScope =
  | "strategy" | "planning" | "campaign" | "account"
  | "signal" | "pipeline" | "delivery" | "copilot";

export interface PlaybookRecord {
  id: string;
  playbookCode: string;
  name: string;
  scopeDomain: PlaybookScope;
  content: string;
  version: number;
  status: string;
}

export interface PlaybookFilter {
  scopeDomain?: PlaybookScope;
  /** Only `active` plays ground a turn - see the note in the service. */
  activeOnly?: boolean;
  limit?: number;
}

export interface AutonomyRecord {
  workspaceId: string;
  mode: AutonomyMode;
  /** Who authorised it. "the agent did this unasked" must answer with a name. */
  decidedBySub: string | null;
  updatedAt: Date;
}

export interface ProposalFilter {
  status?: ActionStatus;
  subjectType?: SubjectType;
  subjectId?: string;
  limit?: number;
}

export interface CopilotStore {
  createSession(
    workspaceId: string,
    input: { actorSub: string; subjectType?: SubjectType | null; subjectId?: string | null; title?: string | null },
  ): Promise<SessionRecord>;
  getSession(workspaceId: string, id: string): Promise<SessionRecord | null>;
  listSessions(workspaceId: string, actorSub: string, limit?: number): Promise<SessionRecord[]>;

  /** Append-only. `seq` is assigned by the store so two writers cannot collide
   * on a sequence the caller guessed. */
  appendMessage(
    workspaceId: string,
    input: { sessionId: string; role: MessageRecord["role"]; content: string; tokenCount?: number | null },
  ): Promise<MessageRecord>;
  listMessages(workspaceId: string, sessionId: string): Promise<MessageRecord[]>;

  /** Proposals are created in `proposed`; the store never accepts a status. */
  createProposals(workspaceId: string, proposals: readonly NewProposal[]): Promise<AgentAction[]>;
  listProposals(workspaceId: string, filter?: ProposalFilter): Promise<AgentAction[]>;
  getProposal(workspaceId: string, id: string): Promise<AgentAction | null>;

  /**
   * Apply a decision produced by planDecision / planExecution / planExpiry.
   *
   * `from` is the set of statuses the caller believes the row is in, and it
   * becomes a compare-and-set: the write only lands if the row is still there.
   * It is passed rather than assumed because the legal source differs per
   * transition - a decision comes from `proposed`, an execution from `accepted`
   * (or from `proposed` under autopilot). Hardcoding one of them would make the
   * other impossible.
   *
   * Returns the ids that actually moved. A proposal decided by someone else
   * between render and submit is skipped rather than overwritten.
   */
  applyDecision(
    workspaceId: string,
    decisions: readonly { id: string; patch: ActionPatch; from: readonly ActionStatus[] }[],
  ): Promise<string[]>;

  listPlaybooks(workspaceId: string, filter?: PlaybookFilter): Promise<PlaybookRecord[]>;

  /**
   * The workspace's posture toward its copilot, and who set it.
   *
   * NULL WHEN NOBODY HAS SET IT, rather than a defaulted row. A workspace that
   * has never opened the setting has not authorised anything, and returning
   * `ask_always` as if somebody had chosen it would put a decision in
   * somebody's mouth. The service supplies the safe default; the port reports
   * the fact.
   */
  getAutonomy(workspaceId: string): Promise<AutonomyRecord | null>;

  /** Upsert by workspace: one posture per workspace, replaced not appended. */
  setAutonomy(
    workspaceId: string,
    input: { mode: AutonomyMode; decidedBySub: string; at?: Date },
  ): Promise<AutonomyRecord>;

  /**
   * Defer one derived judgement out of one member's queue.
   *
   * Upsert, not append: re-snoozing the same conclusion moves the existing row
   * so "how long has this been deferred" stays answerable, which a growing pile
   * of rows would not.
   */
  snoozeJudgement(
    workspaceId: string,
    input: { sub: string; judgementId: string; urgency: string; until: Date },
  ): Promise<void>;

  /** The live snoozes for one member. Expired rows are not returned. */
  listSnoozes(
    workspaceId: string,
    sub: string,
    now: Date,
  ): Promise<{ judgementId: string; urgency: string; until: Date }[]>;
}

export class InMemoryCopilotStore implements CopilotStore {
  private snoozes = new Map<string, { urgency: string; until: Date }>();
  private sessions = new Map<string, SessionRecord>();
  private messages: Array<MessageRecord & { workspaceId: string }> = [];
  private actions = new Map<string, AgentAction & { workspaceId: string }>();
  private playbooks: Array<PlaybookRecord & { workspaceId: string }> = [];
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  seedProposals(workspaceId: string, actions: AgentAction[]): void {
    for (const a of actions) this.actions.set(a.id, { ...a, workspaceId });
  }

  seedPlaybooks(workspaceId: string, playbooks: PlaybookRecord[]): void {
    this.playbooks.push(...playbooks.map((p) => ({ ...p, workspaceId })));
  }

  private autonomy = new Map<string, AutonomyRecord>();

  async getAutonomy(workspaceId: string): Promise<AutonomyRecord | null> {
    return this.autonomy.get(workspaceId) ?? null;
  }

  async setAutonomy(
    workspaceId: string,
    input: { mode: AutonomyMode; decidedBySub: string; at?: Date },
  ): Promise<AutonomyRecord> {
    const row: AutonomyRecord = {
      workspaceId,
      mode: input.mode,
      decidedBySub: input.decidedBySub,
      updatedAt: input.at ?? new Date(),
    };
    this.autonomy.set(workspaceId, row);
    return row;
  }

  async listPlaybooks(workspaceId: string, filter: PlaybookFilter = {}): Promise<PlaybookRecord[]> {
    let rows = this.playbooks.filter((p) => p.workspaceId === workspaceId);
    if (filter.scopeDomain) rows = rows.filter((p) => p.scopeDomain === filter.scopeDomain);
    if (filter.activeOnly !== false) rows = rows.filter((p) => p.status === "active");
    // The grounding limit slices this list, so an unordered one made "which
    // three plays shape the answer" arbitrary offline and version-ordered in
    // production - the same question answered two ways.
    rows = [...rows].sort(
      by(desc((p: PlaybookRecord) => p.version), asc((p: PlaybookRecord) => p.playbookCode)),
    );
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  async createSession(
    workspaceId: string,
    input: { actorSub: string; subjectType?: SubjectType | null; subjectId?: string | null; title?: string | null },
  ): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: this.nextId("ses"),
      workspaceId,
      actorSub: input.actorSub,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      title: input.title ?? null,
      status: "open",
      updatedAt: new Date(),
    };
    this.sessions.set(record.id, record);
    return record;
  }

  async getSession(workspaceId: string, id: string): Promise<SessionRecord | null> {
    const s = this.sessions.get(id);
    return s && s.workspaceId === workspaceId ? { ...s } : null;
  }

  async listSessions(workspaceId: string, actorSub: string, limit = 20): Promise<SessionRecord[]> {
    return [...this.sessions.values()]
      .filter((s) => s.workspaceId === workspaceId && s.actorSub === actorSub)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }

  async appendMessage(
    workspaceId: string,
    input: { sessionId: string; role: MessageRecord["role"]; content: string; tokenCount?: number | null },
  ): Promise<MessageRecord> {
    const session = await this.getSession(workspaceId, input.sessionId);
    if (!session) throw new Error(`session ${input.sessionId} is not in workspace ${workspaceId}`);
    const seq = this.messages.filter((m) => m.sessionId === input.sessionId).length + 1;
    const record: MessageRecord & { workspaceId: string } = {
      id: this.nextId("msg"),
      workspaceId,
      sessionId: input.sessionId,
      seq,
      role: input.role,
      content: input.content,
      tokenCount: input.tokenCount ?? null,
      createdAt: new Date(),
    };
    this.messages.push(record);
    return record;
  }

  async listMessages(workspaceId: string, sessionId: string): Promise<MessageRecord[]> {
    return this.messages
      .filter((m) => m.workspaceId === workspaceId && m.sessionId === sessionId)
      .sort((a, b) => a.seq - b.seq);
  }

  async createProposals(workspaceId: string, proposals: readonly NewProposal[]): Promise<AgentAction[]> {
    const created: AgentAction[] = [];
    for (const p of proposals) {
      // The same floor the database enforces (0016): one OPEN proposal per
      // (workspace, actionType, payload.commitmentId). A duplicate arriving
      // second is skipped, not an error - it is the race being won by the
      // other writer. Proposals without a commitmentId are unconstrained,
      // matching the index's NULL semantics.
      const cid = (p.payload as { commitmentId?: unknown }).commitmentId;
      if (typeof cid === "string") {
        const open = [...this.actions.values()].some(
          (a) =>
            a.workspaceId === workspaceId &&
            a.actionType === p.actionType &&
            a.status === "proposed" &&
            (a.payload as { commitmentId?: unknown }).commitmentId === cid,
        );
        if (open) continue;
      }
      const action: AgentAction & { workspaceId: string } = {
        id: this.nextId("act"),
        workspaceId,
        // Always `proposed`. The store has no parameter for anything else.
        status: "proposed",
        actionType: p.actionType,
      capability: p.capability ?? null,
        subjectType: p.subjectType,
        subjectId: p.subjectId,
        payload: p.payload,
        rationale: p.rationale,
        confidence: p.confidence,
        decidedBySub: null,
        decidedAt: null,
        executedAt: null,
        createdAt: new Date(),
      };
      this.actions.set(action.id, action);
      created.push(action);
    }
    return created;
  }

  async listProposals(workspaceId: string, filter: ProposalFilter = {}): Promise<AgentAction[]> {
    let rows = [...this.actions.values()].filter((a) => a.workspaceId === workspaceId);
    if (filter.status) rows = rows.filter((a) => a.status === filter.status);
    if (filter.subjectType) rows = rows.filter((a) => a.subjectType === filter.subjectType);
    if (filter.subjectId) rows = rows.filter((a) => a.subjectId === filter.subjectId);
    rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return (filter.limit ? rows.slice(0, filter.limit) : rows).map((a) => ({ ...a }));
  }

  async getProposal(workspaceId: string, id: string): Promise<AgentAction | null> {
    const a = this.actions.get(id);
    return a && a.workspaceId === workspaceId ? { ...a } : null;
  }

  async applyDecision(
    workspaceId: string,
    decisions: readonly { id: string; patch: ActionPatch; from: readonly ActionStatus[] }[],
  ): Promise<string[]> {
    const moved: string[] = [];
    for (const d of decisions) {
      const a = this.actions.get(d.id);
      if (!a || a.workspaceId !== workspaceId) continue;
      // Someone else may have moved it between render and submit. Skipping is
      // correct; overwriting would erase their decision and their name with it.
      if (!d.from.includes(a.status)) continue;
      a.status = d.patch.status;
      if (d.patch.decidedBySub !== undefined) a.decidedBySub = d.patch.decidedBySub;
      if (d.patch.decidedAt !== undefined) a.decidedAt = d.patch.decidedAt;
      if (d.patch.executedAt !== undefined) a.executedAt = d.patch.executedAt;
      moved.push(d.id);
    }
    return moved;
  }
  async snoozeJudgement(
    workspaceId: string,
    input: { sub: string; judgementId: string; urgency: string; until: Date },
  ): Promise<void> {
    this.snoozes.set(`${workspaceId}|${input.sub}|${input.judgementId}`, {
      urgency: input.urgency,
      until: input.until,
    });
  }

  async listSnoozes(
    workspaceId: string,
    sub: string,
    now: Date,
  ): Promise<{ judgementId: string; urgency: string; until: Date }[]> {
    const prefix = `${workspaceId}|${sub}|`;
    return [...this.snoozes]
      .filter(([k, v]) => k.startsWith(prefix) && v.until.getTime() > now.getTime())
      .map(([k, v]) => ({ judgementId: k.slice(prefix.length), urgency: v.urgency, until: v.until }));
  }

}
