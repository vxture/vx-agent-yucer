import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "./result";
import {
  LEAD_DISQUALIFY_REASONS,
  LEAD_TERMINATE_REASONS,
  planFunnelExit,
  STAGE_OUTCOMES,
  type FunnelExitDraft,
} from "./funnel-exit";

const draft = (over: Partial<FunnelExitDraft> = {}): FunnelExitDraft => ({
  stage: "lead",
  subjectId: "lead_1",
  outcome: "disqualified",
  reasonCode: "not_a_fit",
  note: null,
  decidedBySub: "usr_a",
  ...over,
});

test("a well-formed exit is accepted", () => {
  assert.equal(unwrap(planFunnelExit(draft())).reasonCode, "not_a_fit");
});

test("an outcome that does not belong to the stage is refused", () => {
  // The one thing a cross-stage table must not allow: a lead counted under a
  // stage it never belonged to.
  const r = planFunnelExit(draft({ outcome: "written_off" }));
  assert.equal(r.ok === false && r.violations[0].code, "outcome_not_of_stage");
});

test("every stage's outcomes are accepted for that stage", () => {
  for (const [stage, outcomes] of Object.entries(STAGE_OUTCOMES)) {
    for (const outcome of outcomes) {
      assert.ok(
        planFunnelExit(draft({ stage: stage as never, outcome })).ok,
        `${stage}/${outcome}`,
      );
    }
  }
});

test("an unknown stage or reason is refused", () => {
  const s = planFunnelExit(draft({ stage: "invoice" as never }));
  assert.equal(s.ok === false && s.violations[0].code, "unknown_stage");
  const r = planFunnelExit(draft({ reasonCode: "bored" }));
  assert.equal(r.ok === false && r.violations[0].code, "unknown_reason");
});

// --- 'other' has to say what --------------------------------------------------

test("'other' with no note is refused", () => {
  const r = planFunnelExit(draft({ reasonCode: "other" }));
  assert.equal(r.ok === false && r.violations[0].code, "note_required");
});

test("'other' with whitespace is still no note", () => {
  const r = planFunnelExit(draft({ reasonCode: "other", note: "   " }));
  assert.equal(r.ok === false && r.violations[0].code, "note_required");
});

test("'other' with a sentence is fine, and the note is trimmed", () => {
  const m = unwrap(planFunnelExit(draft({ reasonCode: "other", note: "  客户被收购  " })));
  assert.equal(m.note, "客户被收购");
});

test("a blank note on a coded reason becomes null, not an empty string", () => {
  assert.equal(unwrap(planFunnelExit(draft({ note: "   " }))).note, null);
});

test("an exit record names who decided", () => {
  const r = planFunnelExit(draft({ decidedBySub: " " }));
  assert.equal(r.ok === false && r.violations[0].code, "decider_required");
});

// --- the two menus over one vocabulary ---------------------------------------

test("判定不合格 and 终结 offer different reasons, and both allow 'other'", () => {
  // Offering all nine on both would make the two actions identical in
  // everything but their label.
  const overlap = LEAD_DISQUALIFY_REASONS.filter((r) => LEAD_TERMINATE_REASONS.includes(r));
  assert.deepEqual(overlap, ["other"], "only the escape hatch is shared");
});

test("both menus draw from the vocabulary the database accepts", () => {
  for (const r of [...LEAD_DISQUALIFY_REASONS, ...LEAD_TERMINATE_REASONS]) {
    assert.ok(planFunnelExit(draft({ reasonCode: r, note: "x" })).ok, r);
  }
});
