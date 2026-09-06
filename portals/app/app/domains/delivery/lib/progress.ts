// 项目进展 - where a project has got to, and how far along that is.
//
// DERIVED, NOT ESTIMATED, and the distinction matters enough to state at the
// top. This reads the milestone plan and computes a figure; it does not judge,
// weight by importance, or predict. A genuine estimate - "this looks like 60%
// given how the last three went" - is a JUDGEMENT, and in this product a
// judgement the machine makes is a proposal a person decides on (ADR-003),
// not a number that appears in a column. If that is wanted it is a different
// mechanism, and this file is not it.
//
// THE PLAN IS THE ONLY HONEST DENOMINATOR. Progress could be read off the
// project's status, or off how much money has arrived, and both would be
// answering a different question: what stage it is at, or what has been paid.
// "How far through the plan" is the milestones, and nothing else here knows.

export interface ProgressNode {
  readonly sequence: number;
  readonly name: string;
  readonly status: string;
}

export interface Progress {
  /** The milestone the project is at, or null when the plan is finished. */
  readonly currentName: string | null;
  /** 0-100, whole numbers. */
  readonly percent: number;
  /** No plan at all - the percentage is not a claim, it is an absence. */
  readonly unplanned: boolean;
  /**
   * Every milestone is ticked.
   *
   * SEPARATE FROM `percent === 100`, and that is the whole point of it. A
   * delivered project is 100% by fiat above; whether its plan was actually
   * walked through is a different fact, and the surface must not say "计划已走完"
   * over a plan that still has open gates. The gap between the two is a
   * record-keeping gap worth showing, not smoothing over.
   */
  readonly planComplete: boolean;
}

/**
 * A milestone in flight counts half.
 *
 * NOT ZERO AND NOT ONE. Zero says a project that has started its final gate
 * has done nothing since the one before; one says it is finished when it is
 * not. Half is the only honest thing to say about work that is under way and
 * not accepted - and it is a stated convention rather than a measurement,
 * which is why it is a named constant and not an inline 0.5.
 */
const IN_FLIGHT_CREDIT = 0.5;

/**
 * A missed milestone earns nothing.
 *
 * It is not "partly done" - it is a gate the project failed to pass, and the
 * health reading already treats one as overriding a green report. Giving it
 * credit would let a project's progress rise on the strength of a failure.
 */
export function projectProgress(
  nodes: readonly ProgressNode[],
  projectStatus: string,
): Progress {
  // A DELIVERED PROJECT IS 100% WHATEVER THE PLAN SAYS. The contract closed;
  // a plan left half-ticked afterwards is a record-keeping gap, not evidence
  // that the work is unfinished, and showing 40% against a delivered project
  // would have the page argue with itself.
  const allDone = nodes.length > 0 && nodes.every((m) => m.status === "done");

  if (projectStatus === "delivered" || projectStatus === "closed") {
    return {
      currentName: null,
      percent: 100,
      unplanned: nodes.length === 0,
      planComplete: allDone,
    };
  }

  // CANCELLED IS NOT DELIVERED. It sits in the same finished table, which is
  // exactly why it needs saying: a cancelled project stopped where it stopped,
  // so it keeps the share of the plan it actually got through and names no
  // current milestone - nothing is in flight on a project that was called off.
  const stopped = projectStatus === "cancelled";

  if (nodes.length === 0) {
    // No plan means no denominator. Zero here would read as "nothing has
    // happened", which is a claim this data cannot support.
    return { currentName: null, percent: 0, unplanned: true, planComplete: false };
  }

  const ordered = [...nodes].sort((a, b) => a.sequence - b.sequence);
  const earned = ordered.reduce(
    (n, m) =>
      n + (m.status === "done" ? 1 : m.status === "in_progress" ? IN_FLIGHT_CREDIT : 0),
    0,
  );

  // THE CURRENT MILESTONE IS THE FIRST ONE NOT FINISHED - in_progress if one
  // is, otherwise the earliest that has not been passed. A missed gate is
  // still where the project stands: it did not get past it, so naming the one
  // after it would say the project moved on when it did not.
  const current = stopped
    ? null
    : (ordered.find((m) => m.status === "in_progress") ??
      ordered.find((m) => m.status !== "done") ??
      null);

  return {
    currentName: current?.name ?? null,
    percent: Math.round((earned / ordered.length) * 100),
    unplanned: false,
    planComplete: allDone,
  };
}
