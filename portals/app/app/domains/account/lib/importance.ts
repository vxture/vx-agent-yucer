// 重要度与优先级 (incr/0090, YC-065 R11) - the pure half.
//
// Two independent axes - the customer's tier and the deal's importance - both
// rows in a table, not literals in code. Every rule reads a level's RANK
// (1 = most pressing): the medal colour, the priority lookup, the ordering.
// No level NAME appears in logic.

export const IMPORTANCE_SUBJECTS = ["account", "opportunity"] as const;
export type ImportanceSubject = (typeof IMPORTANCE_SUBJECTS)[number];

export interface ImportanceLevel {
  readonly id: string;
  readonly subject: ImportanceSubject;
  readonly levelCode: string;
  readonly name: string;
  readonly description: string | null;
  readonly rank: number;
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

export interface PriorityRule {
  readonly accountLevelId: string;
  readonly opportunityLevelId: string;
  /** 1 = P1. */
  readonly priority: number;
}

export interface ImportanceScheme {
  readonly account: readonly ImportanceLevel[];
  readonly opportunity: readonly ImportanceLevel[];
  readonly rules: readonly PriorityRule[];
}

/** The medal a rank earns: 1 gold, 2 silver, 3 and after bronze. */
export function medalOf(rank: number): "gold" | "silver" | "bronze" {
  return rank <= 1 ? "gold" : rank === 2 ? "silver" : "bronze";
}

/**
 * A customer's tier level: its level row, else the level whose code its
 * legacy `tier` names (while both columns live side by side, incr/0090).
 */
export function accountLevelOf(
  account: { readonly tierLevelId?: string | null; readonly tier: string },
  levels: readonly ImportanceLevel[],
): ImportanceLevel | null {
  const mine = levels.filter((l) => l.subject === "account");
  return (
    (account.tierLevelId ? mine.find((l) => l.id === account.tierLevelId) : undefined) ??
    mine.find((l) => l.levelCode === account.tier) ??
    null
  );
}

/** A deal's importance: its level row, else the axis default (新建商机默认一般). */
export function opportunityLevelOf(
  deal: { readonly importanceLevelId?: string | null },
  levels: readonly ImportanceLevel[],
): ImportanceLevel | null {
  const mine = levels.filter((l) => l.subject === "opportunity");
  return (
    (deal.importanceLevelId ? mine.find((l) => l.id === deal.importanceLevelId) : undefined) ??
    mine.find((l) => l.isDefault) ??
    null
  );
}

/**
 * Priority = the matrix cell for (tier, importance). A missing cell is null -
 * 未定级, sorted last - never guessed from its neighbours (R11).
 */
export function priorityOf(
  accountLevel: ImportanceLevel | null,
  opportunityLevel: ImportanceLevel | null,
  rules: readonly PriorityRule[],
): number | null {
  if (!accountLevel || !opportunityLevel) return null;
  return (
    rules.find((r) => r.accountLevelId === accountLevel.id && r.opportunityLevelId === opportunityLevel.id)?.priority ??
    null
  );
}

/** One deal read against the scheme: its two levels and the cell they cross in. */
export interface DealPriority {
  readonly accountLevel: ImportanceLevel | null;
  readonly dealLevel: ImportanceLevel | null;
  readonly priority: number | null;
}

export function dealPriorityOf(
  deal: { readonly importanceLevelId?: string | null },
  account: { readonly tierLevelId?: string | null; readonly tier: string } | null,
  scheme: ImportanceScheme,
): DealPriority {
  const accountLevel = account ? accountLevelOf(account, scheme.account) : null;
  const dealLevel = opportunityLevelOf(deal, scheme.opportunity);
  return { accountLevel, dealLevel, priority: priorityOf(accountLevel, dealLevel, scheme.rules) };
}

/**
 * 按优先级 (R11): P1 first, the same P by amount (largest first), 未定级
 * last. Returned as one integer key per row - priority, then the row's place
 * in the amount order - so a generic ascending sort gives exactly this order
 * without a float mixing the two scales. Null for 未定级 (a blank sinks).
 */
export function priorityKeys<T extends { readonly priority: number | null; readonly amount: number | null }>(
  rows: readonly T[],
): Map<T, number | null> {
  const byAmount = [...rows].sort((a, b) => (b.amount ?? -Infinity) - (a.amount ?? -Infinity));
  const place = new Map(byAmount.map((r, i) => [r, i] as const));
  return new Map(rows.map((r) => [r, r.priority === null ? null : r.priority * 1_000_000 + place.get(r)!] as const));
}
