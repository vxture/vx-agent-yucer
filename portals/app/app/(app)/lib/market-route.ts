/** Preserve old market bookmarks while the library has an independent route. */
export function legacyMarketDestination(values: Readonly<Record<string, string | readonly string[] | undefined>>): string | null {
  if (values.view !== "markets") return null;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (key === "view" || value === undefined) continue;
    const items = typeof value === "string" ? [value] : value;
    for (const item of items) query.append(key, item);
  }
  return query.size ? `/segment?${query}` : "/segment";
}

/** Legacy numbers are accepted only at entry; every relation retains its UUID. */
export function resolveMarketId(markets: readonly { readonly id: string; readonly segmentCode: string }[], reference: string): string | null {
  return (markets.find(m => m.id === reference) ?? markets.find(m => m.segmentCode === reference))?.id ?? null;
}
