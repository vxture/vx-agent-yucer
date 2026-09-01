import type { DataScope } from "./scope";

// Whether one row is visible under a resolved scope.
//
// FOLLOWS THE CONVENTIONAL CRM SHARING MODEL rather than inventing one - the
// owner's instruction of 2026-09-01, "参考传统 crm 的逻辑，不需要新创". Every
// established product answers this the same way, and the parts are worth naming
// because each one exists for a reason a first-principles design would miss:
//
//   OWNERSHIP      you see what is yours.
//   THE PARENT     a customer controls its children. Access to an account
//                  carries to the deals and leads on it - Salesforce calls this
//                  implicit sharing, and without it a manager who owns the
//                  relationship cannot see the pursuits running on it.
//   THE HIERARCHY  a territory contains territories, and covering the parent
//                  covers the children. This is what stands in for the role
//                  hierarchy here: our roles are a flat product-wide catalogue,
//                  and `territory.parent_id` has expressed containment since the
//                  baseline.
//   THE QUEUE      an unowned record belongs to nobody yet and is visible to
//                  everybody who could work it. The owner's ruling of
//                  2026-09-01 for leads, and the reason is operational rather
//                  than philosophical: a lead nobody owns that nobody can see is
//                  a lead nobody will ever claim.
//
// THE PATHS ARE A UNION, never an intersection. Access in a CRM is granted by
// any route that reaches the row; requiring two would make ordinary work
// invisible - a rep who owns a deal in somebody else's region would lose their
// own deal.

/** The fields a visibility decision reads. Deliberately not the whole record. */
export interface ScopedRow {
  readonly ownerSub: string | null;
  /** The customer this row hangs on, if any. Absent on an account itself. */
  readonly accountId?: string | null;
  /** The territory this row is filed under, if the object carries one. */
  readonly territoryId?: string | null;
}

/**
 * Can this member see this row?
 *
 * UNOWNED IS VISIBLE, and this is the queue. It applies to every object rather
 * than only to leads, because the argument does not depend on the object: a row
 * nobody owns is not somebody else's private business, and hiding it means work
 * that can never be picked up. An account with no owner is exactly as
 * unclaimed as a lead with no owner.
 */
export function canSeeRow(scope: DataScope, row: ScopedRow): boolean {
  if (scope.kind === "workspace") return true;

  // THE QUEUE, checked first because it is unconditional. A row with no owner
  // is claimable by anyone who can reach the screen.
  if (row.ownerSub === null) return true;

  if (scope.kind === "own") {
    if (row.ownerSub === scope.sub) return true;
    // THE PARENT PATH. `accountIds` is the set of customers this member's book
    // touches; a deal or lead hanging on one of them is part of that book even
    // when somebody else owns the row.
    return row.accountId != null && scope.accountIds.includes(row.accountId);
  }

  // Territory scope. `territoryIds` is already expanded down the hierarchy by
  // the resolver, so this is a membership test rather than a walk.
  return row.territoryId != null && scope.territoryIds.includes(row.territoryId);
}

/** The same decision over a list. Kept separate so call sites read as filters. */
export function visibleRows<T extends ScopedRow>(scope: DataScope, rows: readonly T[]): T[] {
  if (scope.kind === "workspace") return [...rows];
  return rows.filter((r) => canSeeRow(scope, r));
}
