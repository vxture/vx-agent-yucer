/** A stable business code for a new strategy, independent of revision numbers. */
export function nextStrategyNumber(period: string, existing: readonly string[]): string {
  const token = period.trim().toUpperCase().replace(/^(\d{4})[\s-]?([QH])([1-4])$/, "$1-$2$3")
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "CUSTOM";
  const prefix = `PLAN-${token}-`;
  let maximum = 0;
  for (const code of existing) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (/^\d+$/.test(suffix) && Number.isSafeInteger(Number(suffix))) maximum = Math.max(maximum, Number(suffix));
  }
  return `${prefix}${String(maximum + 1).padStart(3, "0")}`;
}
