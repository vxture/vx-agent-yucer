import { periodRange } from "../../domains/shared/period";
import type { WinLossFilter } from "../../domains/pipeline/lib/winloss-workspace";
export type WinLossQuery = Record<string, string | string[] | undefined>;
export function resolveWinLossQuery(q: WinLossQuery, now = new Date()): WinLossFilter | null {
  if (Object.values(q).some(Array.isArray)) return null;
  const period = q.period as string || `Y${now.getUTCFullYear()}`;
  const view = q.view || "list", status = q.status || "all", outcome = q.outcome || "all", dates = q.dates || "period";
  if (!periodRange(period) || !["list", "analysis"].includes(view as string) || !["all", "pending", "reviewed"].includes(status as string) || !["all", "won", "lost", "abandoned"].includes(outcome as string) || !["period", "undated"].includes(dates as string)) return null;
  return { period, view, status, outcome, dates, reason: q.reason || "", region: q.region || "", query: q.q || "" } as WinLossFilter;
}
export function winLossHref(f: WinLossFilter, change: Partial<WinLossFilter> = {}) {
  const next = { ...f, ...change };
  const q = new URLSearchParams({ period: next.period, view: next.view, status: next.status, outcome: next.outcome, dates: next.dates });
  if (next.reason) q.set("reason", next.reason);
  if (next.region) q.set("region", next.region);
  if (next.query) q.set("q", next.query);
  return `/winloss?${q}`;
}
