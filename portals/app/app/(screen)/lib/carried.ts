/* Carry-forward for a line that is read against a scale.
 *
 * A period with nothing to measure has NO reading - a day the copilot
 * proposed nothing has no acceptance rate, a fortnight in which nothing fell
 * due has no collection rate. Drawing zero there says "everything was
 * rejected" / "nothing was collected", which is a claim the data does not
 * make. So the line CARRIES the last reading across the gap, and the chart
 * remembers which points were measured so the readout can say "-" on the
 * others.
 *
 * THE CASES REAL DATA BRINGS (owner, 2026-09-09: 考虑实际数据的多种情况):
 *   - leading gaps: before the first reading there is nothing to carry, so
 *     the line STARTS at the first measured point rather than rising from a
 *     zero nobody measured;
 *   - no reading at all: no line, no end marker, "-" everywhere;
 *   - a single point: a dot, not a division by zero.
 */
export interface Carried {
  /** The value drawn at each index; meaningless before `first`. */
  readonly pts: readonly number[];
  /** Whether index i was measured (true) or carried (false). */
  readonly real: readonly boolean[];
  /** Index of the first measured point, or -1 when nothing was measured. */
  readonly first: number;
}

export function carryForward(readings: readonly (number | null)[]): Carried {
  const pts: number[] = [];
  const real: boolean[] = [];
  let carried = 0;
  let first = -1;
  readings.forEach((r, i) => {
    if (r !== null) {
      carried = r;
      if (first < 0) first = i;
    }
    pts.push(carried);
    real.push(r !== null);
  });
  return { pts, real, first };
}

/** The SVG path of a carried line: from the first measured point to the end,
 *  empty when nothing was measured. */
export function carriedPath(
  c: Carried,
  xs: (i: number) => number,
  ys: (v: number) => number,
): string {
  if (c.first < 0) return "";
  return c.pts
    .map((v, i) => (i < c.first ? null : `${i === c.first ? "M" : "L"}${xs(i)} ${ys(v)}`))
    .filter((s): s is string => s !== null)
    .join(" ");
}

/** x for index i across a rail of width w: a single point sits at the end -
 *  it is "now" - rather than dividing by zero. */
export function railX(i: number, n: number, w: number): number {
  return n > 1 ? i * (w / (n - 1)) : w;
}
