import type { AnalysisDeal } from "../../domains/pipeline/lib/attainment-analysis";
export type ReviewFact = {
  exit: {
    total: number;
    unmet: readonly string[];
    unknown: readonly string[];
  } | null;
  risk: boolean;
  score: number | null;
};
export function dealDiagnosis(
  deal: AnalysisDeal,
  observedAt: string,
  review?: ReviewFact | null,
) {
  const issues: (
    "delayed" | "conditions" | "missingBasis" | "unpriced" | "undated"
  )[] = [];
  if (deal.status !== "open")
    return {
      issues,
      kind: deal.status === "won" ? ("won" as const) : ("normal" as const),
    };
  if (deal.expectedCloseAt && deal.expectedCloseAt < observedAt)
    issues.push("delayed");
  if (!deal.amount) issues.push("unpriced");
  if (!deal.expectedCloseAt) issues.push("undated");
  if (
    deal.forecastCategory === "commit" &&
    review?.exit &&
    review.exit.unmet.length
  )
    issues.push("conditions");
  if (
    review &&
    (review.exit === null ||
      review.exit.unknown.length > 0 ||
      review.risk ||
      (deal.forecastCategory !== "commit" && review.exit.unmet.length > 0))
  )
    issues.push("missingBasis");
  return { issues, kind: issues[0] ?? ("normal" as const) };
}
