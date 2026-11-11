"use client";

import { availablePrices, type PriceValues } from "../lib/product-prices";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";

/** One column, up to three labelled rows. Missing values never become zero. */
export function ProductPriceValues({ price, missing }: {
  readonly price?: PriceValues;
  readonly missing?: Partial<Record<keyof PriceValues, number>>;
}) {
  const { CATALOG_TEXT: T } = useMessages();
  const values = availablePrices(price);
  const keys = (["listPrice", "floorPrice", "minPrice"] as const)
    .filter((key) => values.some((v) => v.key === key) || (missing?.[key] ?? 0) > 0);
  if (keys.length === 0) {
    return <span className="text-body-small text-muted-foreground">{T.unpricedShort}</span>;
  }
  const labels = { listPrice: T.colList, floorPrice: T.colFloor, minPrice: T.colMin };
  return (
    <dl className="flex flex-col gap-2xs text-body-small">
      {keys.map((key) => (
        <div key={key} className="flex items-baseline justify-between gap-sm whitespace-nowrap">
          <dt className="text-muted-foreground">{labels[key]}</dt>
          <dd className="flex items-center gap-xs tabular-nums">
            {(missing?.[key] ?? 0) > 0 && price?.[key] != null ? (
              <Tag tone="warning">{T.listTotalPartial(missing![key]!)}</Tag>
            ) : null}
            {price?.[key] == null ? T.unpricedShort : price[key].toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}
