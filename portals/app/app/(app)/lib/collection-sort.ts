import type { MarketView, StrategyView } from "./market-strategy";
import { PLAN_STATUSES } from "../../domains/strategy/lib/lifecycle";

// Read the same facts as the cells: inaccessible references remain unknown,
// rather than sorting as zero. Display order never writes manual sortOrder.
export const strategySortAccessors = {
  name: (row: StrategyView) => row.name,
  markets: (row: StrategyView) => row.marketIds?.length,
  customers: (row: StrategyView) => row.customerCount,
  solutions: (row: StrategyView) => row.solutions == null || row.products == null
    ? null : row.solutions.length + row.products.length,
  campaigns: (row: StrategyView) => row.campaigns?.length,
  status: (row: StrategyView) => PLAN_STATUSES.indexOf(row.status),
};

export const marketSortAccessors = {
  name: (row: MarketView) => row.name,
  customers: (row: MarketView) => row.matched,
  offerings: (row: MarketView) => row.defaultSolutions == null || row.defaultProducts == null
    ? null : row.defaultSolutions.length + row.defaultProducts.length,
  plan: (row: MarketView) => row.plans?.length,
  status: (row: MarketView) => ["active", "paused", "retired"].indexOf(row.status),
};
