import type { PlanContent, PlanTarget } from "./plan-model";
import { demand, minor } from "./plan-values";

// Editable planning starting points in CNY, not measured industry benchmarks or FX rates.
export const newLogoPresets = {
  general: "100000",
  software: "100000",
  projects: "500000",
  equipment: "200000",
  subscription: "30000",
} as const;
export type NewLogoPreset = keyof typeof newLogoPresets;
export interface NewLogoEstimate {
  preset: NewLogoPreset | "custom";
  currency: string;
  revenueShare: string;
  firstOrderAmount: string;
  automatic: boolean;
}
export function defaultNewLogoEstimate(currency: string, preset: NewLogoPreset = "general"): NewLogoEstimate | undefined {
  if (currency !== "CNY") return undefined;
  return { preset, currency, revenueShare: "50", firstOrderAmount: newLogoPresets[preset], automatic: true };
}
export function validNewLogoEstimate(value: unknown): value is NewLogoEstimate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as NewLogoEstimate;
  if (!(v.preset === "custom" || Object.hasOwn(newLogoPresets, v.preset)) || typeof v.currency !== "string" || !/^[A-Z]{3}$/.test(v.currency) || typeof v.automatic !== "boolean") return false;
  try { return minor(v.revenueShare) <= 10000n && minor(v.firstOrderAmount) > 0n; } catch { return false; }
}
export function estimateNewLogos(revenue: string | null, basis: NewLogoEstimate): string | null {
  demand(validNewLogoEstimate(basis), "invalid_new_logo_estimate");
  if (revenue === null) return null;
  const numerator = minor(revenue) * minor(basis.revenueShare);
  const denominator = minor(basis.firstOrderAmount) * 10000n;
  return String((numerator + denominator - 1n) / denominator);
}
export function newLogoRevenue(content: PlanContent, line: PlanTarget) {
  return content.targets.find(t => t.scope === line.scope && t.period === line.period && t.metric === "revenue" && (!line.newLogoEstimate || t.currency === line.newLogoEstimate.currency));
}
export function validateNewLogoEstimates(content: PlanContent) {
  for (const line of content.targets) {
    if (line.newLogoEstimate === undefined) continue;
    demand(line.metric === "new_logo" && line.period === `Y${content.year}` && validNewLogoEstimate(line.newLogoEstimate), "invalid_new_logo_estimate");
    const revenue = newLogoRevenue(content, line);
    demand(revenue, "new_logo_basis_mismatch");
    if (!line.newLogoEstimate.automatic) continue;
    const target = estimateNewLogos(revenue.target, line.newLogoEstimate);
    const equal = target === null ? line.target === null : line.target !== null && minor(target) === minor(line.target);
    demand(equal, "new_logo_basis_mismatch");
  }
}
