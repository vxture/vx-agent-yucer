"use client";

import { Icon, Tooltip, TooltipContent, TooltipTrigger, type IconName } from "@vxture/design-ui";
import { availablePrices, type PriceValues } from "../lib/product-prices";
import { useLocale, useMessages } from "../lib/i18n/provider";
import { LibraryCardFact } from "./market-offering-card";
import { StrategyQuantity } from "./strategy-detail-label";
import cardStyles from "./market-offering-card.module.css";

const PRICE_KEYS = ["listPrice", "floorPrice", "minPrice"] as const;
const PRICE_ICONS: Record<keyof PriceValues, IconName> = {
  listPrice: "coins", floorPrice: "seal-check", minPrice: "shield-check",
};

/** Card prices use explicit labels; compact table prices keep their existing layout. */
export function ProductCardPrices({ price, currency, unit }: {
  readonly price?: PriceValues;
  readonly currency: string;
  readonly unit?: string;
}) {
  const { CATALOG_TEXT: T } = useMessages();
  const locale = useLocale();
  const amount = (value: number | null | undefined) => value == null ? "\u2014" : value.toLocaleString(locale);
  return <div className={cardStyles.productPrices} data-product-card-prices>
    <LibraryCardFact icon="coins" label={T.productListPrice}>
      {price?.listPrice == null ? <span className="font-normal text-muted-foreground">{T.unpricedShort}</span>
        : <StrategyQuantity value={amount(price.listPrice)} unit={unit ? `${currency} / ${unit}` : currency}/>}
    </LibraryCardFact>
    <div className={`${cardStyles.secondaryPrices} text-body-small`} aria-hidden={price ? undefined : true}>
      {price ? (["floorPrice", "minPrice"] as const).map(key=><Tooltip key={key}>
        <TooltipTrigger asChild><span tabIndex={0} className="inline-flex items-baseline gap-sm">
          <span className="text-muted-foreground">{key === "floorPrice" ? T.colFloor : T.colMin}</span>
          <span className="tabular-nums text-foreground">{amount(price[key])}</span>
        </span></TooltipTrigger>
        <TooltipContent>{key === "floorPrice" ? T.floorHint : T.minHint}</TooltipContent>
      </Tooltip>) : null}
    </div>
  </div>;
}

/** Three real standard-bundle totals, with a shared amount and unit edge. */
export function SolutionCardPrices({ price, missing, currency }: {
  readonly price: PriceValues;
  readonly missing: Partial<Record<keyof PriceValues, number>>;
  readonly currency: string;
}) {
  const { CATALOG_TEXT: T } = useMessages();
  const locale = useLocale();
  const labels = { listPrice: T.solutionPriceBasis, floorPrice: T.colFloor, minPrice: T.colMin };
  return <dl className={cardStyles.solutionPrices} data-solution-card-prices>
    {PRICE_KEYS.map(key => {
      const value = price[key];
      const absent = missing[key] ?? 0;
      return <div key={key} className={cardStyles.solutionPriceRow}>
        <dt className="text-muted-foreground">{labels[key]}</dt>
        <dd className={cardStyles.solutionPriceValue}>
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0} className={`${cardStyles.solutionPriceNumber} tabular-nums ${value == null ? "text-muted-foreground" : "text-foreground"}`}>
              {absent > 0 ? <Icon name="warning" size="xs" className="shrink-0 text-warning-text" aria-label={T.listTotalPartial(absent)}/> : null}
              <span>{value == null ? T.unpricedShort : value.toLocaleString(locale)}</span>
            </span></TooltipTrigger>
            <TooltipContent className="max-w-(--container-overlay-xl)">{absent > 0 ? T.listTotalPartial(absent) : T.solutionUnitHint}</TooltipContent>
          </Tooltip>
          <span className="text-body-small text-muted-foreground">{currency} / {T.solutionUnit}</span>
        </dd>
      </div>;
    })}
  </dl>;
}

/** Standard price leads; approval and minimum share a compact second line. */
export function ProductPriceValues({ price, missing, currency, calculated = false }: {
  readonly price?: PriceValues;
  readonly missing?: Partial<Record<keyof PriceValues, number>>;
  readonly currency?: string;
  readonly calculated?: boolean;
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
          className="inline-flex flex-col items-center gap-2xs tabular-nums">
          {keys.includes("listPrice") ? (
            <span data-number-role={calculated ? "result" : "value"}>{value("listPrice")}</span>
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
