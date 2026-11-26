import type { StrategyView, MarketView } from "./market-strategy";
import { currentStrategyPlans } from "../../domains/strategy/lib/current-plans";
import { strategyAdoptionStatus } from "../../domains/planning/strategy-adoption";
import type { ProductRecord, ProductStatusRecord } from "../../domains/catalog/store";
import type { SolutionFacts } from "./solution-prices";
import type { StrategyAdoptionRead } from "./strategy-adoption-read";
import { pendingStrategyPlans } from "./strategy-operations";

type SummaryStrategy = Pick<StrategyView, "id" | "lineageId" | "basePlanId" | "versionNo" | "status" | "period">;
type SummaryMarket = Pick<MarketView, "status" | "customers" | "solutionIds" | "productIds">;
type SummaryProduct = Pick<ProductRecord, "id" | "statusId">;

export function strategyModuleSummary(plans: readonly SummaryStrategy[] | null, period: string, adoption: StrategyAdoptionRead) {
  if (plans === null) return null;
  const current = currentStrategyPlans(plans).filter(p => (!period || p.period === period) && !["closed", "archived"].includes(p.status));
  const published = current.filter(p => p.versionNo != null);
  const active = current.filter(p => p.status === "active").length;
  const draft = pendingStrategyPlans(plans).filter(p => !period || p.period === period).length;
  const year = /^Y?\d{4}$/.test(period) ? Number(period.replace(/^Y/, "")) : undefined;
  const accepted = adoption.state === "ready" ? published.filter(p => strategyAdoptionStatus(p, adoption.rows, year) === "accepted").length : null;
  return { active, published: published.length, accepted, draft };
}

export function marketModuleSummary(markets: readonly SummaryMarket[] | null) {
  if (markets === null) return null;
  const active = markets.filter(m => m.status === "active");
  const matched = active.every(m => m.customers !== null)
    ? new Set(active.flatMap(m => (m.customers ?? []).filter(a => a.match === "match").map(a => a.id))).size : null;
  const withoutOfferings = active.filter(m => !(m.solutionIds?.length || m.productIds?.length)).length;
  return { active: active.length, matched, withoutOfferings };
}

export function solutionModuleSummary(solutions: readonly { solution: { id: string; status: string }; items: readonly { productId: string; optional: boolean }[] }[], products: readonly Pick<ProductRecord, "id">[], facts: Readonly<Record<string, SolutionFacts>>, pricingReady: boolean, solutionsReady: boolean) {
  if (!solutionsReady) return null;
  const active = solutions.filter(s => s.solution.status === "active");
  const productIds = new Set(products.map(p => p.id));
  const covered = new Set(active.flatMap(s => s.items.filter(i => productIds.has(i.productId)).map(i => i.productId))).size;
  const unready = pricingReady ? active.filter(s => {
    const standard = s.items.filter(i => !i.optional);
    return !standard.length || standard.some(i => !productIds.has(i.productId)) || !facts[s.solution.id] || facts[s.solution.id].missing.listPrice > 0;
  }).length : null;
  return { active: active.length, covered, unready };
}

export function productModuleSummary(products: readonly SummaryProduct[], statuses: readonly Pick<ProductStatusRecord, "id" | "statusCode">[], currentPrices: ReadonlyMap<string, unknown>, statusReady: boolean, pricingReady: boolean) {
  const codes = new Map(statuses.map(s => [s.id, s.statusCode]));
  if (!statusReady || products.some(p => !codes.has(p.statusId))) return null;
  const active = products.filter(p => codes.get(p.statusId) === "active");
  return { total: products.length, active: active.length, development: products.filter(p => codes.get(p.statusId) === "in_development").length,
    priced: pricingReady ? active.filter(p => currentPrices.has(p.id)).length : null };
}
