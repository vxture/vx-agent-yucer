import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIDENCE_FLOOR,
  decideAutonomy,
  isAutonomyMode,
  riskOf,
} from "./autonomy";

const p = (actionType: string, confidence: number | null) => ({ actionType, confidence });

// --- What counts as high risk -----------------------------------------------

test("an outreach is irreversible however sure the model is", () => {
  // The line is REVERSIBILITY, not the model's opinion of itself. A message
  // sent to a customer cannot be unsent, and no confidence score makes it
  // retractable.
  assert.deepEqual(riskOf(p("draft_outreach", 99)), ["irreversible"]);
});

test("a reversible action with real confidence is not high risk", () => {
  // advance_stage journals every move; promote_signal produces a lead that can
  // be disqualified. Both leave a trail somebody can walk back.
  assert.deepEqual(riskOf(p("advance_stage", 86)), []);
  assert.deepEqual(riskOf(p("promote_signal", 60)), []);
});

test("the floor is inclusive, so 60 acts and 59 asks", () => {
  // 60 is the line the product already draws - the copilot page says "其中 N
  // 条置信度低于 60%". A second threshold would give one doubt two answers.
  assert.deepEqual(riskOf(p("advance_stage", CONFIDENCE_FLOOR)), []);
  assert.deepEqual(riskOf(p("advance_stage", CONFIDENCE_FLOOR - 1)), ["low_confidence"]);
});

test("no confidence at all is low confidence, not high", () => {
  // A model that declined to say how sure it was has not earned an unwatched
  // write. Absent must not read as fine.
  assert.deepEqual(riskOf(p("advance_stage", null)), ["low_confidence"]);
});

test("both reasons are reported, not the first one found", () => {
  // A page saying only "low confidence" about an outreach would invite
  // somebody to fix the confidence and expect it to go through.
  assert.deepEqual(riskOf(p("draft_outreach", 20)), ["irreversible", "low_confidence"]);
});

test("an unknown action type is high risk by default", () => {
  // The safe direction for a list that will grow: a new kind of proposal is
  // asked about until somebody deliberately adds it to REVERSIBLE_ACTIONS.
  assert.deepEqual(riskOf(p("delete_account", 100)), ["irreversible"]);
});

// --- The three postures ------------------------------------------------------

test("ask_always asks about everything, including the safe ones", () => {
  const v = decideAutonomy(p("advance_stage", 95), "ask_always");
  assert.equal(v.kind, "ask");
  // And it still reports the risk, which is empty here - the MODE is why this
  // one waits, not the proposal.
  assert.deepEqual(v.kind === "ask" ? v.reasons : null, []);
});

test("ask_high_risk acts on the safe ones and asks about the rest", () => {
  assert.equal(decideAutonomy(p("advance_stage", 86), "ask_high_risk").kind, "act");
  assert.equal(decideAutonomy(p("draft_outreach", 86), "ask_high_risk").kind, "ask");
  assert.equal(decideAutonomy(p("advance_stage", 41), "ask_high_risk").kind, "ask");
});

test("autonomous acts even on what the rule calls high risk", () => {
  // The mode means what it says. A workspace that switched this on and still
  // had outreach held back would have bought a setting that does not do the
  // thing on its label.
  const v = decideAutonomy(p("draft_outreach", 10), "autonomous");
  assert.equal(v.kind, "act");
});

test("the mode string is validated, so a bad row cannot widen autonomy", () => {
  // The DDL has a CHECK, but a value arriving from anywhere else must not be
  // able to become a mode by being spelled like one.
  assert.equal(isAutonomyMode("ask_high_risk"), true);
  assert.equal(isAutonomyMode("autopilot"), false);
  assert.equal(isAutonomyMode(""), false);
});
