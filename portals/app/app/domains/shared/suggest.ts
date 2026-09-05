// Suggestion helpers no single domain owns.
//
// suggestNextCode and knownValues were born in the catalogue (#184) and moved
// here the moment a second domain needed them: a plan number is a series the
// same way a product code is, and an industry list is a vocabulary the same way
// a category is. The DOMAIN-SPECIFIC engines stay in their domains - a floor
// ratio is a fact about pricing, an uncovered region is a fact about planning -
// and only the shapes that carry no domain meaning live here.
//
// The contract every suggestion function keeps: REFUSE TO GUESS. Null or empty
// over an invented convention, because a suggestion engine's failure mode is
// not wrong numbers - it is confident numbers with nothing behind them.

/**
 * The next code in the series the workspace is already using.
 *
 * People number their catalogues - PRD-001, PRD-002 - and the follow-on code is
 * the single likeliest thing a person will type into a blank code field.
 * Detected, not assumed: the suggestion exists only when a majority of existing
 * codes share one prefix-and-number shape, because "your convention seems to
 * be X" is only worth saying when there is a convention.
 *
 * Returns null when there is no series to continue - fewer than two conforming
 * codes, or no codes at all. Null means "say nothing", never "suggest
 * something generic": an invented convention would teach the workspace a
 * pattern nobody chose.
 */
export function suggestNextCode(existing: readonly string[]): string | null {
  const shaped = existing
    .map((c) => /^(.*?)(\d+)$/.exec(c.trim()))
    .filter((m): m is RegExpExecArray => m !== null);
  if (shaped.length < 2) return null;

  // The dominant prefix. Two products numbered under different prefixes are
  // two series, and continuing the bigger one is the best available guess.
  const byPrefix = new Map<string, RegExpExecArray[]>();
  for (const m of shaped) {
    const list = byPrefix.get(m[1]!) ?? [];
    list.push(m);
    byPrefix.set(m[1]!, list);
  }
  const [prefix, members] = [...byPrefix.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  if (members.length < 2) return null;

  const width = members[0]![2]!.length;
  const max = Math.max(...members.map((m) => Number(m[2])));
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

/**
 * The vocabulary already in use for a free-text field.
 *
 * A category typed as "软件" on one product and "软体" on the next splits every
 * report that groups by it. Offering the existing values is how a free field
 * stays a vocabulary; most-used first, because the common case should be the
 * first click.
 */
export function knownValues(values: readonly (string | null)[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const t = v?.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}
