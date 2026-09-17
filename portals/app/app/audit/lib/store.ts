// Audit event port (local_audit.event). See incr/0023_audit_event.sql for why
// this table exists (TD-018 / L1 X-3) and why it is not the C3 usage envelope.
// In-memory on the offline path; Prisma-backed over local_audit when
// DATABASE_URL is set - same shape as UsageStore.
import { prismaEnabled } from "../../lib/db";
import { PrismaAuditStore } from "./prisma-store";

export type AuditOutcome = "success" | "denied" | "error";

export interface AuditEventRow {
  workspaceId: string;
  actorId: string;
  /** See incr/0023: a process constant, or NULL for a console-less backend channel. */
  actorConsole: string | null;
  objectType: string;
  objectId: string;
  action: string;
  outcome: AuditOutcome;
  /** Consumer-plane calls only. */
  taskId: string | null;
  costAmount: number | null;
  costUnit: string | null;
}

/** One event as 安全审计 (owner, 2026-09-17) actually browses it - `id` and
 *  `occurredAt` are both database-generated and were never worth returning
 *  until there was a screen that lists rows rather than only counting them. */
export interface AuditEventListRow extends AuditEventRow {
  id: string;
  occurredAt: Date;
}

export interface AuditStore {
  record(row: AuditEventRow): Promise<void>;
  /**
   * How many events landed since a point in time, grouped by outcome (使用分析,
   * owner 2026-09-17) - the first read this port has ever had; every prior
   * caller only wrote to it (admin-nav.ts's own comment: "nothing reads it
   * back"). Deliberately coarse - outcome only, not by action - because the
   * dashboard question this answers is "is anyone hitting a wall", not a
   * breakdown of what everyone did.
   */
  countByOutcomeSince(workspaceId: string, since: Date): Promise<Record<AuditOutcome, number>>;
  /**
   * The same window, grouped by WHO (智能副驾使用分析, owner 2026-09-17) -
   * `actorId` is the platform sub, the same identifier `local_authz.member.sub`
   * uses, so a caller joins this back to a display name itself rather than
   * this port reaching across schemas to resolve one.
   */
  countByActorSince(workspaceId: string, action: string, since: Date): Promise<Record<string, number>>;
  /**
   * A browsable page of events, newest first - 安全审计's own reason to exist
   * (owner, 2026-09-17): the aggregate counts above answer "how much", this
   * answers "who did what, when" for one config change at a time. Optionally
   * narrowed to a set of `action`s - 安全审计 shows only the config-management
   * actions (member/role writes), never `copilot.ask`, which is a business
   * action recorded in the same append-only table for an unrelated reason
   * (X-3 cost tracing) and is deliberately excluded from a SECURITY log.
   */
  listSince(
    workspaceId: string,
    since: Date,
    options?: { actions?: readonly string[]; limit?: number },
  ): Promise<AuditEventListRow[]>;
}

export class InMemoryAuditStore implements AuditStore {
  // occurredAt is not on AuditEventRow (the DB defaults it, and record() never
  // set one) - kept alongside the row here, the same way it lives only in the
  // database until this store needed to filter on it.
  readonly rows: Array<AuditEventRow & { id: string; occurredAt: Date }> = [];
  private seq = 0;

  async record(row: AuditEventRow): Promise<void> {
    this.rows.push({ ...row, id: `evt_${++this.seq}`, occurredAt: new Date() });
  }

  async countByOutcomeSince(workspaceId: string, since: Date): Promise<Record<AuditOutcome, number>> {
    const out: Record<AuditOutcome, number> = { success: 0, denied: 0, error: 0 };
    for (const r of this.rows) {
      if (r.workspaceId === workspaceId && r.occurredAt.getTime() >= since.getTime()) {
        out[r.outcome] += 1;
      }
    }
    return out;
  }

  async countByActorSince(workspaceId: string, action: string, since: Date): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const r of this.rows) {
      if (r.workspaceId === workspaceId && r.action === action && r.occurredAt.getTime() >= since.getTime()) {
        out[r.actorId] = (out[r.actorId] ?? 0) + 1;
      }
    }
    return out;
  }

  async listSince(
    workspaceId: string,
    since: Date,
    options: { actions?: readonly string[]; limit?: number } = {},
  ): Promise<AuditEventListRow[]> {
    const actionSet = options.actions ? new Set(options.actions) : null;
    const rows = this.rows
      .filter(
        (r) =>
          r.workspaceId === workspaceId &&
          r.occurredAt.getTime() >= since.getTime() &&
          (!actionSet || actionSet.has(r.action)),
      )
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    return options.limit ? rows.slice(0, options.limit) : rows;
  }
}

let override: AuditStore | null = null;
let memo: AuditStore | null = null;

export function getAuditStore(): AuditStore {
  if (override) return override;
  if (memo) return memo;
  memo = prismaEnabled() ? new PrismaAuditStore() : new InMemoryAuditStore();
  return memo;
}
export function setAuditStore(next: AuditStore | null): void {
  override = next;
  memo = null;
}
