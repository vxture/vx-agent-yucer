// The rule's figures, and whether a model's sentence keeps to them.
//
// Every advisor that writes prose next to numbers the product computed
// (价格参谋, 预测会简报) promises the same thing (YC-070): the numbers are the
// rule's. A sentence carrying an amount or a percentage the rule did not
// produce is dropped, never shown. One checker, so the two cannot disagree
// about what counts as a figure.

export interface AllowedFigures {
  readonly amounts: ReadonlySet<string>;
  readonly percents: ReadonlySet<string>;
}

const key = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Amounts in yuan and in 万 (how the pages speak), percentages from ratios
 * (0..1) at one decimal and whole. Kept apart so 80,000 - "8 万" - never
 * licenses "8%".
 */
export function allowFigures(input: { readonly amounts: readonly (number | null)[]; readonly ratios: readonly (number | null)[] }): AllowedFigures {
  const amounts = new Set<string>();
  const percents = new Set<string>();
  for (const n of input.amounts) {
    if (n === null) continue;
    amounts.add(key(n));
    if (Math.abs(n) >= 10_000) amounts.add(key(n / 10_000));
  }
  for (const r of input.ratios) {
    if (r === null) continue;
    percents.add(key(Math.round(r * 1000) / 10));
    percents.add(key(Math.round(r * 100)));
  }
  return { amounts, percents };
}

/** A figure followed by one of these is a date or a count, not a price. */
const COUNT_UNIT = /^(年|个月|月|日|号|天|周|期|次|人|家|套|个|项|条|台|单|年度|季度|Q)/;

/**
 * True when every money-like figure in the text is the rule's. A percentage
 * and a 万 amount always count; a figure followed by a date or count unit
 * ("2026 年", "3 期", "5 单") is not a price and passes; any other bare figure
 * of 100 or more counts; small bare figures pass.
 */
export function figuresConsistent(text: string, allowed: AllowedFigures): boolean {
  const plain = text.replace(/(\d),(?=\d{3})/g, "$1");
  for (const m of plain.matchAll(/(\d+(?:\.\d+)?)\s*(%|％|万)?/g)) {
    const value = Number(m[1]);
    const unit = m[2];
    const after = plain.slice((m.index ?? 0) + m[0].length);
    if (unit === undefined) {
      if (COUNT_UNIT.test(after)) continue;
      if (value < 100) continue;
    }
    const set = unit === "%" || unit === "\uff05" ? allowed.percents : allowed.amounts;
    if (!set.has(key(value))) return false;
  }
  return true;
}

/** Split into sentences and keep the consistent ones. A full stop ends a
 *  sentence only before a space - "26.2%" is one figure. */
export function admitSentences(text: string, allowed: AllowedFigures): { kept: string[]; dropped: number } {
  const parts = text.split(/(?<=[。！？!?])\s*|(?<=\.)\s+/).filter((s) => s.trim() !== "");
  const kept = parts.filter((s) => figuresConsistent(s, allowed));
  return { kept, dropped: parts.length - kept.length };
}
