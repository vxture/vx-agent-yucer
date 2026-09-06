import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseRenewals, type RenewalAdviceRow } from "./renewal-advice";

const row = (over: Partial<RenewalAdviceRow> = {}): RenewalAdviceRow => ({
  projectId: "prj_1",
  projectNo: "PRJ-001",
  projectName: "retail platform, year two",
  daysToEnd: 40,
  amount: 600_000,
  risk: "low",
  notDueReason: null,
  ...over,
});

const kinds = (rows: readonly { kind: string }[]) => rows.map((r) => r.kind);

test("a term that has already ended is the loudest thing on the page", () => {
  assert.deepEqual(kinds(analyseRenewals([row({ daysToEnd: -12 })])), ["lapsed"]);
});

test("a healthy subscription inside the window is the ordinary queue", () => {
  assert.deepEqual(kinds(analyseRenewals([row()])), ["due_soon"]);
});

test("delivery health decides how loudly a due renewal is said", () => {
  assert.deepEqual(kinds(analyseRenewals([row({ risk: "watch" })])), ["watch_risk"]);
});

// The one not-due reason that costs money by being quiet.
test("a subscription with no end date is raised even though it is not due", () => {
  const out = analyseRenewals([row({ notDueReason: "no_end_date", daysToEnd: null, risk: null })]);
  assert.deepEqual(kinds(out), ["no_end_date"]);
});

test("the other not-due reasons say nothing at all", () => {
  for (const reason of ["too_far_out", "already_renewed", "not_subscription", "not_delivering"]) {
    assert.deepEqual(
      kinds(analyseRenewals([row({ notDueReason: reason, risk: null })])),
      [],
      reason,
    );
  }
});

// Said IN ADDITION to the timing finding, because both are true.
test("a due renewal with no figure raises both findings", () => {
  const out = analyseRenewals([row({ amount: null })]);
  assert.deepEqual(kinds(out), ["no_amount", "due_soon"]);
});

test("a missing amount is not raised for something that is not due", () => {
  const out = analyseRenewals([row({ notDueReason: "too_far_out", amount: null, risk: null })]);
  assert.deepEqual(kinds(out), [], "the proposal it would open with a blank number does not exist");
});

test("the worst finding across projects sorts first", () => {
  const out = analyseRenewals([
    row({ projectId: "a", daysToEnd: 30 }),
    row({ projectId: "b", risk: "watch" }),
    row({ projectId: "c", daysToEnd: -3 }),
  ]);
  assert.deepEqual(kinds(out), ["lapsed", "watch_risk", "due_soon"]);
});

test("each finding carries the project it is about, and its id is stable", () => {
  const out = analyseRenewals([row({ daysToEnd: -5 })]);
  assert.equal(out[0]!.id, "lapsed:prj_1");
  assert.equal(out[0]!.projectNo, "PRJ-001");
  assert.equal(out[0]!.daysToEnd, -5, "the panel says how long ago, so it carries the figure");
});

test("nothing to renew produces nothing to say", () => {
  assert.deepEqual(analyseRenewals([]), []);
});
