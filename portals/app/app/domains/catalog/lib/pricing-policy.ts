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

export interface PricingPolicy {
  /** ISO 4217, three capitals. What a line, a quote and a roll-up assume
   *  when nothing on the row says otherwise. */
  readonly defaultCurrency: string;
}

/** What a workspace prices in before anybody says otherwise - and the same
 *  value incr/0044 writes as the column default, so the two cannot disagree. */
export const DEFAULT_PRICING_POLICY: PricingPolicy = { defaultCurrency: "CNY" };

/**
 * A policy the database would accept.
 *
 * Three capitals is all either side checks: whether XYZ is a currency is a
 * reference table's question (yucer_ref, the day it exists), not a regex's.
 */
export function planPricingPolicy(input: PricingPolicy): RuleResult<PricingPolicy> {
  const code = input.defaultCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return fail(violation("currency_invalid", `${input.defaultCurrency} is not a three-letter currency code`, "defaultCurrency"));
  }
  return ok({ defaultCurrency: code });
}
