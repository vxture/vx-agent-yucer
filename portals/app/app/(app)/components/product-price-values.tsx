"use client";

import { Icon, Tooltip, TooltipContent, TooltipTrigger, type IconName } from "@vxture/design-ui";
import { availablePrices, type PriceValues } from "../lib/product-prices";
import { useMessages } from "../lib/i18n/provider";

const PRICE_KEYS = ["listPrice", "floorPrice", "minPrice"] as const;
const PRICE_ICONS: Record<keyof PriceValues, IconName> = {
  listPrice: "coins", floorPrice: "seal-check", minPrice: "shield-check",
};

/** Standard price leads; approval and minimum share a compact second line. */
export function ProductPriceValues({ price, missing, currency }: {
  readonly price?: PriceValues;
  readonly missing?: Partial<Record<keyof PriceValues, number>>;
  readonly currency?: string;
}) {
  const { CATALOG_TEXT: T } = useMessages();
  const values = availablePrices(price);
  const keys = PRICE_KEYS.filter((key) => values.some((v) => v.key === key) || (missing?.[key] ?? 0) > 0);
  if (keys.length === 0) {
    return <span className="text-body-small text-muted-foreground">{T.unpricedShort}</span>;
  }
  const labels = { listPrice: T.colList, floorPrice: T.colFloor, minPrice: T.colMin };
  const amount = (key: keyof PriceValues) => price?.[key] == null ? T.unpricedShort : price[key].toLocaleString();
  const detail = (key: keyof PriceValues) => [labels[key], amount(key), currency,
    (missing?.[key] ?? 0) > 0 ? T.listTotalPartial(missing![key]!) : undefined].filter(Boolean).join(" ");
  const value = (key: keyof PriceValues) => (
    <span key={key} className="inline-flex items-center gap-2xs whitespace-nowrap">
      <Icon name={PRICE_ICONS[key]} size={key === "listPrice" ? "sm" : "xs"} />
      <span>{amount(key)}</span>
      {(missing?.[key] ?? 0) > 0 ? <Icon name="warning" size="xs" className="text-warning-text" /> : null}
    </span>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} role="group" aria-label={keys.map(detail).join("; ")}
          className="inline-flex flex-col items-start gap-2xs tabular-nums">
          {keys.includes("listPrice") ? (
            <span className="text-body font-medium text-foreground">{value("listPrice")}</span>
          ) : null}
          {keys.some((key) => key !== "listPrice") ? (
            <span className="inline-flex items-center gap-sm text-body-small text-muted-foreground">
              {keys.filter((key) => key !== "listPrice").map(value)}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <dl className="flex flex-col gap-xs">
          {keys.map((key) => (
            <div key={key} className="flex items-baseline justify-between gap-md">
              <dt>{labels[key]}</dt>
              <dd className="flex flex-col items-end tabular-nums">
                <span>{amount(key)}{currency ? ` ${currency}` : ""}</span>
                {(missing?.[key] ?? 0) > 0 ? <span>{T.listTotalPartial(missing![key]!)}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}
