// Serialising the allocation of a per-scope sequential number.
//
// THE BUG THIS EXISTS TO FIX: three adapters allocated a human-facing number by
// counting existing rows inside a transaction, each with a comment saying the
// transaction made concurrent allocation safe. It does not. Under READ
// COMMITTED - Postgres' default and Prisma's - two concurrent transactions both
// read the same count and both write count+1. The unique index catches it, so
// the damage is a spurious failure rather than a duplicate, but the comments
// asserted a property the code did not have and the failure only appears under
// concurrency, which is where nobody was looking.
//
// A transaction gives ATOMICITY, not SERIALISATION. Getting the second one
// needs either SERIALIZABLE isolation (and a retry loop, because it aborts) or
// an explicit lock. The lock is cheaper here and does not change the isolation
// level for anything else in the transaction.
//
// pg_advisory_xact_lock releases at COMMIT or ROLLBACK - there is no unlock to
// forget and no leak on a failed transaction.

/** Namespace for this product's advisory locks, so we cannot collide with
 * another user of the same lock space. "YUC" in hex. */
const LOCK_NAMESPACE = 0x595543;

/** What is being allocated. Distinct keys never block each other. */
export type AllocationScope = "opportunity_no" | "lead_no" | "agent_message_seq";

/**
 * The two 32-bit halves of the advisory lock key.
 *
 * classid is the namespace plus a per-scope offset, so allocating an
 * opportunity number never waits on a lead number. objid is a hash of the
 * scope key (a workspace id, or a session id) - a hash collision costs
 * unnecessary serialisation between two unrelated scopes and nothing else,
 * which is the right way round for a collision to be wrong.
 */
export function lockKey(scope: AllocationScope): number {
  const offset: Record<AllocationScope, number> = {
    opportunity_no: 1,
    lead_no: 2,
    agent_message_seq: 3,
  };
  return LOCK_NAMESPACE + offset[scope];
}

/**
 * Is this the unique-constraint violation, and not some other failure?
 *
 * Prisma reports it as P2002. Written against the CODE rather than the message
 * so it does not break on a Prisma wording change, and shaped as a type guard so
 * a caller cannot accidentally swallow the wrong error - which is exactly what
 * a bare `catch {}` in the signal adapter used to do, reporting a missing
 * foreign key as "this signal already exists".
 */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}
