// 客户列表的检索与筛选 (module rebuild, 2026-09-27). Pure, so the list's
// narrowing is testable without rendering it.

/** Health bands - the same 70 / 40 lines healthTone() colours by. */
export type HealthBand = "good" | "warn" | "bad" | "unscored";

export function healthBand(score: number | null | undefined): HealthBand {
  if (score == null) return "unscored";
  return score >= 70 ? "good" : score >= 40 ? "warn" : "bad";
}

export interface AccountFilter {
  /** Matched against name, account number and industry, case-insensitive. */
  readonly query: string;
  /** A level NAME from levelOf; "" = any. */
  readonly level: string;
  readonly health: HealthBand | "";
}

export function filterAccounts<
  T extends { readonly id: string; readonly name: string; readonly accountNo: string; readonly industry?: string | null; readonly healthScore?: number | null },
>(rows: readonly T[], f: AccountFilter, levelOf?: ReadonlyMap<string, { readonly name: string }>): T[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (q === "" ||
        r.name.toLowerCase().includes(q) ||
        r.accountNo.toLowerCase().includes(q) ||
        (r.industry ?? "").toLowerCase().includes(q)) &&
      (f.level === "" || levelOf?.get(r.id)?.name === f.level) &&
      (f.health === "" || healthBand(r.healthScore) === f.health),
  );
}
