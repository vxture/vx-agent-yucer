import type { SegmentCriteria, SegmentStatus } from "./lifecycle";

// WHAT A SEGMENTATION CAN BE WRONG ABOUT - the dock beside /segment.
//
// Same shape as the catalogue's analyses: pure, tested, codes and numbers
// rather than sentences (TD-010), and silent when the cut is sound.
//
// THE FINDING THIS PAGE WAS BUILT AROUND is the DIVERGENCE between two counts
// the page has always shown side by side: who carries a segment's code, and
// who its definition actually matches. Equal is healthy. Apart, in either
// direction, is a decision somebody made and nobody re-read:
//
//   assigned but not matching - a code handed out against the definition. The
//     account will be worked as if it were in this cut and will fall out of
//     every list the definition drives.
//   matching but unassigned  - the definition found customers nobody has cut
//     in. They are invisible to the campaigns aimed at this segment.
//
// Neither is repairable by a machine: which of the two is wrong - the code or
// the criteria - is a commercial judgement. So every item here ends in a
// link, as the solution check does.

export type SegmentAdviceKind =
  /** Accounts carry the code but do not match the criteria. */
  | "assigned_not_matching"
  /** The criteria match accounts that carry no code. */
  | "matching_not_assigned"
  /** No criteria at all: a cut that names nobody. */
  | "no_criteria"
  /** Not tied to a plan: a cut nobody is spending against. */
  | "no_plan"
  /** Paused or retired, yet accounts still carry the code. */
  | "stale_assignment";

export interface SegmentAdvice {
  readonly id: string;
  readonly kind: SegmentAdviceKind;
  readonly segmentId: string;
  readonly segmentCode: string;
  readonly segmentName: string;
  /** How many accounts the finding is about, when it counts any. */
  readonly count?: number;
}

export interface SegmentAdviceInput {
  readonly segments: readonly {
    readonly id: string;
    readonly segmentCode: string;
    readonly name: string;
    readonly planId: string | null;
    readonly status: SegmentStatus;
    readonly criteria: SegmentCriteria;
  }[];
  /** Per segment code: accounts carrying it, and accounts its criteria match.
   * Resolved by the caller, which is where the account read (and its own
   * gate) lives - this file stays pure. */
  readonly counts: ReadonlyMap<string, { readonly assigned: number; readonly matched: number }>;
  /** Accounts carrying the code that do NOT match the criteria, and the other
   * way round. Both are derived by the caller for the same reason. */
  readonly mismatch: ReadonlyMap<string, { readonly assignedNotMatching: number; readonly matchingNotAssigned: number }>;
}

/** Worst first: a wrong assignment misleads work today; a missing plan is a
 * gap in intent. */
const RANK: Record<SegmentAdviceKind, number> = {
  assigned_not_matching: 0,
  matching_not_assigned: 1,
  stale_assignment: 2,
  no_criteria: 3,
  no_plan: 4,
};

export function analyseSegments(input: SegmentAdviceInput): SegmentAdvice[] {
  const out: SegmentAdvice[] = [];

  for (const s of input.segments) {
    const named = { segmentId: s.id, segmentCode: s.segmentCode, segmentName: s.name };
    const counts = input.counts.get(s.segmentCode) ?? { assigned: 0, matched: 0 };
    const gap = input.mismatch.get(s.segmentCode) ?? {
      assignedNotMatching: 0,
      matchingNotAssigned: 0,
    };

    // A retired or paused cut is not being worked, so its divergence is not a
    // finding - but accounts still carrying its code ARE: they are being
    // counted into a segmentation nobody maintains.
    if (s.status !== "active") {
      if (counts.assigned > 0) {
        out.push({
          id: `stale:${s.id}`,
          kind: "stale_assignment",
          ...named,
          count: counts.assigned,
        });
      }
      continue;
    }

    // An empty definition matches nothing, so the two counts cannot be
    // compared - saying "nobody matches" would be blaming the data for a
    // definition that was never written.
    if (s.criteria.industries.length === 0 && s.criteria.regions.length === 0) {
      out.push({ id: `criteria:${s.id}`, kind: "no_criteria", ...named });
    } else {
      if (gap.assignedNotMatching > 0) {
        out.push({
          id: `assigned:${s.id}`,
          kind: "assigned_not_matching",
          ...named,
          count: gap.assignedNotMatching,
        });
      }
      if (gap.matchingNotAssigned > 0) {
        out.push({
          id: `matching:${s.id}`,
          kind: "matching_not_assigned",
          ...named,
          count: gap.matchingNotAssigned,
        });
      }
    }

    if (!s.planId) {
      out.push({ id: `plan:${s.id}`, kind: "no_plan", ...named });
    }
  }

  return out.sort(
    (a, b) => RANK[a.kind] - RANK[b.kind] || a.segmentName.localeCompare(b.segmentName),
  );
}
