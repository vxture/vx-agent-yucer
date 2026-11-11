import type { PriceEntryRecord } from "../../domains/catalog/store";
import { inForceByProduct } from "../../domains/catalog/lib/pricing";

export type PriceValues = {
  readonly listPrice?: number | null;
  readonly floorPrice?: number | null;
  readonly minPrice?: number | null;
};

/** Keep zero prices; omit only missing values. */
export function availablePrices(price: PriceValues | undefined) {
  return (["listPrice", "floorPrice", "minPrice"] as const).flatMap((key) => {
    const value = price?.[key];
    return value === null || value === undefined ? [] : [{ key, value }];
  });
}

/** A scheduled version never replaces the price currently used for quoting. */
export function productPriceVersions(
  prices: readonly PriceEntryRecord[],
  currency: string | undefined,
  now: number,
) {
  const currencies = currency ? [currency] : [...new Set(prices.map((p) => p.currency))];
  const currentIds = new Set(currencies.flatMap((code) =>
    [...inForceByProduct(prices, code, now).values()].map((entry) => entry.id)));
  return prices.filter((p) => currency === undefined || p.currency === currency)
    .map((entry) => ({
      ...entry,
      state: entry.effectiveAt.getTime() > now
        ? "scheduled" as const
        : currentIds.has(entry.id)
          ? "current" as const
          : "historical" as const,
    }))
    .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime());
}

/** Whole currency units, constrained to the standard price for sub-unit input. */
export function suggestedProductPrices(list: number) {
  if (!Number.isFinite(list) || list < 0) return null;
  const ceiling = Math.floor(list);
  return {
    floorPrice: Math.min(ceiling, Math.round(list * 0.7)),
    minPrice: Math.min(ceiling, Math.round(list * 0.5)),
  };
}
