import { parseStrategyPeriod } from "./plan-period";

export const STRATEGIC_METRICS = ["revenue", "channels", "reference_cases"] as const;
export type StrategicMetric = typeof STRATEGIC_METRICS[number];
export interface StrategicExpectation {
  id: string;
  metric: StrategicMetric;
  amount: string;
  currency: string | null;
  criterion: string;
}
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validExpectations(value: unknown): value is StrategicExpectation[] {
  if (!Array.isArray(value) || value.length > 3) return false;
  const ids = new Set<string>(), metrics = new Set<string>();
  for (const x of value) {
    if (!x || !uuid(x.id) || ids.has(x.id) || !STRATEGIC_METRICS.includes(x.metric) || metrics.has(x.metric) ||
      typeof x.amount !== "string" || !/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$/.test(x.amount) ||
      (x.metric !== "revenue" && !/^(0|[1-9][0-9]{0,8})$/.test(x.amount)) ||
      (x.metric === "revenue" ? !/^[A-Z]{3}$/.test(x.currency ?? "") : x.currency !== null) ||
      typeof x.criterion !== "string" || x.criterion.length > 1000) return false;
    ids.add(x.id); metrics.add(x.metric);
  }
  return true;
}
export function expectationWindow(period: string, year: number) {
  const p = parseStrategyPeriod(period);
  if (!p) return null;
  const start = p.startOn > `${year}-01-01` ? p.startOn : `${year}-01-01`;
  const end = p.endOn < `${year}-12-31` ? p.endOn : `${year}-12-31`;
  return start <= end ? { start, end } : null;
}
