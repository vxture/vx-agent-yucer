// Money for the domain rules.
//
// The database stores NUMERIC(18,2) plus a separate VARCHAR(8) currency, so an
// amount is only meaningful next to its currency. Two consequences that this
// module enforces rather than documents:
//
//   1. Amounts in different currencies are never silently added. A forecast
//      roll-up that sums CNY and USD into one number is wrong in a way nobody
//      notices until it is presented to a board.
//   2. Arithmetic is done in MINOR UNITS (integer cents). Floating point sums of
//      2-decimal money drift - 0.1 + 0.2 is the canonical example - and a
//      forecast that disagrees with the sum of its own rows by a cent destroys
//      trust in the whole number.

import { fail, ok, violation, type RuleResult } from "./result";

export interface Money {
  /** Major units with at most 2 decimals, matching NUMERIC(18,2). */
  amount: number;
  currency: string;
}

export const DEFAULT_CURRENCY = "CNY";

export function money(amount: number, currency: string = DEFAULT_CURRENCY): Money {
  return { amount, currency };
}

export function zero(currency: string = DEFAULT_CURRENCY): Money {
  return { amount: 0, currency };
}

/** Major units -> integer minor units, rounded half-away-from-zero. */
export function toMinor(amount: number): number {
  return Math.round(Math.abs(amount) * 100) * Math.sign(amount);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

export function addMoney(a: Money, b: Money): RuleResult<Money> {
  if (a.currency !== b.currency) {
    return fail(
      violation(
        "currency_mismatch",
        `cannot add ${a.currency} to ${b.currency}: a mixed-currency total is not a number anyone can act on`,
        "currency",
      ),
    );
  }
  return ok({ amount: fromMinor(toMinor(a.amount) + toMinor(b.amount)), currency: a.currency });
}

/**
 * Sum a list. An empty list needs a currency to be meaningful, so the caller
 * supplies the expected one rather than the function inventing a default that
 * happens to match nothing.
 */
export function sumMoney(items: readonly Money[], expected: string = DEFAULT_CURRENCY): RuleResult<Money> {
  let minor = 0;
  for (const m of items) {
    if (m.currency !== expected) {
      return fail(
        violation(
          "currency_mismatch",
          `expected every amount in ${expected} but found ${m.currency}`,
          "currency",
        ),
      );
    }
    minor += toMinor(m.amount);
  }
  return ok({ amount: fromMinor(minor), currency: expected });
}

/** Weight an amount by a percentage (0-100), staying in minor units. */
export function weight(m: Money, percent: number): Money {
  return { amount: fromMinor(Math.round((toMinor(m.amount) * percent) / 100)), currency: m.currency };
}

/**
 * Attainment as a ratio of achieved to target. A zero target returns null rather
 * than Infinity or 0: "no target was set" is a different statement from "0%
 * attained", and collapsing them makes an unset quota look like a failed one.
 */
export function ratio(achieved: Money, target: Money): RuleResult<number | null> {
  if (achieved.currency !== target.currency) {
    return fail(
      violation("currency_mismatch", `cannot compare ${achieved.currency} against ${target.currency}`, "currency"),
    );
  }
  const t = toMinor(target.amount);
  if (t === 0) return ok(null);
  return ok(toMinor(achieved.amount) / t);
}

export function isNonNegative(m: Money): boolean {
  return toMinor(m.amount) >= 0;
}
