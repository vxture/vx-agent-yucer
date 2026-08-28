// The plan a project is delivered against.
//
// `delivery.milestone.upsert` shipped in batch 1 with nothing behind it
// (TD-016): the port has `listMilestones` and no write, so a delivery plan
// could only ever be what db-init put there. `projectView` already returns the
// milestones and, until now, nothing rendered them - the same shape the
// instalments were in before 6a-3b.
//
// It is not cosmetic. `deriveProjectHealth` reads milestone STATUS: a single
// `missed` milestone overrides a manager's reported green, and the done count
// is the progress figure. So the delivery plan decides a verdict on the page,
// and nobody could write one.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { MILESTONE_STATUSES, type MilestoneStatus } from "./revenue";

export interface MilestoneDraft {
  /** Unique per project and NOT writable - the anchor, like a territory code. */
  sequence: number;
  name: string;
  dueAt: Date | null;
  completedAt: Date | null;
  status: MilestoneStatus;
}

/**
 * Validate a milestone before it is written.
 *
 * THE ONE REAL RULE HERE is that `done` and `completed_at` must agree, in both
 * directions. Nothing in the DDL enforces it and nothing in the health rule
 * reads `completed_at`, so a milestone could be marked done with no completion
 * time - a record that says it happened and cannot say when. The pipeline keeps
 * the same pair honest for `closed_at` against a terminal stage, and for the
 * same reason: a date and a state that disagree make the history unreadable.
 *
 * A MISSED milestone carries no completion time either. "Missed" is the
 * statement that it did not happen; a completion date on it is a contradiction
 * that would then feed the health override.
 */
export function planMilestone(input: MilestoneDraft): RuleResult<MilestoneDraft> {
  const name = input.name.trim();
  if (!name) {
    return fail(violation("name_required", "a milestone needs a name", "name"));
  }
  if (!Number.isInteger(input.sequence) || input.sequence < 0) {
    return fail(violation("sequence_invalid", "a milestone's sequence is a whole number from zero", "sequence"));
  }
  if (!(MILESTONE_STATUSES as readonly string[]).includes(input.status)) {
    return fail(violation("unknown_status", `${String(input.status)} is not a milestone status`, "status"));
  }
  if (input.status === "done" && input.completedAt === null) {
    return fail(
      violation("done_needs_completion", "a milestone marked done must say when it was done", "completedAt"),
    );
  }
  if (input.status !== "done" && input.completedAt !== null) {
    return fail(
      violation(
        "completion_needs_done",
        "a completion time belongs to a milestone that is done - a missed one did not happen",
        "status",
      ),
    );
  }

  return ok({ ...input, name });
}
