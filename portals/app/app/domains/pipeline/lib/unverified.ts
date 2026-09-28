// 未经证实金额 (YC-065 R9, deal batch 9d): how much of 承诺 and 乐观 rests on
// deals the rule cannot stand behind.
//
// A deal is UNVERIFIED when its current stage's exit check is not fully met,
// or its overall assessment (商机评估) is in the risk band. An exit criterion
// that could not be judged counts - 读不到不是证实 - and so does a deal whose
// check could not be read at all. A stage with no criteria set has nothing to
// fall short of; that alone does not make a deal unverified.
//
// Reported per category, with the deals and what each lacks, so the number is
// always one click from the list it is made of.

export type UnverifiedReason =
  | { readonly kind: "exit_unmet"; readonly names: readonly string[] }
  | { readonly kind: "exit_unknown"; readonly names: readonly string[] }
  | { readonly kind: "exit_unreadable" }
  | { readonly kind: "assessment_risk"; readonly score: number };

export interface AssessedDeal {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly amount: number;
  /** The current stage's check, by criterion name; null = could not be read. */
  readonly exit: { readonly total: number; readonly unmet: readonly string[]; readonly unknown: readonly string[] } | null;
  /** The overall assessment 0-100, and whether it is in the risk band. */
  readonly score: number | null;
  readonly risk: boolean;
}

export interface UnverifiedCategory {
  readonly category: string;
  readonly total: number;
  readonly unverified: number;
  readonly deals: readonly { readonly id: string; readonly name: string; readonly amount: number; readonly reasons: readonly UnverifiedReason[] }[];
}

export function reasonsFor(d: AssessedDeal): UnverifiedReason[] {
  const out: UnverifiedReason[] = [];
  if (d.exit === null) out.push({ kind: "exit_unreadable" });
  else {
    if (d.exit.unmet.length > 0) out.push({ kind: "exit_unmet", names: d.exit.unmet });
    if (d.exit.unknown.length > 0) out.push({ kind: "exit_unknown", names: d.exit.unknown });
  }
  if (d.risk && d.score !== null) out.push({ kind: "assessment_risk", score: d.score });
  return out;
}

export function unverifiedAmounts(deals: readonly AssessedDeal[], categories: readonly string[]): UnverifiedCategory[] {
  return categories.map((category) => {
    const mine = deals.filter((d) => d.category === category);
    const flagged = mine
      .map((d) => ({ id: d.id, name: d.name, amount: d.amount, reasons: reasonsFor(d) }))
      .filter((d) => d.reasons.length > 0)
      .sort((a, b) => b.amount - a.amount);
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      category,
      total: round(mine.reduce((s, d) => s + d.amount, 0)),
      unverified: round(flagged.reduce((s, d) => s + d.amount, 0)),
      deals: flagged,
    };
  });
}
