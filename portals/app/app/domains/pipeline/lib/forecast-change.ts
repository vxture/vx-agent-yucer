import { periodRange, within } from "../../shared/period";
import type { ClaimEventRecord } from "./claims";
import { inScope, type ForecastCategory, type ForecastScope } from "./forecast";

// 快照间变化 (YC-065 R9, deal batch 9c): how a category's total moved since
// the last snapshot, deal by deal.
//
// NOT FROM A PER-DEAL SNAPSHOT - none is stored (YC-067 section 06). Each
// deal's state at the snapshot instant is RECONSTRUCTED from the claim log
// (incr/0084): for every logged field, the value at time T is the `fromValue`
// of that field's first change after T; with no change after T it is today's.
// Status comes from closed_at: a deal closed after T was open at T.
//
// THE PARTS MUST ADD UP. Every deal's move is filed under one kind, and
// whatever the kinds do not account for - a change from before the claim log
// existed, an owner or territory move (neither is logged) - is reported as
// `unexplained` with its amount. It is never spread silently over the kinds.

export const CHANGE_KINDS = ["added", "removed", "resized", "pushed", "won"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export interface ChangeDeal {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly forecastCategory: string;
  readonly amount: number | null;
  readonly expectedCloseAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly territoryId: string | null;
  readonly ownerSub: string | null;
}

export interface DealChange {
  readonly opportunityId: string;
  readonly name: string;
  readonly kind: ChangeKind;
  /** Signed: what this deal added to (+) or took from (-) the category. */
  readonly delta: number;
}

export interface CategoryChange {
  readonly category: ForecastCategory;
  readonly since: Date;
  /** Today's total minus the snapshot's stored total. */
  readonly total: number;
  readonly byKind: Readonly<Record<ChangeKind, number>>;
  readonly deals: readonly DealChange[];
  /** total - the sum of the deals; 0 when every cent is accounted for. */
  readonly unexplained: number;
}

interface State {
  readonly open: boolean;
  readonly category: string;
  readonly amount: number | null;
  readonly expectedCloseAt: Date | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** The deal as it stood at `at`, or null when it did not exist yet. */
export function stateAt(deal: ChangeDeal, claims: readonly ClaimEventRecord[], at: Date): State | null {
  if (deal.createdAt > at) return null;
  const first = new Map<string, string | null>();
  for (const c of claims) {
    if (c.opportunityId !== deal.id || c.occurredAt <= at) continue;
    if (!first.has(c.field)) first.set(c.field, c.fromValue);
  }
  const amount = first.has("amount") ? (first.get("amount") == null ? null : Number(first.get("amount"))) : deal.amount;
  const close = first.has("expected_close_at")
    ? first.get("expected_close_at") == null
      ? null
      : new Date(`${first.get("expected_close_at")}T00:00:00Z`)
    : deal.expectedCloseAt;
  return {
    open: deal.status === "open" || (deal.closedAt !== null && deal.closedAt > at),
    category: first.has("forecast_category") ? (first.get("forecast_category") ?? deal.forecastCategory) : deal.forecastCategory,
    amount,
    expectedCloseAt: close,
  };
}

/**
 * The move of one OPEN category (commit / best_case / pipeline) between the
 * snapshot and now, per deal. Scope is today's territory and owner - neither
 * is logged, so a move between scopes lands in `unexplained`.
 */
export function explainChange(input: {
  readonly category: ForecastCategory;
  readonly period: string;
  readonly scope: ForecastScope;
  readonly since: Date;
  readonly snapshotTotal: number;
  readonly currentTotal: number;
  readonly deals: readonly ChangeDeal[];
  readonly claims: readonly ClaimEventRecord[];
}): CategoryChange | null {
  const range = periodRange(input.period);
  if (!range) return null;
  const scoped = inScope(input.deals, input.scope);
  const counts = (s: State | null) =>
    s !== null && s.open && s.category === input.category && within(range, s.expectedCloseAt);

  const deals: DealChange[] = [];
  for (const d of scoped) {
    const then = stateAt(d, input.claims, input.since);
    const now: State = { open: d.status === "open", category: d.forecastCategory, amount: d.amount, expectedCloseAt: d.expectedCloseAt };
    const was = counts(then);
    const is = counts(now);
    const before = was ? (then!.amount ?? 0) : 0;
    const after = is ? (now.amount ?? 0) : 0;
    if (!was && !is) continue;
    let kind: ChangeKind;
    if (!was) kind = "added";
    else if (is) kind = "resized";
    else if (d.status === "won") kind = "won";
    else if (d.status === "open" && d.forecastCategory === input.category && !within(range, d.expectedCloseAt)) kind = "pushed";
    else kind = "removed";
    const delta = cents(after - before);
    if (delta === 0) continue;
    deals.push({ opportunityId: d.id, name: d.name, kind, delta });
  }

  const byKind = Object.fromEntries(CHANGE_KINDS.map((k) => [k, 0])) as Record<ChangeKind, number>;
  for (const c of deals) byKind[c.kind] = cents(byKind[c.kind] + c.delta);
  const total = cents(input.currentTotal - input.snapshotTotal);
  const explained = cents(deals.reduce((s, c) => s + c.delta, 0));
  return {
    category: input.category,
    since: input.since,
    total,
    byKind,
    deals: [...deals].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    unexplained: cents(total - explained),
  };
}
