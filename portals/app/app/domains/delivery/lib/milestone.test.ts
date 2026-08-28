import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import { planMilestone, type MilestoneDraft } from "./milestone";

const AT = new Date("2026-09-01T00:00:00Z");
const draft = (over: Partial<MilestoneDraft> = {}): MilestoneDraft => ({
  sequence: 1,
  name: "Kickoff",
  dueAt: AT,
  completedAt: null,
  status: "pending",
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
