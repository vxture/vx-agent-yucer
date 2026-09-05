// What the catalogue can suggest about itself - the data-derived half of the
// form assistant (owner ruling 2026-09-05: creation gets a page, and the page
// gets an assistant).
//
// EVERYTHING HERE IS COMPUTED FROM ROWS THE WORKSPACE ALREADY HAS. No model
// call, no external source: a suggestion whose evidence is the caller's own
// data can state its reason precisely and be checked at a glance. Model-backed
// suggestions join later through the same AssistSuggestion contract; these do
// not wait for that channel to exist.
//
// PURE FUNCTIONS, no IO, so the tests need no store and the client can run
// them against data the page already loaded. The generic halves - code series,
// vocabulary - moved to domains/shared/suggest.ts when planning and strategy
// needed them too; what stays here is what only pricing can know.

import type { PriceEntryRecord, ProductRecord } from "../store";

/**
 * A floor price consistent with how this workspace already prices.
 *
 * The floor is a commercial decision (ADR-019), so this does not invent one -
 * it reports the MEDIAN floor/list ratio of the entries already on file and
 * applies it to the list price being typed. The reason string a caller builds
 * from this should say exactly that: "your existing floors run about N% of
 * list".
 *
 * Null when fewer than two priced products exist, or the list price is not a
 * positive number: one entry is an example, not a practice, and a ratio from
 * it would dress a single decision up as a policy.
 */
export function suggestFloor(
  listPrice: number,
  entries: readonly Pick<PriceEntryRecord, "listPrice" | "floorPrice">[],
): { floor: number; ratioPct: number } | null {
  if (!Number.isFinite(listPrice) || listPrice <= 0) return null;
  const ratios = entries
    .filter((e) => e.listPrice > 0 && e.floorPrice >= 0 && e.floorPrice <= e.listPrice)
    .map((e) => e.floorPrice / e.listPrice)
    .sort((a, b) => a - b);
  if (ratios.length < 2) return null;

  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
  // Whole yuan. A floor of 8333.33 reads as arithmetic, not as a decision.
  return { floor: Math.round(listPrice * median), ratioPct: Math.round(median * 100) };
}

/** The products a new price entry is most useful for: active, and unpriced. */
export function unpricedProducts(
  products: readonly ProductRecord[],
  prices: readonly Pick<PriceEntryRecord, "productId">[],
): ProductRecord[] {
  const priced = new Set(prices.map((p) => p.productId));
  return products.filter((p) => p.status === "active" && !priced.has(p.id));
}
