// D4 evidence-plane persistence port (yucer_field, ADR-006).
//
// Separate from account/store.ts because it spans a different schema with a
// different write discipline - evidence is append-only and a commitment exposes
// only its lifecycle - but it belongs to the SAME capability domain. ADR-006 is
// explicit that a schema is not a domain.
//
// Two rules shape this interface:
//
//   1. There is no updateInteraction and no deleteInteraction. A correction is
//      recordInteraction() with correctsInteractionId set. The database agrees:
//      the increment revokes UPDATE and never grants DELETE.
//   2. closeCommitment takes a PLAN, not a status. planCommitmentClosure()
//      decides what a closure means; the port only writes what it was handed.
//      A port that accepted `status: "met"` directly would be the way around
//      the evidence rule.

import type {
  ClosureEvidenceKind,
  CommitmentDirection,
  CommitmentStatus,
  InteractionChannel,
} from "./lib/commitment";

export interface InteractionRecord {
  id: string;
  workspaceId: string;
  accountId: string;
  opportunityId: string | null;
  projectId: string | null;
  channel: InteractionChannel;
  direction: "outbound" | "inbound";
  occurredAt: Date;
  actorSub: string;
  subject: string | null;
  /** Verbatim, and never rewritten by a later interpretation. */
  rawNote: string;
  summary: string | null;
  captureMode: string;
  correctsInteractionId: string | null;
}

export interface NewInteraction {
  accountId: string;
  /** Who on our side. Set by the service from the session, never by a caller. */
  actorSub: string;
  opportunityId?: string | null;
  projectId?: string | null;
  channel: InteractionChannel;
  direction?: "outbound" | "inbound";
  occurredAt: Date;
  subject?: string | null;
  rawNote: string;
  summary?: string | null;
  captureMode?: string;
  correctsInteractionId?: string | null;
  /** Who else was there. Written in the same unit of work as the interaction. */
  participants?: readonly NewParticipant[];
}

export interface NewParticipant {
  contactId?: string | null;
  memberSub?: string | null;
  externalName?: string | null;
  roleAtTime?: string | null;
}

export interface ParticipantRecord extends NewParticipant {
  id: string;
  workspaceId: string;
  interactionId: string;
}

export interface CommitmentRecord {
  id: string;
  workspaceId: string;
  accountId: string;
  opportunityId: string | null;
  originInteractionId: string | null;
  direction: CommitmentDirection;
  statement: string;
  ownerSub: string | null;
  counterpartContactId: string | null;
  dueAt: Date;
  status: CommitmentStatus;
  closureEvidenceKind: ClosureEvidenceKind | null;
  closureEvidenceId: string | null;
  metAt: Date | null;
  waivedBySub: string | null;
  waiveReason: string | null;
}

export interface NewCommitment {
  accountId: string;
  opportunityId?: string | null;
  originInteractionId?: string | null;
  direction: CommitmentDirection;
  statement: string;
  ownerSub?: string | null;
  counterpartContactId?: string | null;
  dueAt: Date;
}

/** The whitelisted lifecycle patch - exactly the columns the increment grants. */
export interface CommitmentClosurePatch {
  status: CommitmentStatus;
  closureEvidenceKind?: ClosureEvidenceKind;
  closureEvidenceId?: string;
  metAt?: Date;
  waivedBySub?: string;
  waiveReason?: string;
}

export interface InteractionFilter {
  accountId?: string;
  opportunityId?: string;
  limit?: number;
}

export interface CommitmentFilter {
  accountId?: string;
  opportunityId?: string;
  status?: CommitmentStatus;
  /** Open and past this instant. The overdue list. */
  overdueAt?: Date;
  limit?: number;
}

export interface FieldStore {
  /** Append-only. Returns the row, including the id later evidence cites. */
  recordInteraction(workspaceId: string, input: NewInteraction): Promise<InteractionRecord>;
  listInteractions(workspaceId: string, filter?: InteractionFilter): Promise<InteractionRecord[]>;
  listParticipants(workspaceId: string, interactionId: string): Promise<ParticipantRecord[]>;

  /**
   * Most recent recorded interaction per CONTACT on one account.
   *
   * Its own method rather than a join the caller assembles, because the join is
   * the whole point: interaction_participant is what turns "we contacted this
   * company" into "we contacted this person", and that distinction is what the
   * decision chain needs. A contact absent from the result has no recorded
   * interaction at all, which is deliberately different from having an old one.
   */
  lastContactByContact(workspaceId: string, accountId: string): Promise<Map<string, Date>>;

  /**
   * The most recent interaction instant for an account, or null.
   *
   * Exists as its own method rather than as listInteractions()[0] because it is
   * read on every health recompute and must not pull a note body to answer a
   * question about a date.
   */
  lastContactAt(workspaceId: string, accountId: string): Promise<Date | null>;

  createCommitment(workspaceId: string, input: NewCommitment): Promise<CommitmentRecord>;
  getCommitment(workspaceId: string, id: string): Promise<CommitmentRecord | null>;
  listCommitments(workspaceId: string, filter?: CommitmentFilter): Promise<CommitmentRecord[]>;
  /** Takes a decided plan; see the note at the top of this file. */
  applyClosure(workspaceId: string, id: string, patch: CommitmentClosurePatch): Promise<boolean>;
}

export class InMemoryFieldStore implements FieldStore {
  private interactions: InteractionRecord[] = [];
  private participants: ParticipantRecord[] = [];
  private commitments = new Map<string, CommitmentRecord>();
  private seq = 0;

  async recordInteraction(workspaceId: string, input: NewInteraction): Promise<InteractionRecord> {
    this.seq += 1;
    const row: InteractionRecord = {
      id: `int_${this.seq}`,
      workspaceId,
      accountId: input.accountId,
      opportunityId: input.opportunityId ?? null,
      projectId: input.projectId ?? null,
      channel: input.channel,
      direction: input.direction ?? "outbound",
      occurredAt: input.occurredAt,
      actorSub: input.actorSub,
      subject: input.subject ?? null,
      rawNote: input.rawNote,
      summary: input.summary ?? null,
      captureMode: input.captureMode ?? "manual",
      correctsInteractionId: input.correctsInteractionId ?? null,
    };
    this.interactions.push(row);

    for (const p of input.participants ?? []) {
      this.seq += 1;
      this.participants.push({
        id: `par_${this.seq}`,
        workspaceId,
        interactionId: row.id,
        contactId: p.contactId ?? null,
        memberSub: p.memberSub ?? null,
        externalName: p.externalName ?? null,
        roleAtTime: p.roleAtTime ?? null,
      });
    }
    return { ...row };
  }

  async listInteractions(workspaceId: string, filter: InteractionFilter = {}): Promise<InteractionRecord[]> {
    let rows = this.interactions.filter((i) => i.workspaceId === workspaceId);
    if (filter.accountId) rows = rows.filter((i) => i.accountId === filter.accountId);
    if (filter.opportunityId) rows = rows.filter((i) => i.opportunityId === filter.opportunityId);
    // Newest first, matching the adapter's ORDER BY.
    rows = [...rows].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  async lastContactByContact(workspaceId: string, accountId: string): Promise<Map<string, Date>> {
    const onAccount = new Map<string, Date>();
    for (const i of this.interactions) {
      if (i.workspaceId !== workspaceId || i.accountId !== accountId) continue;
      onAccount.set(i.id, i.occurredAt);
    }
    const out = new Map<string, Date>();
    for (const p of this.participants) {
      if (p.workspaceId !== workspaceId || !p.contactId) continue;
      const at = onAccount.get(p.interactionId);
      if (!at) continue;
      const prior = out.get(p.contactId);
      if (!prior || at.getTime() > prior.getTime()) out.set(p.contactId, at);
    }
    return out;
  }

  async listParticipants(workspaceId: string, interactionId: string): Promise<ParticipantRecord[]> {
    return this.participants.filter((p) => p.workspaceId === workspaceId && p.interactionId === interactionId);
  }

  async lastContactAt(workspaceId: string, accountId: string): Promise<Date | null> {
    const rows = this.interactions.filter((i) => i.workspaceId === workspaceId && i.accountId === accountId);
    if (rows.length === 0) return null;
    return new Date(Math.max(...rows.map((i) => i.occurredAt.getTime())));
  }

  async createCommitment(workspaceId: string, input: NewCommitment): Promise<CommitmentRecord> {
    this.seq += 1;
    const row: CommitmentRecord = {
      id: `cmt_${this.seq}`,
      workspaceId,
      accountId: input.accountId,
      opportunityId: input.opportunityId ?? null,
      originInteractionId: input.originInteractionId ?? null,
      direction: input.direction,
      statement: input.statement,
      ownerSub: input.ownerSub ?? null,
      counterpartContactId: input.counterpartContactId ?? null,
      dueAt: input.dueAt,
      status: "open",
      closureEvidenceKind: null,
      closureEvidenceId: null,
      metAt: null,
      waivedBySub: null,
      waiveReason: null,
    };
    this.commitments.set(row.id, row);
    return { ...row };
  }

  async getCommitment(workspaceId: string, id: string): Promise<CommitmentRecord | null> {
    const row = this.commitments.get(id);
    return row && row.workspaceId === workspaceId ? { ...row } : null;
  }

  async listCommitments(workspaceId: string, filter: CommitmentFilter = {}): Promise<CommitmentRecord[]> {
    let rows = [...this.commitments.values()].filter((c) => c.workspaceId === workspaceId);
    if (filter.accountId) rows = rows.filter((c) => c.accountId === filter.accountId);
    if (filter.opportunityId) rows = rows.filter((c) => c.opportunityId === filter.opportunityId);
    if (filter.status) rows = rows.filter((c) => c.status === filter.status);
    if (filter.overdueAt) {
      const at = filter.overdueAt.getTime();
      rows = rows.filter((c) => c.status === "open" && c.dueAt.getTime() < at);
    }
    // Soonest due first: the overdue list is a work queue, and the oldest
    // broken promise is the one that matters most.
    rows = [...rows].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  async applyClosure(workspaceId: string, id: string, patch: CommitmentClosurePatch): Promise<boolean> {
    const row = this.commitments.get(id);
    if (!row || row.workspaceId !== workspaceId) return false;
    row.status = patch.status;
    if (patch.closureEvidenceKind !== undefined) row.closureEvidenceKind = patch.closureEvidenceKind;
    if (patch.closureEvidenceId !== undefined) row.closureEvidenceId = patch.closureEvidenceId;
    if (patch.metAt !== undefined) row.metAt = patch.metAt;
    if (patch.waivedBySub !== undefined) row.waivedBySub = patch.waivedBySub;
    if (patch.waiveReason !== undefined) row.waiveReason = patch.waiveReason;
    return true;
  }

  /** Test/offline helper. */
  seed(input: {
    interactions?: InteractionRecord[];
    commitments?: CommitmentRecord[];
    participants?: ParticipantRecord[];
  }): void {
    this.interactions.push(...(input.interactions ?? []));
    for (const c of input.commitments ?? []) this.commitments.set(c.id, { ...c });
    // Participants are seeded separately rather than nested in the interaction,
    // because who was in the room is the join the decision chain reads and a
    // fixture that omitted it would silently render every contact as never
    // having been met.
    this.participants.push(...(input.participants ?? []));
  }
}
