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

export interface AuditStore {
  record(row: AuditEventRow): Promise<void>;
}

export class InMemoryAuditStore implements AuditStore {
  readonly rows: AuditEventRow[] = [];

  async record(row: AuditEventRow): Promise<void> {
    this.rows.push(row);
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
