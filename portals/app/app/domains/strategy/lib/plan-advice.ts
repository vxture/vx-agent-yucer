import { planAcceptsNewWork, type PlanStatus } from "./lifecycle";

// 计划检查 - what the strategy dock says about the plans a workspace is
// carrying. A pure function: the page reads, this decides, the panel renders.
//
// EVERY FINDING IS A GAP BETWEEN THE PLAN AND THE CALENDAR OR THE WORK, and
// nothing here is a preference. A plan whose period has begun while it is
// still a draft, a plan running with no campaign under it, a plan nobody cut
// the market for - each is a fact the reader can check on the same screen.
//
// THE CLOCK IS AN ARGUMENT, not something this file reads. Half of these
// findings compare a period to today; a rule that called `new Date()` itself
// could be run but not tested, and "it depends on when you ask" is exactly
// the property a test has to pin.

export type PlanAdviceKind =
  /** No objective written down - a plan that states no aim. */
  | "no_objective"
  /** Its period has started and it is still a draft. */
  | "draft_period_started"
  /** Approved, period started, never switched on. */
  | "approved_not_active"
  /** Running, and no campaign points at it. */
  | "active_no_campaign"
  /** Running, and no segment says who it is aimed at. */
  | "active_no_segment"
  /** Its period is over and it is still running. */
  | "period_over_not_closed"
  /** Campaigns are already hanging off a plan that is not live yet. */
  | "work_under_inactive_plan";

export interface PlanAdvice {
  readonly id: string;
  readonly kind: PlanAdviceKind;
  readonly planId: string;
  readonly planNo: string;
  readonly planName: string;
  /** The campaign count, for the two findings that state one. */
  readonly count?: number;
}

export interface PlanAdviceRow {
  readonly id: string;
  readonly planNo: string;
  readonly name: string;
  readonly period: string;
  readonly objective: string | null;
  readonly status: PlanStatus;
}

export interface PlanAdviceInput {
  readonly plans: readonly PlanAdviceRow[];
  /** planId -> how many campaigns point at it. */
  readonly campaignCounts: ReadonlyMap<string, number>;
  /** planId -> how many market segments point at it. */
  readonly segmentCounts: ReadonlyMap<string, number>;
  /** Today, passed in. See the note at the top of this file. */
  readonly now: Date;
}

/**
 * The calendar window a period string names, or null when it names one this
 * product cannot place.
 *
 * `2026H1` and `2026Q3` are arithmetic - halves and quarters of a stated year,
 * with the separator the workspace happens to write (`2026-Q3`) tolerated
 * because the create form suggests back whichever spelling it already found.
 *
 * `FY26` IS DELIBERATELY UNPLACEABLE. A fiscal year ends where the tenant's
 * finance calendar says, and this product holds no such setting; a guess would
 * date every calendar finding wrongly for every tenant whose year does not end
 * in December. An unknown period yields no window, and a plan with no window
 * simply gets no calendar findings - silence is the honest answer, not a
 * finding computed from an assumption.
 */
export function periodWindow(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})[\s-]?([HQ])([1-4])$/i.exec(period.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const kind = m[2]!.toUpperCase();
  const n = Number(m[3]);
  if (kind === "H") {
    if (n > 2) return null;
    return n === 1
      ? { start: dayStart(year, 0, 1), end: dayEnd(year, 5, 30) }
      : { start: dayStart(year, 6, 1), end: dayEnd(year, 11, 31) };
  }
  const firstMonth = (n - 1) * 3;
  const lastMonth = firstMonth + 2;
  return {
    start: dayStart(year, firstMonth, 1),
    end: dayEnd(year, lastMonth, daysIn(year, lastMonth)),
  };
}

// The window is CLOSED at both ends - the first instant of its first day to
// the last instant of its last day - so "the period has started" is true on
// day one and "the period is over" is false on the last day.
function dayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function dayEnd(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Worst first, so the dock's top item is the one to act on. */
const ORDER: readonly PlanAdviceKind[] = [
  "period_over_not_closed",
  "draft_period_started",
  "approved_not_active",
  "work_under_inactive_plan",
  "active_no_campaign",
  "active_no_segment",
  "no_objective",
];

export function analysePlans(input: PlanAdviceInput): readonly PlanAdvice[] {
  const out: PlanAdvice[] = [];

  for (const p of input.plans) {
    // An archived plan is filed away: it is not wrong, it is finished. Saying
    // anything about it would fill the dock with history nobody can act on.
    if (p.status === "archived") continue;

    const at = (kind: PlanAdviceKind, count?: number) =>
      out.push({
        id: `${kind}:${p.id}`,
        kind,
        planId: p.id,
        planNo: p.planNo,
        planName: p.name,
        ...(count === undefined ? {} : { count }),
      });

    const campaigns = input.campaignCounts.get(p.id) ?? 0;
    const segments = input.segmentCounts.get(p.id) ?? 0;
    const window = periodWindow(p.period);
    const started = window ? input.now.getTime() >= window.start.getTime() : false;
    const over = window ? input.now.getTime() > window.end.getTime() : false;

    if (p.status !== "closed" && (p.objective ?? "").trim() === "") {
      at("no_objective");
    }
    if (p.status === "draft" && started) at("draft_period_started");
    if (p.status === "approved" && started) at("approved_not_active");
    if (p.status === "active" && over) at("period_over_not_closed");
    if (p.status === "active" && campaigns === 0) at("active_no_campaign");
    if (p.status === "active" && segments === 0) at("active_no_segment");

    // WORK ALREADY UNDER A PLAN THAT IS NOT LIVE. Asked through the lifecycle
    // rule rather than by listing statuses here, so the day `approved` starts
    // attracting work this finding stops firing on its own. Closed plans are
    // excluded because their campaigns are history, not premature work.
    if (
      !planAcceptsNewWork(p.status) &&
      p.status !== "closed" &&
      campaigns > 0
    ) {
      at("work_under_inactive_plan", campaigns);
    }
  }

  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
