import type { AttainmentAnalysis } from "./analysis-board";
import { analysisRow } from "../../domains/pipeline/lib/attainment-analysis";
export function makeAnalysisRow(
  data: AttainmentAnalysis,
  scope: string,
  name: string,
  period = data.period,
) {
  return analysisRow({
    scope,
    name,
    period,
    currency: data.currency ?? "CNY",
    targets: data.targets ?? [],
    deals: data.deals,
    observedAt: data.observedAt,
    unavailable: data.dealState,
  });
}
