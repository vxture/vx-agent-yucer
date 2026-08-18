import type { PriceEntryRecord } from "../store";

// Pricing and reconciliation - the two rules the catalogue exists to carry.
// Pure, so both can be tested without a store and without a deal.

export interface DraftLine {
  readonly productId: string;
  readonly solutionId?: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly currency?: string;
}

export interface PricedLine {
  readonly productId: string;
  readonly solutionId: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly currency: string;
  /** True when the price fell below the product's floor - a human must sign. */
  readonly needsApproval: boolean;
}

/**
 * Price a draft line against the book.
 *
 * `needsApproval` is COMPUTED here and never accepted from a caller. A flag a
 * client could set is not an approval gate; it is a suggestion the client can
 * decline to make.
 *
 * A product with no price entry does NOT get flagged. "Below floor" and "has no
 * floor" are different states, and treating an unpriced product as a discount
 * breach would make every new product need approval on its first quote, which
 * teaches people that the flag means nothing.
 */
export function priceLine(draft: DraftLine, entry: PriceEntryRecord | null): PricedLine {
  const currency = draft.currency ?? entry?.currency ?? "CNY";
  // Rounded to cents at the line, so a sum of lines cannot drift from a header
  // by fractions no screen ever shows.
  const amount = Math.round(draft.quantity * draft.unitPrice * 100) / 100;
  return {
    productId: draft.productId,
    solutionId: draft.solutionId ?? null,
    quantity: draft.quantity,
    unitPrice: draft.unitPrice,
    amount,
    currency,
    needsApproval: entry !== null && draft.unitPrice < entry.floorPrice,
  };
}

/**
 * The deal total, from its lines.
 *
 * ADR-014 section 2: when lines exist they are authoritative and the header is
 * their sum. This is the only place that sum is computed, so the two numbers
 * cannot drift - "the total and the detail disagree" is the most common and the
 * hardest-to-trace mess this kind of system produces.
 */
export function lineTotal(lines: readonly { amount: number }[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
}

/** Does the stored header still match its lines? */
export function reconciles(headerAmount: number | null, lines: readonly { amount: number }[]): boolean {
  // No lines means the header stands alone - the legacy shape, legal, not a
  // mismatch.
  if (lines.length === 0) return true;
  return headerAmount !== null && Math.abs(headerAmount - lineTotal(lines)) < 0.005;
}

/**
 * Roll lines up by product.
 *
 * The reason opportunity_line exists at all: "4,200,000 committed" says nothing
 * about which product line carries it.
 */
export function byProduct(
  lines: readonly { productId: string; amount: number; quantity: number }[],
): Map<string, { amount: number; quantity: number; lines: number }> {
  const out = new Map<string, { amount: number; quantity: number; lines: number }>();
  for (const l of lines) {
    const prev = out.get(l.productId) ?? { amount: 0, quantity: 0, lines: 0 };
    out.set(l.productId, {
      amount: Math.round((prev.amount + l.amount) * 100) / 100,
      quantity: prev.quantity + l.quantity,
      lines: prev.lines + 1,
    });
  }
  return out;
}
