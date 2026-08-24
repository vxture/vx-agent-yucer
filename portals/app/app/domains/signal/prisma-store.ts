import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import type { SignalStatus, SignalType } from "./lib/scoring";
import type {
  LeadFilter,
  LeadRecord,
  LeadStatus,
  NewLead,
  NewSignal,
  SignalFilter,
  SignalRecord,
  SignalStore,
} from "./store";
import { isUniqueViolation, lockKey } from "../shared/allocate";

// Prisma-backed SignalStore over yucer_pipeline.
//
// Two write paths, two different reasons for care:
//
//   recordSignal  - a unique-constraint collision on (workspace, source,
//                   source_ref) is NORMAL. A feed replaying its own records is
//                   ordinary traffic, so the collision returns null instead of
//                   throwing, and the caller counts it.
//   resolveSignal - checked against the column-lock mirror before it goes out,
//                   so an attempt to write evidence fails here with a named
//                   violation rather than at the driver.

const SIGNAL_TABLE = "yucer_pipeline.signal";
const LEAD_TABLE = "yucer_pipeline.lead";

export class PrismaSignalStore implements SignalStore {
  async recordSignal(workspaceId: string, signal: NewSignal): Promise<SignalRecord | null> {
    const p = await getPrismaClient();
    try {
      const row = await p.signal.create({
        data: {
          workspaceId,
          source: signal.source,
          sourceRef: signal.sourceRef,
          signalType: signal.signalType,
          subject: signal.subject,
          payload: (signal.payload ?? {}) as Record<string, never>,
          detectedAt: signal.detectedAt ?? new Date(),
          accountId: signal.accountId ?? null,
          // status defaults to `new` in the DDL and is not set here.
        },
      });
      return toSignal(row as Record<string, unknown>);
    } catch (e) {
      // ONLY the duplicate. A bare catch here reported every failure as "already
      // known" - a foreign key to a missing account, a CHECK on an unknown
      // signal type, a dropped connection - so a signal that was never stored
      // came back as one that already existed, and the ingest path had no way to
      // tell "seen before" from "broken".
      if (isUniqueViolation(e)) return null; // uidx_signal_ws_source_ref
      throw e;
    }
  }

  async listSignals(workspaceId: string, filter: SignalFilter = {}): Promise<SignalRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.signal.findMany({
      where: {
        workspaceId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.signalType ? { signalType: filter.signalType } : {}),
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.minScore != null ? { score: { gte: filter.minScore } } : {}),
      },
      // Matches idx_signal_ws_status_score. Highest first, newest as tie-break:
      // the inbox exists to put the best lead at the top.
      // nulls last, explicitly: Postgres puts NULLs FIRST on a bare DESC, which
      // would float unscored signals above a 90 at the top of the inbox.
      orderBy: [{ score: { sort: "desc", nulls: "last" } }, { detectedAt: "desc" }],
      ...(filter.limit ? { take: filter.limit } : {}),
    });
    return rows.map((r: Record<string, unknown>) => toSignal(r));
  }

  async getSignal(workspaceId: string, id: string): Promise<SignalRecord | null> {
    const p = await getPrismaClient();
    const row = await p.signal.findFirst({ where: { id, workspaceId } });
    return row ? toSignal(row as Record<string, unknown>) : null;
  }

  async resolveSignal(
    workspaceId: string,
    id: string,
    patch: { accountId?: string | null; score?: number; status?: SignalStatus },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { ...patch, updatedAt: new Date() };

    const guard = assertWritable(SIGNAL_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write signal evidence: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const res = await p.signal.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }

  async createLead(workspaceId: string, lead: NewLead): Promise<LeadRecord> {
    const p = await getPrismaClient();
    // lead_no is a human-facing immutable business number. Serialised by an
    // advisory lock, not merely by the transaction - see domains/shared/allocate.ts.
    return p.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey("lead_no")}::int, hashtext(${workspaceId})::int)`;
      const count = await tx.lead.count({ where: { workspaceId } });
      const row = await tx.lead.create({
        data: {
          workspaceId,
          leadNo: `LEAD-${String(count + 1).padStart(5, "0")}`,
          companyName: lead.companyName,
          contactName: lead.contactName ?? null,
          accountId: lead.accountId,
          signalId: lead.signalId,
          campaignId: lead.campaignId,
          score: lead.score,
          ownerSub: lead.ownerSub ?? null,
        },
      });
      return toLead(row as Record<string, unknown>);
    });
  }

  async listLeads(workspaceId: string, filter: LeadFilter = {}): Promise<LeadRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.lead.findMany({
      where: {
        workspaceId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.ownerSub ? { ownerSub: filter.ownerSub } : {}),
      },
      orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      ...(filter.limit ? { take: filter.limit } : {}),
    });
    return rows.map((r: Record<string, unknown>) => toLead(r));
  }

  async getLead(workspaceId: string, id: string): Promise<LeadRecord | null> {
    const p = await getPrismaClient();
    const row = await p.lead.findFirst({ where: { id, workspaceId } });
    return row ? toLead(row as Record<string, unknown>) : null;
  }

  async updateLead(
    workspaceId: string,
    id: string,
    patch: {
      companyName?: string;
      contactName?: string | null;
      accountId?: string | null;
      score?: number;
      ownerSub?: string | null;
      status?: LeadStatus;
      convertedOpportunityId?: string | null;
    },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { ...patch, updatedAt: new Date() };

    // signal_id and campaign_id are the attribution record. They are absent from
    // the patch type, and this catches anything that got past the type system.
    const guard = assertWritable(LEAD_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write lead attribution: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const res = await p.lead.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }
}

function toSignal(r: Record<string, unknown>): SignalRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    source: String(r.source),
    sourceRef: (r.sourceRef as string | null) ?? null,
    signalType: r.signalType as SignalType,
    subject: String(r.subject),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    detectedAt: r.detectedAt as Date,
    accountId: (r.accountId as string | null) ?? null,
    score: (r.score as number | null) ?? null,
    targeting: (r.targeting as SignalRecord["targeting"]) ?? null,
    status: r.status as SignalStatus,
  };
}

function toLead(r: Record<string, unknown>): LeadRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    leadNo: String(r.leadNo),
    companyName: String(r.companyName),
    contactName: (r.contactName as string | null) ?? null,
    accountId: (r.accountId as string | null) ?? null,
    signalId: (r.signalId as string | null) ?? null,
    campaignId: (r.campaignId as string | null) ?? null,
    score: (r.score as number | null) ?? null,
    ownerSub: (r.ownerSub as string | null) ?? null,
    status: r.status as LeadStatus,
    convertedOpportunityId: (r.convertedOpportunityId as string | null) ?? null,
  };
}
