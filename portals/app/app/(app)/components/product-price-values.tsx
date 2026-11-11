"use client";

import { availablePrices, type PriceValues } from "../lib/product-prices";
import { useMessages } from "../lib/i18n/provider";

/** One column, up to three labelled rows. Missing values never become zero. */
export function ProductPriceValues({ price }: { readonly price?: PriceValues }) {
  const { CATALOG_TEXT: T } = useMessages();
  const values = availablePrices(price);
  if (values.length === 0) {
    return <span className="text-body-small text-muted-foreground">{T.unpricedShort}</span>;
  }
  const labels = { listPrice: T.colList, floorPrice: T.colFloor, minPrice: T.colMin };
  return (
    <dl className="flex flex-col gap-2xs text-body-small">
      {values.map(({ key, value }) => (
        <div key={key} className="flex items-baseline justify-between gap-sm whitespace-nowrap">
          <dt className="text-muted-foreground">{labels[key]}</dt>
          <dd className="tabular-nums">{value.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}
