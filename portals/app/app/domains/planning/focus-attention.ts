import type { FocusRow } from "./focus-model";

/** Absence of access/source data is not evidence of a business gap. */
export function focusNeedsAttention(row: Pick<FocusRow, "revenue" | "coverage">) {
  const c = row.coverage;
  return !row.revenue.length || c.state === "ready" && (!c.totalChains || c.completeChains < c.totalChains);
}
