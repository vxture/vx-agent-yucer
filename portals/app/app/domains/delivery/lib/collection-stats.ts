// 回款概览 - the numbers the collections page opens with, cut more than one
// way. Pure: the page reads, this counts, the section renders.
//
// THE LIST IS THE DETAIL, THIS IS THE SHAPE (owner, 2026-09-06). A schedule
// read row by row answers "what is next"; it does not answer "how bad is the
// tail" or "who is most of it". Both of those are sums over the same rows, so
// they are computed here rather than in the page, and the page cannot end up
// showing a total that disagrees with the table under it.

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

export interface CollectionStats {
  /** How late the outstanding money is, in ageing bands. */
  readonly ageing: readonly Bucket[];
  /** Who the outstanding money is with, largest first. */
  readonly byProject: readonly (Bucket & { readonly name: string })[];
  /** Promised, and of that how much has actually arrived. */
  readonly promised: number;
  readonly collected: number;
}

const DAY = 86_400_000;

/**
 * The ageing bands.
 *
 * NOT YET DUE IS A BAND, not an omission: money that is simply early is the
 * healthy part of a schedule, and a chart that showed only the late part would
 * make every workspace look like it is in trouble. `no_due_date` is its own
 * band for the opposite reason - it is not early, it is unmeasurable, and
 * folding it into "not yet due" would hide the one row nobody can chase.
 */
export const AGEING_BANDS = ["not_due", "d1_30", "d31_60", "d60_plus", "no_due_date"] as const;
export type AgeingBand = (typeof AGEING_BANDS)[number];

export function ageingBand(dueAt: string | null, now: Date): AgeingBand {
  if (!dueAt) return "no_due_date";
  const at = Date.parse(`${dueAt}T00:00:00Z`);
  if (Number.isNaN(at)) return "no_due_date";
  const late = Math.floor((now.getTime() - at) / DAY);
  if (late <= 0) return "not_due";
  if (late <= 30) return "d1_30";
  if (late <= 60) return "d31_60";
  return "d60_plus";
}

export function collectionStats(
  rows: readonly CollectionStatsRow[],
  now: Date,
): CollectionStats {
  // WRITTEN OFF IS OUT OF EVERY CUT. It is neither owed nor collected - the
  // decision has been taken - and leaving it in either total would overstate
  // both the tail and the receivable.
  const live = rows.filter((r) => r.status !== "written_off");
  const outstanding = live.filter((r) => r.status !== "settled");

  const ageing = AGEING_BANDS.map((band) => {
    const at = outstanding.filter((r) => ageingBand(r.dueAt, now) === band);
    return {
      key: band,
      amount: at.reduce((s, r) => s + r.plannedAmount, 0),
      count: at.length,
    };
  }).filter((b) => b.count > 0);

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
