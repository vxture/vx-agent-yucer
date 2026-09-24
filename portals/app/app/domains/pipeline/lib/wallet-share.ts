// 钱包份额 (YC-021 L4, owner 2026-09-24) - business rules §9.6.
//
// Ours over theirs, PER DEAL: the customer's total budget for the project a
// deal belongs to is entered by a person on the deal (incr/0080); what we
// undertake is the deal's signed contracts once it is won, its amount while it
// is open. The customer and 存量收入 cards only add these up - and add two
// things separately, 已承接 (won) and 在谈 (open), never one blended number.

export interface WalletDeal {
  readonly id: string;
  readonly status: "open" | "won" | "lost" | "abandoned";
  readonly currency: string;
  /** The deal's amount; null = unpriced. */
  readonly amount: number | null;
  /** 客户项目总投入, in the deal's currency; null = not entered. */
  readonly budget: number | null;
}

export interface WalletContract {
  readonly opportunityId: string | null;
  readonly status: string;
  readonly currency: string;
  readonly totalAmount: number | null;
}

export type DealShare =
  | { readonly state: "no_budget" }
  | { readonly state: "not_ours" }
  | { readonly state: "unpriced" }
  | {
      readonly state: "known";
      readonly basis: "committed" | "quoted";
      readonly ours: number;
      readonly budget: number;
      /** 0..n - NOT capped at 1; see `exceeds`. */
      readonly share: number;
      /** Ours above the customer's stated total: the budget was probably
       *  entered low. Shown as it is, with a hint - never clipped to 100%. */
      readonly exceeds: boolean;
    };

/** What we undertake on one deal: signed contracts once won (same currency),
 *  falling back to the deal amount; the deal amount while open. */
export function dealOurs(deal: WalletDeal, contracts: readonly WalletContract[]): { ours: number; basis: "committed" | "quoted" } | null {
  if (deal.status === "won") {
    const signed = contracts.filter(
      (c) => c.opportunityId === deal.id && c.status !== "draft" && c.currency === deal.currency && c.totalAmount != null,
    );
    if (signed.length > 0) {
      return { ours: signed.reduce((n, c) => n + Math.round(c.totalAmount! * 100), 0) / 100, basis: "committed" };
    }
    return deal.amount == null ? null : { ours: deal.amount, basis: "committed" };
  }
  if (deal.status === "open") return deal.amount == null ? null : { ours: deal.amount, basis: "quoted" };
  return null;
}

export function dealShare(deal: WalletDeal, contracts: readonly WalletContract[]): DealShare {
  if (deal.status === "lost" || deal.status === "abandoned") return { state: "not_ours" };
  if (deal.budget == null) return { state: "no_budget" };
  const o = dealOurs(deal, contracts);
  if (!o) return { state: "unpriced" };
  // A zero budget with anything of ours is the extreme of "entered low".
  const share = deal.budget > 0 ? o.ours / deal.budget : o.ours > 0 ? Infinity : 0;
  return { state: "known", basis: o.basis, ours: o.ours, budget: deal.budget, share, exceeds: o.ours > deal.budget };
}

export interface WalletRollupLine {
  readonly currency: string;
  readonly ours: number;
  readonly budget: number;
  readonly share: number;
  /** Deals summed on this line. */
  readonly counted: number;
}

export interface WalletRollup {
  /** Won deals - what we hold. One line per currency. */
  readonly committed: readonly WalletRollupLine[];
  /** Open deals - what is in play. One line per currency. */
  readonly quoted: readonly WalletRollupLine[];
  /** Won or open deals, and how many of them carry a budget. */
  readonly eligible: number;
  readonly withBudget: number;
}

export function walletShare(deals: readonly WalletDeal[], contracts: readonly WalletContract[]): WalletRollup {
  const add = (into: Map<string, { ours: number; budget: number; counted: number }>, cur: string, ours: number, budget: number) => {
    const t = into.get(cur) ?? { ours: 0, budget: 0, counted: 0 };
    t.ours += Math.round(ours * 100);
    t.budget += Math.round(budget * 100);
    t.counted += 1;
    into.set(cur, t);
  };
  const committed = new Map<string, { ours: number; budget: number; counted: number }>();
  const quoted = new Map<string, { ours: number; budget: number; counted: number }>();
  let eligible = 0;
  let withBudget = 0;
  for (const d of deals) {
    if (d.status !== "won" && d.status !== "open") continue;
    eligible += 1;
    if (d.budget == null) continue;
    withBudget += 1;
    const s = dealShare(d, contracts);
    if (s.state !== "known") continue;
    add(s.basis === "committed" ? committed : quoted, d.currency, s.ours, s.budget);
  }
  const lines = (m: Map<string, { ours: number; budget: number; counted: number }>): WalletRollupLine[] =>
    [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, t]) => ({
        currency,
        ours: t.ours / 100,
        budget: t.budget / 100,
        share: t.budget > 0 ? t.ours / t.budget : t.ours > 0 ? Infinity : 0,
        counted: t.counted,
      }));
  return { committed: lines(committed), quoted: lines(quoted), eligible, withBudget };
}
