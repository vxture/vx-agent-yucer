// Which customer owns which - incr/0025, ADR-024 batch B.
//
// THE SHAPE IS BORROWED, DELIBERATELY. yucer_gtm.territory has had a
// self-referencing parent_id since baseline, and planning/lib/territory.ts
// already walks it to refuse a cycle. Inventing a second way to say the same
// thing would mean two cycle guards to keep correct; this is the same walk,
// over accounts.
//
// WHAT THE DATABASE CATCHES AND WHAT IT CANNOT. chk_account_parent_not_self
// refuses a row that is its own parent, because that is visible in one row. A
// foreign key sees one row at a time and has no view of a chain, so A->B->A is
// perfectly legal to Postgres and nonsense to us. That half lives here.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

/** The minimum an ancestry walk needs. */
export interface KnownAccount {
  readonly id: string;
  readonly parentId: string | null;
}

export interface AccountParentDraft {
  accountId: string;
  /** null detaches: this customer is nobody's subsidiary. */
  parentId: string | null;
}

/**
 * Refuse a parent link that would make the hierarchy unreadable.
 *
 * DETACHING IS ALWAYS LEGAL. `parentId: null` needs no checks at all - an
 * acquisition unwinds, a subsidiary is sold, and refusing to record that
 * because of some rule about the shape of the tree would make the product
 * wrong about the world.
 */
export function planAccountParent(
  input: AccountParentDraft,
  existing: readonly KnownAccount[],
): RuleResult<AccountParentDraft> {
  if (input.parentId === null) return ok(input);

  if (input.parentId === input.accountId) {
    // The database would also refuse this one. Saying it here means the person
    // hears which field and why, instead of a constraint name.
    return fail(
      violation("parent_self", "a customer cannot be its own parent company", "parentId"),
    );
  }

  const self = existing.find((a) => a.id === input.accountId);
  if (!self) {
    return fail(violation("not_found", "the customer being reparented does not exist", "accountId"));
  }

  const parent = existing.find((a) => a.id === input.parentId);
  if (!parent) {
    // BY NAME, NOT BY FOREIGN KEY. The FK would refuse this too, at write time,
    // with a constraint name nobody can act on.
    return fail(violation("parent_not_found", "the parent company does not exist", "parentId"));
  }

  // Following the proposed parent's own ancestry must never arrive back here.
  // Every reader of the hierarchy - a group roll-up, a subsidiary list, an org
  // chart - would loop forever, and no constraint in the database can see it.
  if (reaches(existing, parent.id, self.id)) {
    return fail(
      violation(
        "parent_cycle",
        "a customer cannot be its own parent, directly or through a chain",
        "parentId",
      ),
    );
  }

  return ok(input);
}

/** Whether following parent links from `fromId` ever arrives at `targetId`. */
function reaches(all: readonly KnownAccount[], fromId: string, targetId: string): boolean {
  const byId = new Map(all.map((a) => [a.id, a]));
  const seen = new Set<string>();
  let cursor: string | null = fromId;
  // `seen` is what makes this terminate on data that is ALREADY cyclic - a
  // hierarchy corrupted by a direct write would otherwise hang the walk that
  // is trying to stop the next cycle.
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === targetId) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

/** A confirmed child move carries the parent observed when it was selected. */
export interface RegistrationChildLink {
  readonly accountId: string;
  readonly expectedParentId: string | null;
}
export interface RegistrationHierarchy {
  readonly parentId?: string | null;
  readonly childLinks?: readonly RegistrationChildLink[];
}
export class AccountHierarchyError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Validate the whole proposed tree before any customer or child is written. */
export function planAccountRegistrationHierarchy(
  input: RegistrationHierarchy, existing: readonly KnownAccount[], accountId: string,
): RuleResult<RegistrationHierarchy> {
  const parentId = input.parentId ?? null;
  const childLinks = input.childLinks === undefined ? [] : input.childLinks;
  if ((parentId !== null && (typeof parentId !== "string" || !parentId)) || !Array.isArray(childLinks) || childLinks.length > 100)
    return fail(violation("hierarchy_invalid", "invalid customer relationships", "childLinks"));
  const next: KnownAccount[] = [...existing, { id: accountId, parentId: null }];
  const parent = planAccountParent({ accountId, parentId }, next);
  if (!parent.ok) return parent;
  next[next.length-1] = { id: accountId, parentId };
  const seen = new Set<string>();
  for (const link of childLinks) {
    if (!link || typeof link.accountId !== "string" || !link.accountId || seen.has(link.accountId) ||
      (link.expectedParentId !== null && (typeof link.expectedParentId !== "string" || !link.expectedParentId)))
      return fail(violation("hierarchy_invalid", "invalid subsidiary selection", "childLinks"));
    seen.add(link.accountId);
    const held = next.find(a => a.id === link.accountId);
    if (!held || held.id === accountId) return fail(violation("child_not_found", "subsidiary is unavailable", "childLinks"));
    if (held.parentId !== link.expectedParentId) return fail(violation("hierarchy_changed", "subsidiary parent changed; review again", "childLinks"));
    const change = planAccountParent({ accountId: link.accountId, parentId: accountId }, next);
    if (!change.ok) return change;
    next[next.indexOf(held)] = { ...held, parentId: accountId };
  }
  return ok({ parentId, childLinks });
}
