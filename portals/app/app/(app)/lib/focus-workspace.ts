export function focusHref({ year, revisionId, regionId, period, accountId }: { year: number; revisionId?: string | null; regionId?: string | null; period?: string; accountId?: string }) {
  const q = new URLSearchParams({ year: String(year) });
  if (revisionId) q.set("revision", revisionId);
  if (regionId) q.set("region", regionId);
  if (period) q.set("period", period);
  const path = accountId ? `/named/${encodeURIComponent(accountId)}` : "/named";
  return `${path}?${q}`;
}
export function focusQuery(input: Record<string, string | string[] | undefined>) {
  if (Object.values(input).some(Array.isArray)) return null;
  const year = input.year ? Number(input.year) : new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || (input.year && !/^\d{4}$/.test(input.year as string))) return null;
  return { year, revisionId: input.revision as string | undefined, regionId: input.region as string | undefined, period: input.period as string | undefined };
}
