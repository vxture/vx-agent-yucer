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

export const PERIODS = ["2026Q1", "2026Q2", "2026Q3", "2026Q4"] as const;

/** The whole-year roll-up, offered beside the quarters. */
export const PERIOD_YEAR = "Y2026";

export const DEFAULT_PERIOD = "2026Q3";

/** Only the periods the control offers are honoured - a hand-edited `?period=`
 *  should not become an arbitrary string on its way into a query. */
export function resolvePeriod(raw: string | undefined): string {
  const allowed: readonly string[] = [...PERIODS, PERIOD_YEAR];
  return raw && allowed.includes(raw) ? raw : DEFAULT_PERIOD;
}
