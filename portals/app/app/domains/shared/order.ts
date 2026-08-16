// Ordering that matches what Postgres does.
//
// The in-memory adapters exist so the offline path and the tests behave like the
// database. Ordering is where that quietly stopped being true: several list
// methods returned rows in insertion order while their Prisma twins carried an
// ORDER BY, and three of them then applied `limit` to that unordered set - so
// the SAME call returned different rows depending on which adapter was wired.
//
// That is worse than a cosmetic difference. It means a service test passing
// against the in-memory store proves nothing about production for anything that
// reads "the top N".
//
// NULL PLACEMENT is the subtle half. Postgres sorts NULLS LAST for ASC and
// NULLS FIRST for DESC by default, and neither is what a naive comparator does
// with undefined. These helpers reproduce it, so "the deal with no close date"
// lands in the same place in both.

type Key = string | number | Date | null | undefined;

function value(k: Key): number | string | null {
  if (k == null) return null;
  return k instanceof Date ? k.getTime() : k;
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === "string" || typeof b === "string") {
    return String(a).localeCompare(String(b));
  }
  return a - b;
}

/** ORDER BY <key> ASC - nulls last, as Postgres does. */
export function asc<T>(get: (row: T) => Key): (a: T, b: T) => number {
  return (a, b) => {
    const x = value(get(a));
    const y = value(get(b));
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return compare(x, y);
  };
}

/**
 * ORDER BY <key> DESC. Nulls FIRST by default, as Postgres does.
 *
 * That default is almost never what a ranked list wants, and the mismatch is
 * exactly the kind that survives review: "highest score first" reads fine until
 * an unscored row - which is not a high score, it is no score - lands above
 * everything. Pass `nulls: "last"` for any ranking, and make the Prisma side
 * say the same thing, because Postgres will not do it for you.
 */
export function desc<T>(
  get: (row: T) => Key,
  opts: { nulls?: "first" | "last" } = {},
): (a: T, b: T) => number {
  const nullRank = opts.nulls === "last" ? 1 : -1;
  return (a, b) => {
    const x = value(get(a));
    const y = value(get(b));
    if (x === null && y === null) return 0;
    if (x === null) return nullRank;
    if (y === null) return -nullRank;
    return compare(y, x);
  };
}

/**
 * Apply comparators in order, first difference wins.
 *
 * A tiebreak is not decoration: without one, two rows with the same sort key
 * come back in whatever order the underlying collection happens to hold, and a
 * `limit` on top of that is a coin flip.
 */
export function by<T>(...comparators: Array<(a: T, b: T) => number>): (a: T, b: T) => number {
  return (a, b) => {
    for (const c of comparators) {
      const r = c(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}
