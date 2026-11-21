import type { PlanContent, PlanTarget } from "./plan-model";
import { amount, demand, minor } from "./plan-values";

export type MarginRates = Record<"floor" | "target" | "stretch", string | null>;
export const defaultMarginRates: MarginRates = {
  floor: "30",
  target: "40",
  stretch: "50",
};
export function marginAmount(revenue: string | null, rate: string | null) {
  if (revenue === null || rate === null) return null;
  demand(minor(rate) <= 10000n, "invalid_margin_rate");
  return amount((minor(revenue) * minor(rate)) / 10000n);
}
export function planningMarginRate(
  content: PlanContent,
  line: PlanTarget,
  tier: keyof MarginRates,
): string | null {
  if (line.marginRates) return line.marginRates[tier];
  try {
    const revenue = content.targets.find(
      (t) =>
        t.scope === line.scope &&
        t.period === line.period &&
        t.metric === "revenue" &&
        t.currency === line.currency,
    );
    if (
      line[tier] !== null &&
      revenue?.target != null &&
      minor(revenue.target) > 0n
    )
      return amount(
        (minor(line[tier]!) * 10000n + minor(revenue.target!) / 2n) /
          minor(revenue.target!),
      );
    if (
      /Q[1-4]$/.test(line.period) &&
      line.target !== null &&
      minor(line.target) === 0n
    )
      return (
        content.targets.find(
          (t) =>
            t.scope === line.scope &&
            t.period === `Y${content.year}` &&
            t.metric === "margin" &&
            t.currency === line.currency,
        )?.marginRates?.[tier] ?? null
      );
    return null;
  } catch {
    return null;
  }
}
export function validateMarginRates(content: PlanContent) {
  for (const line of content.targets) {
    if (line.marginRates === undefined) continue;
    demand(
      line.metric === "margin" &&
        line.period === `Y${content.year}` &&
        line.marginRates !== null &&
        typeof line.marginRates === "object" &&
        Object.keys(line.marginRates).length === 3,
      "invalid_margin_rate",
    );
    const revenue = content.targets.find(
      (t) =>
        t.scope === line.scope &&
        t.period === line.period &&
        t.metric === "revenue" &&
        t.currency === line.currency,
    );
    let previous: bigint | null = null;
    for (const tier of ["floor", "target", "stretch"] as const) {
      const rate = line.marginRates[tier];
      demand(
        rate === null ||
          (typeof rate === "string" &&
            /^(0|[1-9]\d?)(\.\d{1,2})?$|^100(\.0{1,2})?$/.test(rate)),
        "invalid_margin_rate",
      );
      if (rate !== null) {
        const value = minor(rate);
        demand(previous === null || value >= previous, "target_ladder");
        previous = value;
      }
      const expected = marginAmount(revenue?.target ?? null, rate);
      demand(
        expected === null
          ? line[tier] === null
          : line[tier] !== null && minor(line[tier]!) === minor(expected),
        "margin_rate_mismatch",
      );
    }
  }
}
