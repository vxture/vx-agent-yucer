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
// them against data the page already loaded.

import type { PriceEntryRecord, ProductRecord } from "../store";

/**
 * The next code in the series the workspace is already using.
 *
 * People number their catalogues - PRD-001, PRD-002 - and the follow-on code is
 * the single likeliest thing a person will type into a blank code field.
 * Detected, not assumed: the suggestion exists only when a majority of existing
 * codes share one prefix-and-number shape, because "your convention seems to
 * be X" is only worth saying when there is a convention.
 *
 * Returns null when there is no series to continue - fewer than two conforming
 * codes, or no codes at all. Null means "say nothing", never "suggest
 * something generic": an invented convention would teach the workspace a
 * pattern nobody chose.
 */
export function suggestNextCode(existing: readonly string[]): string | null {
  const shaped = existing
    .map((c) => /^(.*?)(\d+)$/.exec(c.trim()))
    .filter((m): m is RegExpExecArray => m !== null);
  if (shaped.length < 2) return null;

  // The dominant prefix. Two products numbered under different prefixes are
  // two series, and continuing the bigger one is the best available guess.
  const byPrefix = new Map<string, RegExpExecArray[]>();
  for (const m of shaped) {
    const list = byPrefix.get(m[1]!) ?? [];
    list.push(m);
    byPrefix.set(m[1]!, list);
  }
  const [prefix, members] = [...byPrefix.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  if (members.length < 2) return null;

  const width = members[0]![2]!.length;
  const max = Math.max(...members.map((m) => Number(m[2])));
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

/**
 * The vocabulary already in use for a free-text field.
 *
 * A category typed as "软件" on one product and "软体" on the next splits every
 * report that groups by it. Offering the existing values is how a free field
 * stays a vocabulary; most-used first, because the common case should be the
 * first click.
 */
export function knownValues(values: readonly (string | null)[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const t = v?.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

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
