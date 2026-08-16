import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import type {
  ClosureEvidenceKind,
  CommitmentDirection,
  CommitmentStatus,
  InteractionChannel,
} from "./lib/commitment";
import type {
  CommitmentClosurePatch,
  CommitmentFilter,
  CommitmentRecord,
  FieldStore,
  InteractionFilter,
  InteractionRecord,
  NewCommitment,
  NewInteraction,
  ParticipantRecord,
} from "./field-store";

// Prisma-backed FieldStore over yucer_field (ADR-006).
//
// There is no updateInteraction here and there cannot be one: incr/0004 revokes
// UPDATE on the evidence tables and never grants DELETE, so a correction is a
// new row and an erasure is an operator action through db-init. The port has no
// method for either, which is the point.
//
// The commitment closure runs through assertWritable() like every other write
// in this repo, against the mirror that now reads the increment's locks too.

const COMMITMENT_TABLE = "yucer_field.commitment";

export class PrismaFieldStore implements FieldStore {
  async recordInteraction(workspaceId: string, input: NewInteraction): Promise<InteractionRecord> {
    const p = await getPrismaClient();

    // One transaction. An interaction whose participants failed to write is a
    // meeting nobody attended - and participants are the half that answers
    // "has anyone here ever MET the economic buyer".
    return p.$transaction(async (tx) => {
      const row = await tx.interaction.create({
        data: {
          workspaceId,
          accountId: input.accountId,
          opportunityId: input.opportunityId ?? null,
          projectId: input.projectId ?? null,
          channel: input.channel,
          direction: input.direction ?? "outbound",
          occurredAt: input.occurredAt,
          actorSub: input.actorSub ?? "",
          subject: input.subject ?? null,
          rawNote: input.rawNote,
          summary: input.summary ?? null,
          captureMode: input.captureMode ?? "manual",
          correctsInteractionId: input.correctsInteractionId ?? null,
        },
      });

      for (const part of input.participants ?? []) {
        await tx.interactionParticipant.create({
          data: {
            workspaceId,
            interactionId: row.id as string,
            contactId: part.contactId ?? null,
            memberSub: part.memberSub ?? null,
            externalName: part.externalName ?? null,
            roleAtTime: part.roleAtTime ?? null,
          },
        });
      }

      return toInteraction(row as Record<string, unknown>);
    });
  }

  async listInteractions(workspaceId: string, filter: InteractionFilter = {}): Promise<InteractionRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.interaction.findMany({
      where: {
        workspaceId,
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.opportunityId ? { opportunityId: filter.opportunityId } : {}),
      },
      orderBy: { occurredAt: "desc" },
      ...(filter.limit ? { take: filter.limit } : {}),
    });
    return rows.map((r: Record<string, unknown>) => toInteraction(r));
  }

  async listParticipants(workspaceId: string, interactionId: string): Promise<ParticipantRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.interactionParticipant.findMany({ where: { workspaceId, interactionId } });
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      workspaceId: String(r.workspaceId),
      interactionId: String(r.interactionId),
      contactId: r.contactId == null ? null : String(r.contactId),
      memberSub: r.memberSub == null ? null : String(r.memberSub),
      externalName: r.externalName == null ? null : String(r.externalName),
      roleAtTime: r.roleAtTime == null ? null : String(r.roleAtTime),
    }));
  }

  async lastContactAt(workspaceId: string, accountId: string): Promise<Date | null> {
    const p = await getPrismaClient();
    // select the one column - this is read on every health recompute and must
    // not pull note bodies to answer a question about a date.
    const row = await p.interaction.findFirst({
      where: { workspaceId, accountId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    });
    return row ? (row.occurredAt as Date) : null;
  }

  async createCommitment(workspaceId: string, input: NewCommitment): Promise<CommitmentRecord> {
    const p = await getPrismaClient();
    const row = await p.commitment.create({
      data: {
        workspaceId,
        accountId: input.accountId,
        opportunityId: input.opportunityId ?? null,
        originInteractionId: input.originInteractionId ?? null,
        direction: input.direction,
        statement: input.statement,
        ownerSub: input.ownerSub ?? null,
        counterpartContactId: input.counterpartContactId ?? null,
        dueAt: input.dueAt,
      },
    });
    return toCommitment(row as Record<string, unknown>);
  }

  async getCommitment(workspaceId: string, id: string): Promise<CommitmentRecord | null> {
    const p = await getPrismaClient();
    const row = await p.commitment.findFirst({ where: { id, workspaceId } });
    return row ? toCommitment(row as Record<string, unknown>) : null;
  }

  async listCommitments(workspaceId: string, filter: CommitmentFilter = {}): Promise<CommitmentRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.commitment.findMany({
      where: {
        workspaceId,
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.opportunityId ? { opportunityId: filter.opportunityId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.overdueAt ? { status: "open", dueAt: { lt: filter.overdueAt } } : {}),
      },
      // Soonest due first: the oldest broken promise is the one that matters.
      orderBy: { dueAt: "asc" },
      ...(filter.limit ? { take: filter.limit } : {}),
    });
    return rows.map((r: Record<string, unknown>) => toCommitment(r));
  }

  async applyClosure(workspaceId: string, id: string, plan: CommitmentClosurePatch): Promise<boolean> {
    const p = await getPrismaClient();

    const patch: Record<string, unknown> = { status: plan.status, updatedAt: new Date() };
    if (plan.closureEvidenceKind !== undefined) patch.closureEvidenceKind = plan.closureEvidenceKind;
    if (plan.closureEvidenceId !== undefined) patch.closureEvidenceId = plan.closureEvidenceId;
    if (plan.metAt !== undefined) patch.metAt = plan.metAt;
    if (plan.waivedBySub !== undefined) patch.waivedBySub = plan.waivedBySub;
    if (plan.waiveReason !== undefined) patch.waiveReason = plan.waiveReason;

    const guard = assertWritable(COMMITMENT_TABLE, patch);
    if (!guard.ok) {
      throw new Error(
        `refusing to write locked columns: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const updated = await p.commitment.updateMany({ where: { id, workspaceId }, data: patch });
    return updated.count > 0;
  }
}

function toInteraction(r: Record<string, unknown>): InteractionRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    accountId: String(r.accountId),
    opportunityId: r.opportunityId == null ? null : String(r.opportunityId),
    projectId: r.projectId == null ? null : String(r.projectId),
    channel: String(r.channel) as InteractionChannel,
    direction: String(r.direction) as "outbound" | "inbound",
    occurredAt: r.occurredAt as Date,
    actorSub: String(r.actorSub),
    subject: r.subject == null ? null : String(r.subject),
    rawNote: String(r.rawNote),
    summary: r.summary == null ? null : String(r.summary),
    captureMode: String(r.captureMode),
    correctsInteractionId: r.correctsInteractionId == null ? null : String(r.correctsInteractionId),
  };
}

function toCommitment(r: Record<string, unknown>): CommitmentRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    accountId: String(r.accountId),
    opportunityId: r.opportunityId == null ? null : String(r.opportunityId),
    originInteractionId: r.originInteractionId == null ? null : String(r.originInteractionId),
    direction: String(r.direction) as CommitmentDirection,
    statement: String(r.statement),
    ownerSub: r.ownerSub == null ? null : String(r.ownerSub),
    counterpartContactId: r.counterpartContactId == null ? null : String(r.counterpartContactId),
    dueAt: r.dueAt as Date,
    status: String(r.status) as CommitmentStatus,
    closureEvidenceKind: r.closureEvidenceKind == null ? null : (String(r.closureEvidenceKind) as ClosureEvidenceKind),
    closureEvidenceId: r.closureEvidenceId == null ? null : String(r.closureEvidenceId),
    metAt: (r.metAt as Date | null) ?? null,
    waivedBySub: r.waivedBySub == null ? null : String(r.waivedBySub),
    waiveReason: r.waiveReason == null ? null : String(r.waiveReason),
  };
}

