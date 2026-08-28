// Turning a period LABEL into the dates it covers.
//
// `period` is a free-form VARCHAR(32) across sales_target and forecast_snapshot
// - deliberately, because a workspace's fiscal calendar is its own business.
// Nothing needed to interpret it until TD-013: a NEW LOGO count is "customers
// won inside this period", which cannot be answered without knowing when the
// period starts and ends.
//
// Returns null rather than guessing. A label this product cannot parse is not
// an error - it is a workspace using a convention we do not know - and the
// measurement that needed it then reports "not measured" instead of a number
// derived from a range we invented.

export interface PeriodRange {
  readonly start: Date;
  readonly end: Date;
}

const QUARTER = /^(\d{4})Q([1-4])$/;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
// Two spellings of a year, because the product already ships both: the pipeline
// page's whole-year tab is "Y2026" (see (app)/lib/periods.ts) while a bare
// "2026" is the obvious thing for anyone to type. Accepting only one of them
// would make the year tab unforecastable.
const YEAR = /^Y?(\d{4})$/;

/**
 * The half-open range [start, end) a period label covers, in UTC.
 *
 * Half-open on purpose: a deal that closes at the exact instant a quarter ends
 * belongs to the next one, and it must belong to exactly one. An inclusive end
 * would put it in both.
 */
export function periodRange(period: string): PeriodRange | null {
  const label = period.trim().toUpperCase();

  const q = QUARTER.exec(label);
  if (q) {
    const year = Number(q[1]);
    const startMonth = (Number(q[2]) - 1) * 3;
    return {
      start: new Date(Date.UTC(year, startMonth, 1)),
      end: new Date(Date.UTC(year, startMonth + 3, 1)),
    };
  }

  const m = MONTH.exec(label);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
  }

  const y = YEAR.exec(label);
  if (y) {
    const year = Number(y[1]);
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
  }

  return null;
}

/** Whether an instant falls inside a period. Null instants never do. */
export function within(range: PeriodRange, at: Date | null): boolean {
  if (!at) return false;
  return at.getTime() >= range.start.getTime() && at.getTime() < range.end.getTime();
}

/**
 * The period today falls in.
 *
 * Here rather than on a page because it was written on one and needed on
 * another: `/planning` had a private copy, and the board needed the same notion
 * to say "this quarter" about a number. Two definitions of "this quarter" is
 * how two surfaces come to disagree about the same money.
 *
 * Quarters, matching what `periodRange` parses first and what the pipeline
 * page's tabs offer. A workspace on a non-calendar fiscal year gets the wrong
 * default here, which is a real limitation and not a hidden one - D2 replaces
 * this with a picker when it gets one.
 */
export function currentPeriod(now: Date): string {
  return `${now.getUTCFullYear()}Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}
