import { currentPeriod } from "../../domains/shared/period";

// The periods the pipeline is reported in.
//
// THESE ARE IDENTIFIERS, NOT COPY, and that distinction is the reason this file
// exists. They lived in messages.ts, which made them look translatable - and
// resolvePeriod() validates a `?period=` query string against them. A locale
// that "translated" 2026Q1 would not have produced a different label; it would
// have produced a URL parameter the server no longer accepts, on that locale
// only, for readers least able to explain what happened.
//
// A year-quarter code reads the same in every language this product ships. It
// is a value domain, and value domains do not belong in a dictionary.
//
// THEY FOLLOW THE CALENDAR (2026-10-01). This file used to hold the literal
// list ["2026Q1".."2026Q4"] and a DEFAULT_PERIOD of "2026Q3". On the first day
// of Q4 the forecast and pipeline pages therefore opened on the quarter that
// had just ended while /planning, which already read the clock, opened on the
// new one - two surfaces disagreeing about "this quarter", the very thing
// domains/shared/period.ts says not to allow - and on 2027-01-01 the control
// would have offered no period of the current year at all.
//
// Every function takes `now` so the answer is a function of its input and
// testable on any date; callers pass nothing and get today.

/** The four quarters of a year, in order. */
export function quartersOf(year: number): readonly string[] {
  return [1, 2, 3, 4].map((q) => `${year}Q${q}`);
}

/** The whole-year roll-up's code, offered beside the quarters. */
export function periodYearOf(year: number): string {
  return `Y${year}`;
}

/** What the period control offers: this year's quarters and its roll-up. */
export function offeredPeriods(now: Date = new Date()): { readonly quarters: readonly string[]; readonly year: string } {
  const y = now.getUTCFullYear();
  return { quarters: quartersOf(y), year: periodYearOf(y) };
}

/** The quarter today falls in - the period every page opens on. The same
 *  function /planning uses, so no two pages can disagree about it. */
export function defaultPeriod(now: Date = new Date()): string {
  return currentPeriod(now);
}

/** Only the periods the control offers are honoured - a hand-edited `?period=`
 *  should not become an arbitrary string on its way into a query.
 *
 *  The previous year's are honoured too, though not offered: in January the
 *  review of last year's Q4 is a bookmark someone already has. */
export function resolvePeriod(raw: string | undefined, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const allowed: readonly string[] = [
    ...quartersOf(y),
    periodYearOf(y),
    ...quartersOf(y - 1),
    periodYearOf(y - 1),
  ];
  return raw && allowed.includes(raw) ? raw : defaultPeriod(now);
}
