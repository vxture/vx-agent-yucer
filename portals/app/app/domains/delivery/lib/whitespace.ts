// 白地与增购 (L4 batch six, business rules §9.3).
//
// 白地 = what is sellable - what this customer is running now (已购态, §9.2).
// Pure: the page and the sweep read the catalogue and the contracts, this
// subtracts and ranks.
//
// UNKNOWN IS NOT "EVERYTHING" (§9.3). An empty or unreadable catalogue returns
// `unknown`, never "every product is 白地" - that would make every customer
// look like a large opportunity, which is the most expensive kind of wrong.
//
// THE UPSELL RULE (owner, 2026-09-22): rule-based, no model. For each 白地
// product, look at the customer's PEERS - accounts in the same industry that
// hold at least one in-force contract - and ask what share of them run it.
// That share is the proposal's confidence (owner's choice), and it is stated
// with its counts in the rationale, so the number can be checked by anyone:
// "7 of 12 same-industry customers run it".

export const UPSELL_MIN_RATE = 0.4;
/** Below this many peers a share is an anecdote, not a rate. */
export const UPSELL_MIN_PEERS = 3;

export type Whitespace =
  | { readonly state: "known"; readonly productIds: readonly string[] }
  | { readonly state: "unknown" };

/**
 * `sellable` null = the catalogue could not be read. An empty list is also
 * unknown: a workspace with no sellable products has no 白地 to speak of,
 * and "nothing to sell" is not the same claim as "they own everything".
 */
export function whitespace(sellable: readonly string[] | null, owned: ReadonlySet<string>): Whitespace {
  if (sellable === null || sellable.length === 0) return { state: "unknown" };
  return { state: "known", productIds: sellable.filter((id) => !owned.has(id)) };
}

export interface PeerHolding {
  accountId: string;
  industryId: string | null;
  owned: ReadonlySet<string>;
}

export interface UpsellCandidate {
  productId: string;
  /** Peers running the product / peers considered. */
  owners: number;
  peers: number;
  rate: number;
}

/**
 * Upsell candidates for one account, best-supported first.
 *
 * NO INDUSTRY, NO PEERS: an account whose industry is unknown has no
 * comparable group, and comparing it to the whole book would make the
 * biggest industry's habits everyone's recommendation.
 */
export function upsellCandidates(
  account: { accountId: string; industryId: string | null },
  space: Whitespace,
  holdings: readonly PeerHolding[],
  opts: { minRate?: number; minPeers?: number } = {},
): UpsellCandidate[] {
  if (space.state !== "known" || account.industryId === null) return [];
  const minRate = opts.minRate ?? UPSELL_MIN_RATE;
  const minPeers = opts.minPeers ?? UPSELL_MIN_PEERS;
  const peers = holdings.filter(
    (h) => h.accountId !== account.accountId && h.industryId === account.industryId && h.owned.size > 0,
  );
  if (peers.length < minPeers) return [];
  return space.productIds
    .map((productId) => {
      const owners = peers.filter((p) => p.owned.has(productId)).length;
      return { productId, owners, peers: peers.length, rate: owners / peers.length };
    })
    .filter((c) => c.rate >= minRate)
    .sort((a, b) => b.rate - a.rate || b.owners - a.owners);
}
