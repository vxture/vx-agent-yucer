// 采纳后成效回看 - what happened after a proposal was accepted (L6 batch four).
//
// The one place an agent product can show whether it was worth listening to:
// a proposal someone signed for, and the facts that followed it. Pure - the
// page reads each owning domain (D6 stage events, D4 interactions and
// commitments) and hands the rows in; this decides which of them fall inside
// the window and what the review says.
//
// NO REPLAYED SCORE (owner, 2026-09-22). "Health at the time of the decision"
// cannot be replayed honestly: the delivery factor reads project.health, which
// is overwritten in place with no history, so a replayed score would quietly
// mix today's delivery state into a past number.
//
// A RECORDED ONE, SINCE incr/0079 (owner, 2026-09-24). The score is now written
// down when it is computed (account_health_snapshot), so "before" and "after"
// are READ, not re-derived: the snapshot in force at the decision and the one
// in force at the window's end (or now, while it runs). A decision older than
// the history has no "before" and says so.
//
// NOT CAUSATION. The review lists what happened in the window after the
// decision; it does not claim the proposal caused it. The page says "after",
// never "because".

export const REVIEW_WINDOW_DAYS = 14;

const DAY = 86_400_000;

export interface ReviewedDecision {
  status: string;
  decidedAt: Date | null;
}

export interface OutcomeFacts {
  stageMoves: ReadonlyArray<StageMove>;
  interactions: ReadonlyArray<{ id: string; occurredAt: Date }>;
  commitments: ReadonlyArray<CommitmentFact>;
  /** The account's recorded health readings, NEWEST FIRST (incr/0079).
   *  Absent = history not read; the review then carries no health line. */
  healthSnapshots?: ReadonlyArray<{ score: number; computedAt: Date }>;
}

type StageMove = { id: string; opportunityId: string; fromStage: string | null; toStage: string; occurredAt: Date };
type CommitmentFact = { id: string; status: string; dueAt: Date; metAt: Date | null };

export interface OutcomeReview {
  windowStart: Date;
  windowEnd: Date;
  /** False while the window is still running - the review is provisional. */
  windowClosed: boolean;
  stageMoves: StageMove[];
  interactions: Array<{ id: string; occurredAt: Date }>;
  /** Kept inside the window (met_at in it). */
  commitmentsMet: CommitmentFact[];
  /** Fell due inside the window and were missed. */
  commitmentsMissed: CommitmentFact[];
  /** Nothing at all followed - said explicitly, never an empty panel. */
  nothingFollowed: boolean;
  /** The recorded score in force at the decision and at the window's end (or
   *  now). Null inside means nothing had been recorded by then. Null overall
   *  when the history was not supplied. */
  health: { before: number | null; after: number | null } | null;
}

/** Only an accepted decision has an outcome to review; `executed` is accepted and carried out. */
export function isReviewable<T extends ReviewedDecision>(d: T): d is T & { decidedAt: Date } {
  return (d.status === "accepted" || d.status === "executed") && d.decidedAt !== null;
}

export function reviewOutcome(
  decision: ReviewedDecision & { decidedAt: Date },
  facts: OutcomeFacts,
  now: Date,
  windowDays: number = REVIEW_WINDOW_DAYS,
): OutcomeReview {
  const windowStart = decision.decidedAt;
  const windowEnd = new Date(windowStart.getTime() + windowDays * DAY);
  // Strictly after the decision: a fact recorded before the click is context,
  // not an outcome - including one from the same minute.
  const inWindow = (t: Date) => t > windowStart && t <= windowEnd;
  const byTime = <T>(get: (x: T) => Date) => (a: T, b: T) => get(a).getTime() - get(b).getTime();

  const stageMoves = [...facts.stageMoves].filter((s) => inWindow(s.occurredAt)).sort(byTime((s) => s.occurredAt));
  const interactions = facts.interactions.filter((i) => inWindow(i.occurredAt)).sort(byTime((i) => i.occurredAt));
  const commitmentsMet = facts.commitments
    .filter((c) => c.status === "met" && c.metAt !== null && inWindow(c.metAt))
    .sort(byTime((c) => c.metAt!));
  const commitmentsMissed = facts.commitments
    .filter((c) => c.status === "missed" && inWindow(c.dueAt))
    .sort(byTime((c) => c.dueAt));

  const scoreAt = (at: Date) =>
    facts.healthSnapshots?.find((s) => s.computedAt.getTime() <= at.getTime())?.score ?? null;
  const health = facts.healthSnapshots
    ? { before: scoreAt(windowStart), after: scoreAt(now < windowEnd ? now : windowEnd) }
    : null;

  return {
    health,
    windowStart,
    windowEnd,
    windowClosed: now >= windowEnd,
    stageMoves,
    interactions,
    commitmentsMet,
    commitmentsMissed,
    nothingFollowed:
      stageMoves.length + interactions.length + commitmentsMet.length + commitmentsMissed.length === 0,
  };
}
