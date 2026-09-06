// 回款检查 - what the collections dock says about the money that has been
// promised and not yet arrived. A pure function: the page reads, this decides,
// the panel renders.
//
// EVERY FINDING IS A GAP BETWEEN WHAT WAS AGREED AND WHAT HAPPENED, and the
// gap is always a number this page already shows: a date that has passed, an
// amount that arrived short, a schedule with no date to be late against.
//
// IT NEVER MOVES MONEY. Marking an instalment settled asserts that cash
// arrived, which is a fact about the world and not a suggestion a machine can
// accept on anyone's behalf (ADR-003). The acts this dock offers are the ones
// that only restate what the calendar already says.

export type CollectionAdviceKind =
  /** Past its due date and still not settled. */
  | "overdue"
  /** Due date has passed but the row still reads as pending or invoiced. */
  | "due_not_flagged"
  /** Settled for less than was planned. */
  | "short_paid"
  /** An instalment with no due date - it can never be late. */
  | "no_due_date"
  /** Every instalment on one project is still outstanding. */
  | "nothing_collected";

export interface CollectionAdvice {
  readonly id: string;
  readonly kind: CollectionAdviceKind;
  readonly instalmentId: string;
  readonly projectId: string;
  readonly projectName: string;
  /** Days past due; positive once late, null with no due date. */
  readonly daysLate: number | null;
  /** The shortfall, for the finding that states one. */
  readonly shortfall?: number;
}

export interface CollectionAdviceRow {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly plannedAmount: number;
  readonly actualAmount: number | null;
  /** ISO date, or null when the schedule never set one. */
  readonly dueAt: string | null;
}

const DAY = 86_400_000;

/** Worst first, so the dock's top item is the one to act on. */
const ORDER: readonly CollectionAdviceKind[] = [
  "overdue",
  "due_not_flagged",
  "short_paid",
  "nothing_collected",
  "no_due_date",
];

export function analyseCollections(
  rows: readonly CollectionAdviceRow[],
  now: Date,
): readonly CollectionAdvice[] {
  const out: CollectionAdvice[] = [];

  const daysLate = (dueAt: string | null): number | null => {
    if (!dueAt) return null;
    const at = Date.parse(`${dueAt}T00:00:00Z`);
    if (Number.isNaN(at)) return null;
    return Math.floor((now.getTime() - at) / DAY);
  };

  for (const r of rows) {
    const late = daysLate(r.dueAt);
    const at = (kind: CollectionAdviceKind, shortfall?: number) =>
      out.push({
        id: `${kind}:${r.id}`,
        kind,
        instalmentId: r.id,
        projectId: r.projectId,
        projectName: r.projectName,
        daysLate: late,
        ...(shortfall === undefined ? {} : { shortfall }),
      });

    // A WRITTEN-OFF INSTALMENT IS A DECISION, NOT A DEFECT. Somebody accepted
    // the loss; saying it again every time the page loads would bury the rows
    // that still need doing.
    if (r.status === "written_off") continue;

    if (r.status === "settled") {
      // Short payment is the one thing worth saying about money that arrived,
      // and it is normal enough that the schedule tracks it separately from
      // invoicing rather than treating it as an error.
      if (r.actualAmount !== null && r.actualAmount < r.plannedAmount) {
        at("short_paid", r.plannedAmount - r.actualAmount);
      }
      continue;
    }

    if (r.dueAt === null) {
      // An instalment with no date can never be late, so it will never appear
      // in an overdue count - the quiet way a receivable goes uncollected.
      at("no_due_date");
      continue;
    }

    if (r.status === "overdue") at("overdue");
    // THE ROW HAS NOT CAUGHT UP WITH THE CALENDAR. `overdue` is a status
    // somebody sets; the date passing is a fact nobody has to. The two
    // disagreeing is exactly what a collections review is for.
    else if (late !== null && late > 0) at("due_not_flagged");
  }

  // One per project, not one per instalment: the finding is about the project.
  const byProject = new Map<string, CollectionAdviceRow[]>();
  for (const r of rows) {
    if (r.status === "written_off") continue;
    const list = byProject.get(r.projectId) ?? [];
    list.push(r);
    byProject.set(r.projectId, list);
  }
  for (const [projectId, list] of byProject) {
    if (list.length === 0 || list.some((r) => r.status === "settled")) continue;
    const first = list[0]!;
    out.push({
      id: `nothing_collected:${projectId}`,
      kind: "nothing_collected",
      instalmentId: first.id,
      projectId,
      projectName: first.projectName,
      daysLate: daysLate(first.dueAt),
    });
  }

  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
