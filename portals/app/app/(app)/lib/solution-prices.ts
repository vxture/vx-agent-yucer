import { solutionListFacts } from "../../domains/catalog/lib/pricing";
import type { PriceValues } from "./product-prices";

export type SolutionFacts = ReturnType<typeof solutionListFacts> & {
  readonly prices: PriceValues;
  readonly missing: Record<keyof PriceValues, number>;
};

/** Aggregate actual product prices, never infer discounts from a bundle total. */
export function solutionPricingFacts(
  items: readonly { productId: string; quantity: number; optional: boolean }[],
  productType: ReadonlyMap<string, string | null>,
  typeOrder: readonly string[],
  currentPrices: ReadonlyMap<string, PriceValues>,
): SolutionFacts {
  const values = (key: keyof PriceValues) => new Map(
    [...currentPrices].flatMap(([id, price]) => price[key] == null ? [] : [[id, price[key]] as const]),
  );
  const list = solutionListFacts(items, productType, typeOrder, values("listPrice"));
  const floor = solutionListFacts(items, productType, typeOrder, values("floorPrice"));
  const min = solutionListFacts(items, productType, typeOrder, values("minPrice"));
  const count = items.filter((item) => !item.optional).length;
  return {
    ...list,
    prices: {
      listPrice: count > list.unpriced ? list.listTotal : null,
      floorPrice: count > floor.unpriced ? floor.listTotal : null,
      minPrice: count > min.unpriced ? min.listTotal : null,
    },
    missing: { listPrice: list.unpriced, floorPrice: floor.unpriced, minPrice: min.unpriced },
  };
}
