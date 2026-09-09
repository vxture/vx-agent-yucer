/* 统计周期 - the window every figure on the screen is counted over.
 *
 * 全部, this year, and this year's four quarters. Built from a clock rather
 * than written down, so the list is right in any year without an edit.
 *
 * WHAT A PERIOD FILTERS, AND WHAT IT CANNOT. Every row is placed by its own
 * event date: a deal by when it closed, or when it is expected to if it has
 * not; a lead and a proposal by when they arrived; an instalment by when it
 * settled, or fell due if it has not; a gate by when it completed, or fell due.
 * A project takes the date of the deal that created it, which is the only date
 * it has that means anything commercially.
 *
 * ACCOUNTS ARE NOT FILTERED, and the screen says so rather than pretending
 * otherwise: AccountRecord carries no created date, so "客户 98 家" is the
 * workspace's customers, not the customers of a quarter. Filtering them on a
 * date the record does not have would mean inventing one.
 */

export type PeriodKey = "all" | "year" | "q1" | "q2" | "q3" | "q4";

export interface Period {
  readonly key: PeriodKey;
  readonly label: string;
  /** Inclusive start; null for 全部. */
  readonly from: Date | null;
  /** Exclusive end; null for 全部. */
  readonly to: Date | null;
}

/**
 * The six choices, for a given clock.
 *
 * The quarters are THIS year's, including ones that have not happened yet -
 * a forward quarter is a legitimate thing to ask about, because open deals
 * carry an expected close date and land in it.
 */
export function periodsFor(now: Date, labels: {
  all: string;
  year: (y: number) => string;
  quarter: (y: number, q: number) => string;
}): readonly Period[] {
  const y = now.getFullYear();
  const out: Period[] = [
    { key: "all", label: labels.all, from: null, to: null },
    {
      key: "year",
      label: labels.year(y),
      from: new Date(y, 0, 1),
      to: new Date(y + 1, 0, 1),
    },
  ];
  for (let q = 0; q < 4; q++) {
    out.push({
      key: (["q1", "q2", "q3", "q4"] as const)[q]!,
      label: labels.quarter(y, q + 1),
      from: new Date(y, q * 3, 1),
      to: new Date(y, q * 3 + 3, 1),
    });
  }
  return out;
}

/** Whether a date falls in the window. A row with no date is never in one. */
export function within(at: Date | null | undefined, p: Period): boolean {
  if (p.from === null || p.to === null) return true;
  if (!at) return false;
  const t = at.getTime();
  return t >= p.from.getTime() && t < p.to.getTime();
}

/**
 * The instant the charts' rolling windows should end on.
 *
 * 近 12 期 and 近 30 天 are relative windows, so under a past quarter they
 * would otherwise reach forward into weeks the period excludes and draw
 * nothing. Anchoring them to the period's end - never later than now - keeps
 * the strips reading against the same span the cells are counting.
 */
export function anchorOf(p: Period, now: Date): Date {
  if (p.to === null) return now;
  const end = new Date(p.to.getTime() - 1);
  return end.getTime() > now.getTime() ? now : end;
}
