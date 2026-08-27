// Pipeline coverage: whether the open pool is big enough to plausibly close the
// gap that is left.
//
// THE SALES LOGIC. A target is not met by having exactly enough pipeline. Deals
// slip, shrink and die, so the pool has to be REDUNDANT against what remains -
// a rep sitting on 900万 of open deals against a 900万 gap is not on track, they
// are one lost deal away from missing, and every deal after that has to be
// perfect. Coverage states that redundancy as a ratio.
//
//   coverage = open pipeline / (target - already closed)
//
// Measured against the GAP, not the whole target. Once half a quarter is
// banked, pipeline against the original number flatters: it counts money
// already in the bank as if it still had to be won. The gap is what the pool
// actually has to cover.
//
// The threshold is a parameter and not a constant, because the right number is
// a property of the business, not of this repo: it falls out of the win rate
// and the sales cycle, and a team closing one deal in two needs roughly twice
// the pool of a team closing four in five. It is read from the environment at
// the call site so it can be tuned without a deploy.

/**
 * Below this, the pool is called out. Overridable; see resolveCoverageFloor.
 *
 * Three, which is the line sales management has used for decades: the pool has
 * to be about three times the gap, because roughly one deal in three closes.
 * It is a coverage RATIO, so 3 means "three times what is still needed", not
 * 3%.
 *
 * It started at 0.5 and that was too generous to be useful - at half the gap a
 * quarter is already lost, so a warning that waits for it never warns in time
 * to act. A floor that only fires when the outcome is settled is decoration.
 */
export const DEFAULT_COVERAGE_FLOOR = 3;

export interface Coverage {
  /** Open pipeline over the remaining gap. Null when there is no gap to cover. */
  readonly ratio: number | null;
  /** What still has to be closed. Zero once the target is met or beaten. */
  readonly gap: number;
  /**
   * True when the pool is thin enough to say so. Never true once the gap is
   * closed: a met target needs no pipeline at all, and warning there would
   * report success as a problem.
   */
  readonly thin: boolean;
  /** The floor this was judged against, so the surface can name it. */
  readonly floor: number;
}

/**
 * @param pipeline open, un-closed money
 * @param target   what the period asks for
 * @param closed   what has already been won toward it
 * @param floor    coverage below this is thin
 */
export function coverage(
  pipeline: number,
  target: number,
  closed: number,
  floor: number = DEFAULT_COVERAGE_FLOOR,
): Coverage {
  const gap = Math.max(0, target - closed);

  // No gap means the target is met. Ratio is null rather than Infinity: there
  // is no coverage question left to answer, and Infinity would render.
  if (gap === 0) return { ratio: null, gap: 0, thin: false, floor };

  const ratio = pipeline / gap;
  return { ratio, gap, thin: ratio < floor, floor };
}

/**
 * The floor, from the environment.
 *
 * Rejects anything that is not a finite number strictly above zero and falls
 * back to the default. A floor of zero would make the warning unreachable and a
 * negative one would make it permanent - in both cases silently, which is worse
 * than ignoring a typo in a config value.
 */
export function resolveCoverageFloor(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_COVERAGE_FLOOR;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_COVERAGE_FLOOR;
  return n;
}
