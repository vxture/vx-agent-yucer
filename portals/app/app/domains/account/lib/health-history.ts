import type { HealthContribution } from "./health";

// The health score's history (incr/0079) - what the pure layer can say about
// it: whether a new reading is worth a row, which factors moved between two
// readings, and what the score was at a moment in the past.

export type SnapshotSource = "recompute" | "sweep";

export interface HealthSnapshot {
  readonly score: number;
  readonly contributions: readonly HealthContribution[];
  readonly source: SnapshotSource;
  readonly computedAt: Date;
}

const pointsOf = (cs: readonly HealthContribution[]) =>
  new Map(cs.map((c) => [c.factor, c.points] as const));

/**
 * A reading is worth a row when the score or any factor's points differ from
 * the last row. Reasons alone are not compared: a recency reason's day count
 * moves every day while its points stay put, and a row per day of silence
 * would make the table grow with the calendar instead of with change.
 */
export function snapshotChanged(
  last: Pick<HealthSnapshot, "score" | "contributions"> | null,
  next: Pick<HealthSnapshot, "score" | "contributions">,
): boolean {
  if (!last) return true;
  if (last.score !== next.score) return true;
  const a = pointsOf(last.contributions);
  const b = pointsOf(next.contributions);
  if (a.size !== b.size) return true;
  for (const [factor, points] of b) if (a.get(factor) !== points) return true;
  return false;
}

export interface FactorDelta {
  readonly factor: HealthContribution["factor"];
  readonly from: number;
  readonly to: number;
  readonly delta: number;
}

export interface ChangeAttribution {
  readonly fromScore: number;
  readonly toScore: number;
  readonly since: Date;
  /** Only factors that moved, biggest move first. They sum to the score change
   *  (the score is BASE + the sum of contributions, clamped to 0-100 - so they
   *  sum to it exactly unless a clamp was hit). */
  readonly moved: readonly FactorDelta[];
}

/**
 * 变化归因 (YC-021 L5): "为什么从 58 掉到 34" - which factor moved, by how
 * much. `from` is the reading to explain the change against; a factor present
 * on one side only counts as 0 on the other.
 */
export function attributeChange(
  from: Pick<HealthSnapshot, "score" | "contributions" | "computedAt">,
  to: Pick<HealthSnapshot, "score" | "contributions">,
): ChangeAttribution {
  const a = pointsOf(from.contributions);
  const b = pointsOf(to.contributions);
  const factors = new Set([...a.keys(), ...b.keys()]);
  const moved: FactorDelta[] = [];
  for (const factor of factors) {
    const f = a.get(factor) ?? 0;
    const t = b.get(factor) ?? 0;
    if (f !== t) moved.push({ factor, from: f, to: t, delta: t - f });
  }
  moved.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return { fromScore: from.score, toScore: to.score, since: from.computedAt, moved };
}

/**
 * The reading to explain the CURRENT score against: the newest snapshot whose
 * score differs from it. Newest-first input. Null when every row says the
 * same score - nothing changed, so there is nothing to explain.
 */
export function lastDifferent(
  snapshots: readonly HealthSnapshot[],
  currentScore: number,
): HealthSnapshot | null {
  return snapshots.find((s) => s.score !== currentScore) ?? null;
}

/** The score in force at `at`: the newest snapshot computed at or before it.
 *  Newest-first input. Null when nothing had been recorded yet. */
export function snapshotAt(snapshots: readonly HealthSnapshot[], at: Date): HealthSnapshot | null {
  return snapshots.find((s) => s.computedAt.getTime() <= at.getTime()) ?? null;
}
