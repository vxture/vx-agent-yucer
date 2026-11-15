import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTION_RISK, CONFIDENCE_FLOOR, decideAutonomy, isAutonomyMode, isExecutable, operationRisk, riskOf } from "./autonomy";
const action = (actionType: string, confidence: number | null) => ({ actionType, confidence });

test("registration distinguishes business writes and destructive replacements from research", () => {
  assert.equal(operationRisk("advance_stage"), "important");
  assert.equal(operationRisk("record_interaction"), "important");
  assert.equal(operationRisk("fill_account_field"), "destructive");
  assert.equal(operationRisk("set_buying_role"), "destructive");
  assert.deepEqual(riskOf(action("record_evidence", 90)), ["important"]);
});

test("unknown operations cannot inherit authority, including prototype property names", () => {
  for (const name of ["draft_outreach", "delete_account", "promote_signal", "toString", "constructor", "__proto__"]) {
    assert.equal(isExecutable(name), false);
    assert.equal(operationRisk(name), "destructive");
    for (const mode of ["ask_always", "ask_high_risk", "autonomous"] as const) assert.equal(decideAutonomy(action(name, 100), mode).kind, "ask");
  }
});

test("all confirmation modes stop destructive operations even at full confidence", () => {
  for (const [name, risk] of Object.entries(ACTION_RISK)) {
    if (risk !== "destructive") continue;
    for (const mode of ["ask_always", "ask_high_risk", "autonomous"] as const) assert.equal(decideAutonomy(action(name, 100), mode).kind, "ask");
  }
});

test("routine authority asks before important business writes", () => {
  assert.equal(decideAutonomy(action("advance_stage", 99), "ask_high_risk").kind, "ask");
  assert.equal(decideAutonomy(action("add_commitment", 99), "ask_high_risk").kind, "ask");
});

test("extended authority allows supported important operations, while ask-always still asks", () => {
  assert.equal(decideAutonomy(action("advance_stage", 95), "autonomous").kind, "act");
  assert.equal(decideAutonomy(action("advance_stage", 95), "ask_always").kind, "ask");
});

test("uncertainty is recorded in addition to the explicit operation risk", () => {
  assert.deepEqual(riskOf(action("advance_stage", CONFIDENCE_FLOOR)), ["important"]);
  assert.deepEqual(riskOf(action("advance_stage", CONFIDENCE_FLOOR - 1)), ["important", "low_confidence"]);
  assert.deepEqual(riskOf(action("fill_account_field", null)), ["irreversible", "low_confidence"]);
});

test("persisted modes remain valid and arbitrary strings cannot widen autonomy", () => {
  assert.equal(isAutonomyMode("ask_high_risk"), true);
  assert.equal(isAutonomyMode("autopilot"), false);
  assert.equal(isAutonomyMode(""), false);
});
