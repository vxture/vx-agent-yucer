// 回款概览 - the numbers the collections page opens with, cut more than one
// way. Pure: the page reads, this counts, the section renders.
//
// THE LIST IS THE DETAIL, THIS IS THE SHAPE (owner, 2026-09-06). A schedule
// read row by row answers "what is next"; it does not answer "how bad is the
// tail" or "who is most of it". Both of those are sums over the same rows, so
// they are computed here rather than in the page, and the page cannot end up
// showing a total that disagrees with the table under it.

import { fail, ok, violation, type RuleResult } from "../../shared/result";

export interface CollectionStatsRow {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly plannedAmount: number;
  readonly actualAmount: number | null;
  readonly dueAt: string | null;
}

export interface Bucket {
  readonly key: string;
  readonly amount: number;
  readonly count: number;
}

/**
 * What a band IS, so a screen can name it without a fixed dictionary.
 *
 * The band keys used to be five literals with five translations beside them.
 * They cannot be, now that the cutoffs are the workspace's (incr/0042): a
 * workspace ageing at 45/90 has bands no dictionary written in advance has a
 * sentence for. So a band carries its own bounds and the interface composes
 * the label - 逾期 1-45 天 - from the numbers.
 */
export type AgeingBand =
  | { readonly kind: "not_due" }
  | { readonly kind: "no_due_date" }
  /** `to` null is the open-ended tail: 逾期 90 天以上. */
  | { readonly kind: "late"; readonly from: number; readonly to: number | null };

export interface CollectionStats {
  /** How late the outstanding money is, in ageing bands. */
  readonly ageing: readonly (Bucket & { readonly band: AgeingBand })[];
  /** Who the outstanding money is with, largest first. */
  readonly byProject: readonly (Bucket & { readonly name: string })[];
  /** Promised, and of that how much has actually arrived. */
  readonly promised: number;
  readonly collected: number;
}

const DAY = 86_400_000;

/**
 * Where the late bands end, in days overdue - the workspace's, since 0042.
 *
 * THE CUTOFFS ARE DATA AND THE TWO END BANDS ARE NOT. 未到期 exists in every
 * possible policy, because money that is simply early is the healthy part of a
 * schedule and a chart showing only the late part would make every workspace
 * look like it is in trouble; 未填到期日 exists for the opposite reason - it is
 * not early, it is unmeasurable, and folding it into "not yet due" would hide
 * the one row nobody can chase. Where LATE is cut is a finance team's ageing
 * policy: 30/60 is one way and 30/60/90 is another.
 */
export const DEFAULT_AGEING_CUTOFFS: readonly number[] = [30, 60];

/**
 * Cutoffs a workspace may actually be given.
 *
 * THE SAME THREE THINGS chk_ageing_policy_size, _positive and _ascending say
 * in the database, said here in the product's own terms - out of order the
 * bands would overlap and a row would fall in whichever the loop tested first;
 * equal, one band would be empty by construction; more than five and the chart
 * stops being readable.
 */
export function planAgeingCutoffs(
  cutoffs: readonly number[],
): RuleResult<readonly number[]> {
  if (cutoffs.length < 1 || cutoffs.length > 5) {
    return fail(violation(
      "cutoff_count",
      "an ageing policy has between one and five cutoffs",
      "cutoffs",
    ));
  }
  for (const c of cutoffs) {
    if (!Number.isInteger(c) || c < 1 || c > 3650) {
      return fail(violation("cutoff_range", "a cutoff is a whole number of days, 1 to 3650", "cutoffs"));
    }
  }
  for (let i = 1; i < cutoffs.length; i += 1) {
    if (cutoffs[i]! <= cutoffs[i - 1]!) {
      return fail(violation(
        "cutoffs_unordered",
        "the cutoffs have to rise, or two bands would claim the same day",
        "cutoffs",
      ));
    }
  }
  return ok(cutoffs);
}

/** The bands a set of cutoffs produces, in the order a chart draws them. */
export function ageingBands(
  cutoffs: readonly number[] = DEFAULT_AGEING_CUTOFFS,
): readonly AgeingBand[] {
  const late: AgeingBand[] = cutoffs.map((to, i) => ({
    kind: "late" as const,
    from: (cutoffs[i - 1] ?? 0) + 1,
    to,
  }));
  return [
    { kind: "not_due" },
    ...late,
    { kind: "late", from: (cutoffs.at(-1) ?? 0) + 1, to: null },
    { kind: "no_due_date" },
  ];
}

/** A band's key, stable enough to be a React key and to read in a test. */
export function ageingKey(band: AgeingBand): string {
  if (band.kind === "late") return band.to === null ? `d${band.from}_plus` : `d${band.from}_${band.to}`;
  return band.kind;
}

export function ageingBand(
  dueAt: string | null,
  now: Date,
  cutoffs: readonly number[] = DEFAULT_AGEING_CUTOFFS,
): AgeingBand {
  if (!dueAt) return { kind: "no_due_date" };
  const at = Date.parse(`${dueAt}T00:00:00Z`);
  if (Number.isNaN(at)) return { kind: "no_due_date" };
  const late = Math.floor((now.getTime() - at) / DAY);
  if (late <= 0) return { kind: "not_due" };
  for (const [i, to] of cutoffs.entries()) {
    if (late <= to) return { kind: "late", from: (cutoffs[i - 1] ?? 0) + 1, to };
  }
  return { kind: "late", from: (cutoffs.at(-1) ?? 0) + 1, to: null };
}

export function collectionStats(
  rows: readonly CollectionStatsRow[],
  now: Date,
  cutoffs: readonly number[] = DEFAULT_AGEING_CUTOFFS,
): CollectionStats {
  // WRITTEN OFF IS OUT OF EVERY CUT. It is neither owed nor collected - the
  // decision has been taken - and leaving it in either total would overstate
  // both the tail and the receivable.
  const live = rows.filter((r) => r.status !== "written_off");
  const outstanding = live.filter((r) => r.status !== "settled");

  const ageing = ageingBands(cutoffs)
    .map((band) => {
      const key = ageingKey(band);
      const at = outstanding.filter((r) => ageingKey(ageingBand(r.dueAt, now, cutoffs)) === key);
      return {
        key,
        band,
        amount: at.reduce((s, r) => s + r.plannedAmount, 0),
        count: at.length,
      };
    })
    .filter((b) => b.count > 0);

  const perProject = new Map<string, Bucket & { name: string }>();
  for (const r of outstanding) {
    const cell = perProject.get(r.projectId) ?? {
      key: r.projectId,
      name: r.projectName,
      amount: 0,
      count: 0,
    };
    perProject.set(r.projectId, {
      ...cell,
      amount: cell.amount + r.plannedAmount,
      count: cell.count + 1,
    });
  }

  return {
    ageing,
    byProject: [...perProject.values()].sort((a, b) => b.amount - a.amount),
    promised: live.reduce((s, r) => s + r.plannedAmount, 0),
    // What ARRIVED, not what was planned for the rows that settled - short
    // payment is normal here and summing the plan would report money nobody
    // received.
    collected: live
      .filter((r) => r.status === "settled")
      .reduce((s, r) => s + (r.actualAmount ?? 0), 0),
  };
}
