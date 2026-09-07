import { routingStats, type RoutingStatRow } from "./routing-stats";

// 分配检查 - what the routing dock says about the queue. Pure: the page reads,
// this decides, the panel renders.
//
// A ROUTER'S FINDINGS ARE ABOUT THE MAP, NOT THE LEADS. Every lead this page
// cannot place is a hole somewhere else - an account with no region, a region
// no territory covers, a territory nobody owns - and each of those is a
// different person's job. A dock that only said "12 unroutable" would be
// telling the reader something they can already see in the list, and telling
// them nothing about who fixes it.
//
// THE ONE FINDING THAT IS ABOUT PEOPLE is the imbalance. Territory decides who
// MAY work a lead; load decides which of them SHOULD. When one territory has a
// single owner the load half never runs at all, so the queue can pile up on
// one person while the rule stays perfectly correct - that is not a bug in the
// router and it will never be reported as one.

export type RoutingAdviceKind =
  /** Leads waiting on an apply that is already decided. */
  | "pending_assignments"
  /** An account with no region - the router cannot even start. */
  | "no_region"
  /** A region no active territory covers - a hole in the map. */
  | "no_territory"
  /** A territory covers it, and nobody is running it. */
  | "no_owner"
  /** One person would be left carrying far more than the rest. */
  | "load_imbalance";

export interface RoutingAdvice {
  readonly id: string;
  readonly kind: RoutingAdviceKind;
  readonly count: number;
  /** The person a load finding is about. */
  readonly sub?: string;
  /** Their share, as a whole percentage, for the load finding. */
  readonly share?: number;
}

/**
 * Half again as much as an even split would give.
 *
 * MEASURED AGAINST THE HEADCOUNT, not against a fixed percentage, and the
 * first version of this was a flat 50% - which is exactly what an even split
 * between TWO people looks like. A share that means "crowded" among five
 * people means "perfectly balanced" among two, so any constant percentage is
 * wrong for every headcount but one.
 *
 * A THRESHOLD, NOT A VERDICT. There is no honest universal answer to "how
 * uneven is too uneven" - two reps covering one region should split it, and a
 * rep who owns a territory alone should hold all of it. This fires where
 * somebody would want to look, and says who and how much rather than saying
 * anything is wrong.
 */
const CROWDED_MULTIPLE = 1.5;

/** Below this there is no such thing as an imbalance worth reporting. */
const ENOUGH_TO_JUDGE = 4;

export function analyseRouting(rows: readonly RoutingStatRow[]): RoutingAdvice[] {
  const stats = routingStats(rows);
  const out: RoutingAdvice[] = [];

  if (stats.pending > 0) {
    out.push({ id: "pending", kind: "pending_assignments", count: stats.pending });
  }

  // THE MAP'S HOLES, each as its own finding. Ordered by how early they break
  // the rule: no region means the router cannot start, no territory means the
  // map has nothing to say, no owner means the map says something and there is
  // nobody to say it to.
  for (const kind of ["no_region", "no_territory", "no_owner"] as const) {
    const found = stats.byReason.find((b) => b.key === kind);
    if (found) out.push({ id: kind, kind, count: found.count });
  }

  // THE LOAD READING IS ABOUT WHERE THE PAGE WOULD LEAVE THINGS, not where it
  // found them. Reporting the current pile-up when the page is already
  // proposing to fix it would send somebody to solve a solved problem.
  const total = stats.byOwner.reduce((n, o) => n + o.after, 0);
  const top = stats.byOwner[0];
  if (top && total >= ENOUGH_TO_JUDGE && stats.byOwner.length > 1) {
    const share = top.after / total;
    const evenShare = total / stats.byOwner.length;
    if (top.after >= evenShare * CROWDED_MULTIPLE) {
      out.push({
        id: `load-${top.sub}`,
        kind: "load_imbalance",
        count: top.after,
        sub: top.sub,
        share: Math.round(share * 100),
      });
    }
  }

  return out;
}
