import type { PriceEntryRecord, ProductRecord } from "../store";
import { suggestFloor } from "./suggest";

// PRICE ANALYSIS - what the price book can say about itself, without an LLM.
//
// Owner ruling 2026-09-05: the price page's dock shows analysis and
// recommendations, each carrying its own accept/ignore. This file is the
// analysis: pure functions over the rows the page already loads, so every
// recommendation can name the evidence it came from and the same input always
// produces the same advice.
//
// EACH ITEM CARRIES A CODE AND NUMBERS, NEVER A SENTENCE (TD-010). The rule
// layer's reader is the rule layer; the dictionary turns `floor_outlier` plus
// two numbers into the line a person reads, in their own language.
//
// WHAT IT DELIBERATELY DOES NOT DO: decide. `apply` on an item is a price the
// person still signs off - the floor is a commercial decision (ADR-019), and
// an analysis that moved floors by itself would be making it.

export type PriceAdviceKind =
  /** A sellable product with no price at all - it cannot be quoted. */
  | "unpriced"
  /** Floor equals list: legal, and a stance worth confirming rather than a typo. */
  | "floor_equals_list"
  /** The floor sits far from what this workspace's other floors imply. */
  | "floor_outlier"
  /** Signatures keep citing this product: the floor may be above the market. */
  | "floor_overridden";

export interface PriceAdvice {
  /** Stable across runs - the dock keeps dismissals against it. */
  readonly id: string;
  readonly kind: PriceAdviceKind;
  readonly productId: string;
  readonly productName: string;
  /** The entry the advice is about; absent for `unpriced`. */
  readonly priceId?: string;
  readonly listPrice?: number;
  readonly floorPrice?: number;
  readonly currency?: string;
  /** What the advice would set the floor to, when it can name a number. */
  readonly suggestedFloor?: number;
  /** The workspace's own median floor-to-list ratio, as a percentage. */
  readonly ratioPct?: number;
  /** How many signatures cite this product, for `floor_overridden`. */
  readonly signatures?: number;
}

/** How far a floor ratio may sit from the workspace median before it is worth
 * a word. Fifteen points is wide enough that ordinary product-to-product
 * variation stays quiet, and narrow enough to catch a misplaced digit. */
const OUTLIER_POINTS = 15;

/** Three signatures on one product stops being an exception and starts being
 * a price. Two can be one negotiation and its follow-up. */
const OVERRIDE_STREAK = 3;

export interface PriceAdviceInput {
  /** The products to analyse - already narrowed to what is sellable. */
  readonly products: readonly ProductRecord[];
  /** The entry in force per product. History is not analysed: a superseded
   * price is a record of a past decision, not a decision to make. */
  readonly current: readonly PriceEntryRecord[];
  /** Every price entry, for the workspace's own ratio median. */
  readonly allPrices: readonly PriceEntryRecord[];
  /** Signatures per product id - how often a floor was overridden. */
  readonly signaturesByProduct: ReadonlyMap<string, number>;
}

/**
 * Everything worth saying about the given products' prices, worst first.
 *
 * Ordered by what blocks selling: a product that cannot be quoted at all beats
 * a floor that is merely odd, and an odd floor beats a stance worth
 * confirming.
 */
export function analysePrices(input: PriceAdviceInput): PriceAdvice[] {
  const byProduct = new Map(input.current.map((e) => [e.productId, e]));
  const out: PriceAdvice[] = [];

  for (const p of input.products) {
    const entry = byProduct.get(p.id);
    if (!entry) {
      out.push({ id: `unpriced:${p.id}`, kind: "unpriced", productId: p.id, productName: p.name });
      continue;
    }

    const common = {
      productId: p.id,
      productName: p.name,
      priceId: entry.id,
      listPrice: entry.listPrice,
      floorPrice: entry.floorPrice,
      currency: entry.currency,
    };

    const signatures = input.signaturesByProduct.get(p.id) ?? 0;
    if (signatures >= OVERRIDE_STREAK) {
      out.push({ id: `overridden:${entry.id}`, kind: "floor_overridden", ...common, signatures });
      continue;
    }

    if (entry.floorPrice === entry.listPrice) {
      out.push({ id: `equal:${entry.id}`, kind: "floor_equals_list", ...common });
      continue;
    }

    // The workspace's own median ratio, from every OTHER product's book - a
    // product compared against a median it is itself half of would smooth out
    // the very deviation being looked for.
    const others = input.allPrices.filter((e) => e.productId !== p.id);
    const hint = suggestFloor(entry.listPrice, others);
    if (hint) {
      const ratio = Math.round((entry.floorPrice / entry.listPrice) * 100);
      if (Math.abs(ratio - hint.ratioPct) >= OUTLIER_POINTS) {
        out.push({
          id: `outlier:${entry.id}`,
          kind: "floor_outlier",
          ...common,
          suggestedFloor: hint.floor,
          ratioPct: hint.ratioPct,
        });
      }
    }
  }

  const RANK: Record<PriceAdviceKind, number> = {
    unpriced: 0,
    floor_overridden: 1,
    floor_outlier: 2,
    floor_equals_list: 3,
  };
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.productName.localeCompare(b.productName));
}
