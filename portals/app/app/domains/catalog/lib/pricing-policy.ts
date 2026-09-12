import { fail, ok, violation, type RuleResult } from "../../shared/result";

// 计价规则 - incr/0044.
//
// WHY IT IS A ROW. "CNY" was in eleven places: the line pricer's fallback, the
// pipeline's default line currency, lead conversion, the price book's column,
// and four pages' "if no row has an amount, assume". Eleven copies of one
// decision, none of them the workspace's (owner, 2026-09-09: 需要币种设置，
// 系统统一应用). It is the catalogue's row because pricing is the catalogue's
// - ADR-017 gave the floor price its own permission there - and ADR-014's rule
// is that everyone reads the catalogue and nobody else writes it.
//
// A CLOSED LIST, NOT A REGEX (owner, 2026-09-12: 币种准备多提供几种 - a
// closed dropdown, pick from the candidates, not free text). This is the
// reference table the old three-capitals check said it was waiting on
// ("whether XYZ is a currency is a reference table's question") - except a
// product-wide fixed set of four, never tenant-edited, is a constant here
// rather than a `yucer_ref` table: nothing about it needs a workspace to add
// its own row the way `role_line`/`org_template` do.
//
// CODES ONLY - the display name for each (人民币/美元/港币/新台币) is
// `CURRENCY_LABEL` in messages.ts, keyed by these same four codes. The domain
// layer names what is legal, not what it is called; a rule module carrying
// CJK text is what ascii-containment.test.ts's "CJK string literals stay in
// the named files" guard exists to catch.
export const SUPPORTED_CURRENCIES: readonly string[] = ["CNY", "USD", "HKD", "TWD"];

export interface PricingPolicy {
  /** One of `SUPPORTED_CURRENCIES`'s codes. What a line, a quote and a
   *  roll-up assume when nothing on the row says otherwise. */
  readonly defaultCurrency: string;
}

/** What a workspace prices in before anybody says otherwise - and the same
 *  value incr/0044 writes as the column default, so the two cannot disagree. */
export const DEFAULT_PRICING_POLICY: PricingPolicy = { defaultCurrency: "CNY" };

/** A policy the database would accept - `defaultCurrency` is one of the four
 *  shipped codes, not any three letters a regex would pass. */
export function planPricingPolicy(input: PricingPolicy): RuleResult<PricingPolicy> {
  const code = input.defaultCurrency.trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(code)) {
    return fail(violation("currency_invalid", `${input.defaultCurrency} is not a supported currency`, "defaultCurrency"));
  }
  return ok({ defaultCurrency: code });
}
