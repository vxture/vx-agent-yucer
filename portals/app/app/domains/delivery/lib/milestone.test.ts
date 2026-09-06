import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import {
  changeMilestone,
  milestoneSlippage,
  planMilestone,
  type MilestoneDraft,
} from "./milestone";

const AT = new Date("2026-09-01T00:00:00Z");
const draft = (over: Partial<MilestoneDraft> = {}): MilestoneDraft => ({
  sequence: 1,
  name: "Kickoff",
  dueAt: AT,
  completedAt: null,
  status: "pending",
  baselineDueAt: AT,
  acceptance: null,
  ...over,
});

test("a milestone needs a name", () => {
  const r = planMilestone(draft({ name: "  " }));
  assert.equal(r.ok === false && r.violations[0].code, "name_required");
});

test("the sequence is a whole number from zero", () => {
  for (const bad of [-1, 1.5]) {
    const r = planMilestone(draft({ sequence: bad }));
    assert.equal(r.ok === false && r.violations[0].code, "sequence_invalid", String(bad));
  }
  assert.ok(planMilestone(draft({ sequence: 0 })).ok);
});

test("the status must be one the database will accept", () => {
  const r = planMilestone(draft({ status: "slipped" as never }));
  assert.equal(r.ok === false && r.violations[0].code, "unknown_status");
});

test("done and a completion time must agree, in both directions", () => {
  // Nothing in the DDL enforces this pair and the health rule reads only
  // `status`, so without it a milestone could say it happened and be unable to
  // say when. The pipeline keeps closed_at and a terminal stage honest for the
  // same reason: a date and a state that disagree make the history unreadable.
  const noDate = planMilestone(draft({ status: "done", completedAt: null }));
  assert.equal(noDate.ok === false && noDate.violations[0].code, "done_needs_completion");

  const notDone = planMilestone(draft({ status: "in_progress", completedAt: AT }));
  assert.equal(notDone.ok === false && notDone.violations[0].code, "completion_needs_done");

  assert.ok(planMilestone(draft({ status: "done", completedAt: AT })).ok);
});

test("a MISSED milestone carries no completion time", () => {
  // "Missed" is the statement that it did not happen, and it is the value that
  // overrides a reported green. A completion date on it is a contradiction the
  // health override would then be computed from.
  const r = planMilestone(draft({ status: "missed", completedAt: AT }));
  assert.equal(r.ok === false && r.violations[0].code, "completion_needs_done");
  assert.ok(planMilestone(draft({ status: "missed", completedAt: null })).ok);
});

test("a due date is optional - a step can exist before anyone has dated it", () => {
  assert.equal(unwrap(planMilestone(draft({ dueAt: null }))).dueAt, null);
});

// --- the baseline: what was committed ----------------------------------------

test("a create commits to the date it sets", () => {
  const later = new Date("2026-10-15T00:00:00Z");
  const m = unwrap(planMilestone(draft({ dueAt: later, baselineDueAt: null })));
  assert.deepEqual(m.baselineDueAt, later, "writing the gate IS the commitment");
});

test("an edit carries the baseline and cannot restate it", () => {
  const slipped = new Date("2026-11-01T00:00:00Z");
  const m = unwrap(
    // The caller passes a baseline of its own; it is ignored in favour of the
    // stored one. The column has no UPDATE grant, so this layer agreeing with
    // the database is the difference between a violation and a driver error.
    planMilestone(draft({ dueAt: slipped, baselineDueAt: slipped }), { baselineDueAt: AT }),
  );
  assert.deepEqual(m.baselineDueAt, AT);
});

test("slippage is against the commitment, and null is not zero", () => {
  const late = draft({ dueAt: new Date("2026-09-15T00:00:00Z"), baselineDueAt: AT });
  assert.equal(milestoneSlippage(late), 14);
  assert.equal(milestoneSlippage(draft()), 0, "on the committed date");
  assert.equal(
    milestoneSlippage(draft({ baselineDueAt: null })),
    null,
    "never committed is a different reading from holding, and 0 would say holding",
  );
  assert.equal(milestoneSlippage(draft({ dueAt: null })), null);
});

// --- acceptance: recorded by us, about the customer --------------------------

const signed = { at: AT, by: "王工", recordedBySub: "usr_pm" };

test("acceptance belongs to a gate that is done", () => {
  const r = planMilestone(draft({ status: "in_progress", acceptance: signed }));
  assert.equal(r.ok === false && r.violations[0].code, "acceptance_needs_done");
});

test("done without acceptance is legal - it is the wait for the signature", () => {
  assert.ok(planMilestone(draft({ status: "done", completedAt: AT })).ok);
});

test("an acceptance names the customer-side signatory and our recorder", () => {
  const done = { status: "done" as const, completedAt: AT };
  const noBy = planMilestone(draft({ ...done, acceptance: { ...signed, by: "  " } }));
  assert.equal(noBy.ok === false && noBy.violations[0].code, "acceptor_required");

  const noRecorder = planMilestone(draft({ ...done, acceptance: { ...signed, recordedBySub: "" } }));
  assert.equal(noRecorder.ok === false && noRecorder.violations[0].code, "recorder_required");

  const good = unwrap(planMilestone(draft({ ...done, acceptance: { ...signed, by: " 王工 " } })));
  assert.equal(good.acceptance?.by, "王工");
});

// --- the change record: a date you can quietly edit is not a commitment ------

const BY = { reason: "客户机房改造延期", changedBySub: "usr_pm" };

test("moving the date records the move, with who and why", () => {
  const moved = draft({ dueAt: new Date("2026-10-01T00:00:00Z") });
  const changes = unwrap(changeMilestone(draft(), moved, BY));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].field, "due_at");
  assert.equal(changes[0].fromValue, AT.toISOString());
  assert.equal(changes[0].toValue, moved.dueAt!.toISOString());
  assert.equal(changes[0].changedBySub, "usr_pm");
});

test("renaming a gate is a plan change too - it is what the clause is called", () => {
  const changes = unwrap(changeMilestone(draft(), draft({ name: "终验" }), BY));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].field, "name");
});

test("both moving at once are two records, not one diff to be parsed", () => {
  const changes = unwrap(changeMilestone(draft(), draft({ name: "终验", dueAt: null }), BY));
  assert.deepEqual(
    changes.map((c) => c.field),
    ["name", "due_at"],
  );
});

test("no reason, no move", () => {
  const r = changeMilestone(draft(), draft({ dueAt: null }), { ...BY, reason: "   " });
  assert.equal(r.ok === false && r.violations[0].code, "change_reason_required");
});

test("a change record must name its author", () => {
  const r = changeMilestone(draft(), draft({ dueAt: null }), { ...BY, changedBySub: "" });
  assert.equal(r.ok === false && r.violations[0].code, "changer_required");
});

test("working the gate is not changing the plan, and needs no justification", () => {
  // The status moving, or the completion time landing, must not be made to
  // invent a reason - that is how a change log fills with "started".
  const worked = draft({ status: "done", completedAt: AT, acceptance: signed });
  const changes = unwrap(changeMilestone(draft(), worked, { reason: "", changedBySub: "" }));
  assert.deepEqual(changes, []);
});
