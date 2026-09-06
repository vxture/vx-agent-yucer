import { FORECAST_CATEGORIES, type ForecastCategory } from "./forecast";

// 口径分析 - the numbers the forecast-rule page opens with, built to the shape
// collections and delivery settled on (owner, 2026-09-06: 统计为主，列表为具体
// 清单). Pure: the page reads, this counts, the section renders.
//
// THE PRIMARY CUT IS THE CATEGORY, because that is what a forecast IS: how
// much of the book is committed, how much is only hoped for. The list below
// answers "which deal"; this answers "how much, and how sure".
//
// THE SECOND CUT IS THE DISAGREEMENT'S DIRECTION, and it is the one this page
// exists for. A rep who files a deal MORE optimistically than the rule is a
// different problem from one who files it more conservatively - the first
// inflates a number somebody will be held to, the second hides work that is
// actually going well. A single "12 disagreements" count hides which.

export interface ForecastStatsRow {
  readonly filed: ForecastCategory;
  readonly suggested: ForecastCategory | null;
  readonly agrees: boolean;
  readonly amount: number | null;
}

export interface Bucket {
  readonly key: string;
  readonly amount: number;
  readonly count: number;
}

export interface ForecastStats {
  /** Value and deal count filed at each category. */
  readonly byCategory: readonly Bucket[];
  /** Where the rule and the person disagree, and which way. */
  readonly optimistic: Bucket;
  readonly conservative: Bucket;
  readonly agreed: Bucket;
  readonly total: number;
}

/** Least sure to most sure - the order a forecast is read in. */
const RANK: Record<ForecastCategory, number> = {
  pipeline: 0,
  best_case: 1,
  commit: 2,
  closed: 3,
};

/** Is `a` a more optimistic filing than `b`? */
export function moreOptimistic(a: ForecastCategory, b: ForecastCategory): boolean {
  return RANK[a] > RANK[b];
}

export function forecastStats(rows: readonly ForecastStatsRow[]): ForecastStats {
  const sum = (list: readonly ForecastStatsRow[]) =>
    list.reduce((n, r) => n + (r.amount ?? 0), 0);
  const bucket = (key: string, list: readonly ForecastStatsRow[]): Bucket => ({
    key,
    amount: sum(list),
    count: list.length,
  });

  const byCategory = FORECAST_CATEGORIES.map((c) =>
    bucket(c, rows.filter((r) => r.filed === c)),
  ).filter((b) => b.count > 0);

  // A SETTLED DEAL HAS NO OPINION TO DISAGREE WITH. `agrees` is true for it by
  // construction, so it lands in `agreed` rather than being counted as a rep
  // and a rule seeing eye to eye on a judgement neither of them made.
  const disputed = rows.filter((r) => !r.agrees && r.suggested !== null);

  return {
    byCategory,
    optimistic: bucket(
      "optimistic",
      disputed.filter((r) => moreOptimistic(r.filed, r.suggested!)),
    ),
    conservative: bucket(
      "conservative",
      disputed.filter((r) => !moreOptimistic(r.filed, r.suggested!)),
    ),
    agreed: bucket("agreed", rows.filter((r) => r.agrees || r.suggested === null)),
    total: rows.length,
  };
}
