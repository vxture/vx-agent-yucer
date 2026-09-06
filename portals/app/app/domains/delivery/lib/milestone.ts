// The plan a project is delivered against - and, since 2026-09-06, the plan it
// is PAID against.
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
//
// A MARKET-MANAGEMENT VIEW, NOT AN R&D ONE (owner, 2026-09-06). The four
// original fields describe a work package: a piece of work, when it should
// finish, whether it did. The commercial questions - what did we promise, has
// the customer signed it off, which money does it release - were all missing,
// and incr/0032 adds them. The rules below are the half a CHECK constraint
// cannot express.

import { fail, ok, violation, type RuleResult } from "../../shared/result";
import { MILESTONE_STATUSES, type MilestoneStatus } from "./revenue";

/**
 * The customer's sign-off, as OUR people wrote it down.
 *
 * RECORDED, NOT COLLECTED (owner, 2026-09-06). The customer does not use this
 * system and is never asked to operate it: there is no portal, no invite and no
 * signature capture. `by` is the customer-side signatory's name as typed by one
 * of our users, and `recordedBySub` is that user - which is why the two are
 * separate fields and why only the second is a subject. Same shape as
 * `account.record`: recording what happened is not the customer doing anything.
 */
export interface MilestoneAcceptance {
  /** When the customer signed off - THEIR date, not the day we typed it. */
  at: Date;
  /** The customer-side signatory's name. */
  by: string;
  /** Which of our users recorded it. */
  recordedBySub: string;
}

export interface MilestoneDraft {
  /** Unique per project and NOT writable - the anchor, like a territory code. */
  sequence: number;
  name: string;
  dueAt: Date | null;
  completedAt: Date | null;
  status: MilestoneStatus;
  /**
   * WHAT WAS COMMITTED, set once when the gate is first written and immutable
   * thereafter - `baseline_due_at` is absent from the UPDATE grant, so the
   * database refuses a rewrite even if this layer were wrong.
   *
   * Derived here rather than accepted from the caller: on a create it IS the
   * due date, because committing to a date is what writing the gate does. A
   * form that asked for both would be asking the same question twice and
   * inviting a plan that was born already late.
   */
  baselineDueAt: Date | null;
  acceptance: MilestoneAcceptance | null;
}

/** One field of the plan moving, with the reason it moved. */
export interface MilestoneChangeDraft {
  field: "name" | "due_at";
  fromValue: string | null;
  toValue: string | null;
  reason: string;
  changedBySub: string;
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
 *
 * `before` is the stored milestone when this is an edit. It carries the
 * baseline forward, which is the one thing an edit may not restate.
 */
export function planMilestone(
  input: MilestoneDraft,
  before?: Pick<MilestoneDraft, "baselineDueAt"> | null,
): RuleResult<MilestoneDraft> {
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

  // --- the acceptance record ------------------------------------------------
  if (input.acceptance) {
    // Mirrors chk_project_milestone_accepted_is_done. A customer does not sign
    // off work that is not finished; `done` WITHOUT acceptance is the normal
    // state of waiting for the signature, which is why only this direction is
    // refused.
    if (input.status !== "done") {
      return fail(
        violation(
          "acceptance_needs_done",
          "a gate the customer signed off is a gate that is done",
          "status",
        ),
      );
    }
    if (!input.acceptance.by.trim()) {
      return fail(
        violation(
          "acceptor_required",
          "an acceptance names who signed it off on the customer's side",
          "acceptance.by",
        ),
      );
    }
    if (!input.acceptance.recordedBySub.trim()) {
      // Unattributable by construction - and it is our own user, not the
      // customer, who must be named here.
      return fail(
        violation("recorder_required", "an acceptance record names who recorded it", "acceptance.recordedBySub"),
      );
    }
  }

  return ok({
    ...input,
    name,
    acceptance: input.acceptance
      ? { ...input.acceptance, by: input.acceptance.by.trim() }
      : null,
    // An edit CARRIES the baseline; a create SETS it to the date being
    // committed. Either way the caller does not get to choose it.
    baselineDueAt: before ? before.baselineDueAt : input.dueAt,
  });
}

const iso = (d: Date | null) => (d === null ? null : d.toISOString());

/**
 * What changed about the PLAN, and whether it may change without a reason.
 *
 * A DATE YOU CAN QUIETLY EDIT IS NOT A COMMITMENT. That is the whole of this
 * function. Moving a gate moves the money bound to it, so it is a commercial
 * event with an author and a justification - not a form save. The baseline
 * makes the slip visible; this makes it explained.
 *
 * ONLY THE PLAN, NOT THE WORK. `name` and `due_at` are what was committed to;
 * status moving pending -> in_progress -> done is the gate being worked, and
 * demanding a written reason for each step would fill the log with "started".
 * The work's history is already the status, the completion time and the
 * acceptance record on the row itself.
 */
export function changeMilestone(
  before: MilestoneDraft,
  after: MilestoneDraft,
  by: { reason: string; changedBySub: string },
): RuleResult<readonly MilestoneChangeDraft[]> {
  const reason = by.reason.trim();
  const changes: MilestoneChangeDraft[] = [];

  if (before.name.trim() !== after.name.trim()) {
    changes.push({
      field: "name",
      fromValue: before.name,
      toValue: after.name,
      reason,
      changedBySub: by.changedBySub,
    });
  }
  if (iso(before.dueAt) !== iso(after.dueAt)) {
    changes.push({
      field: "due_at",
      fromValue: iso(before.dueAt),
      toValue: iso(after.dueAt),
      reason,
      changedBySub: by.changedBySub,
    });
  }

  if (changes.length === 0) return ok([]);

  // Checked only once something actually moved: an edit that touches the
  // status and leaves the plan alone is not a plan change and must not be
  // made to invent a justification for one.
  if (!reason) {
    return fail(
      violation("change_reason_required", "moving a committed gate needs a reason", "reason"),
    );
  }
  if (!by.changedBySub.trim()) {
    return fail(violation("changer_required", "a change record names who made it", "changedBySub"));
  }

  return ok(changes);
}

const DAY_MS = 86_400_000;

/**
 * How far the gate has moved from what was committed, in whole days.
 *
 * Positive is late. Null means there is nothing to compare - no baseline, or
 * no current date - and null is NOT zero: "we never committed to a date" and
 * "it is exactly on the committed date" are opposite readings, and a surface
 * that shows 0 for both says the plan is holding when no plan was made.
 */
export function milestoneSlippage(m: Pick<MilestoneDraft, "baselineDueAt" | "dueAt">): number | null {
  if (m.baselineDueAt === null || m.dueAt === null) return null;
  return Math.round((m.dueAt.getTime() - m.baselineDueAt.getTime()) / DAY_MS);
}
