import { getAuditStore, type AuditOutcome, type AuditStore } from "./store";

// The L1 X-3 writer. Two callers today: authz/admin.ts (management-plane
// writes) and copilot/turn-service.ts (consumer-plane calls into Atlas/
// Runos) - see incr/0023_audit_event.sql for why this table exists and why
// it is scoped to those two surfaces rather than every domain write.

/**
 * This product has no OBO relay path today, so every row it produces is
 * self-produced rather than made on another console's behalf. Per the
 * Product 接入通则, that is the process-constant case; NULL is reserved for a
 * backend channel that belongs to no console (this repo writes none of those
 * here yet).
 */
export const ACTOR_CONSOLE_SELF = "yucer";

export interface AuditEventInput {
  workspaceId: string;
  actorId: string;
  objectType: string;
  objectId: string;
  action: string;
  outcome: AuditOutcome;
  taskId?: string | null;
  costAmount?: number | null;
  costUnit?: string | null;
}

export async function recordAuditEvent(
  input: AuditEventInput,
  store: AuditStore = getAuditStore(),
): Promise<void> {
  const costAmount = input.costAmount ?? null;
  const costUnit = input.costUnit ?? null;
  if ((costAmount === null) !== (costUnit === null)) {
    throw new Error("costAmount and costUnit must both be present or both be absent");
  }
  await store.record({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    actorConsole: ACTOR_CONSOLE_SELF,
    objectType: input.objectType,
    objectId: input.objectId,
    action: input.action,
    outcome: input.outcome,
    taskId: input.taskId ?? null,
    costAmount,
    costUnit,
  });
}
