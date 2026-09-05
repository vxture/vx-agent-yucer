import type {
  PriceEntryRecord,
  ProductRecord,
  SolutionItemRecord,
  SolutionRecord,
} from "../store";

// WHAT A SOLUTION SET CAN SAY ABOUT ITSELF - the dock beside /solution.
//
// Same shape as the price book's analysis: pure, tested, code-and-numbers
// rather than sentences (TD-010), and quiet when there is nothing to say.
//
// The questions are the ones a bundle can be wrong about WITHOUT anybody
// noticing, because a solution is a template - nothing computes from it
// (ADR-014 s4), so a broken one fails silently at quoting time in front of a
// customer rather than loudly here.

export type SolutionAdviceKind =
  /** A line whose product is no longer sold: quoting it is quoting a ghost. */
  | "retired_product"
  /** A line whose product has no price: the quote cannot be priced from it. */
  | "unpriced_product"
  /** No scenario: a solution without the situation it is for is a bundle. */
  | "no_scenario"
  /** An on-sale product no solution sells - the catalogue's unused half. */
  | "product_uncovered";

export interface SolutionAdvice {
  readonly id: string;
  readonly kind: SolutionAdviceKind;
  /** The solution this is about; absent for `product_uncovered`. */
  readonly solutionId?: string;
  readonly solutionName?: string;
  readonly solutionCode?: string;
  /** The product this is about, when the advice names one. */
  readonly productId?: string;
  readonly productName?: string;
}

export interface SolutionAdviceInput {
  readonly solutions: readonly { solution: SolutionRecord; items: readonly SolutionItemRecord[] }[];
  readonly products: readonly ProductRecord[];
  /** The status row every sellable product points at. */
  readonly onSaleStatusId: string | null;
  readonly prices: readonly Pick<PriceEntryRecord, "productId">[];
}

/**
 * Everything worth saying about the solution set, worst first.
 *
 * Only ACTIVE solutions are examined: a retired template is a record of how
 * something used to be sold, and telling somebody to fix it would be asking
 * them to maintain the past.
 */
export function analyseSolutions(input: SolutionAdviceInput): SolutionAdvice[] {
  const product = new Map(input.products.map((p) => [p.id, p]));
  const priced = new Set(input.prices.map((e) => e.productId));
  const out: SolutionAdvice[] = [];
  const covered = new Set<string>();

  for (const { solution, items } of input.solutions) {
    if (solution.status === "retired") continue;
    const named = {
      solutionId: solution.id,
      solutionName: solution.name,
      solutionCode: solution.solutionCode,
    };

    for (const item of items) {
      covered.add(item.productId);
      const p = product.get(item.productId);
      if (!p) continue;
      if (p.statusId !== input.onSaleStatusId) {
        out.push({
          id: `retired:${solution.id}:${p.id}`,
          kind: "retired_product",
          ...named,
          productId: p.id,
          productName: p.name,
        });
        continue;
      }
      if (!priced.has(p.id)) {
        out.push({
          id: `unpriced:${solution.id}:${p.id}`,
          kind: "unpriced_product",
          ...named,
          productId: p.id,
          productName: p.name,
        });
      }
    }

    if (!solution.scenario) {
      out.push({ id: `scenario:${solution.id}`, kind: "no_scenario", ...named });
    }
  }

  // The other direction: what the solution set does NOT sell. A product on
  // sale that appears in no template is one nobody has worked out how to
  // position - visible here and nowhere else, because every other surface
  // reads from the solution to the product.
  for (const p of input.products) {
    if (p.statusId !== input.onSaleStatusId) continue;
    if (covered.has(p.id)) continue;
    out.push({
      id: `uncovered:${p.id}`,
      kind: "product_uncovered",
      productId: p.id,
      productName: p.name,
    });
  }

  const RANK: Record<SolutionAdviceKind, number> = {
    retired_product: 0,
    unpriced_product: 1,
    no_scenario: 2,
    product_uncovered: 3,
  };
  return out.sort(
    (a, b) =>
      RANK[a.kind] - RANK[b.kind] ||
      (a.solutionName ?? a.productName ?? "").localeCompare(b.solutionName ?? b.productName ?? ""),
  );
}
