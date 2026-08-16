import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROBABILITY,
  OPEN_STAGE_ORDER,
  STAGES,
  applyProbability,
  isProbabilityOverridden,
  isRegression,
  isTerminal,
  planProbabilityOverride,
  planStageChange,
  statusFor,
  type OpportunitySnapshot,
  type Stage,
} from "./stage";

const AT = new Date("2026-08-15T10:00:00Z");

function opp(over: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot {
  return { stage: "qualify", status: "open", probability: 10, closedAt: null, ...over };
}

function plan(current: OpportunitySnapshot, to: Stage, extra: Record<string, unknown> = {}) {
  return planStageChange(current, { to, occurredAt: AT, actorSub: "usr_1", ...extra });
}

// --- Shape ------------------------------------------------------------------

test("the seven stages and their default win rates match the spec table", () => {
  assert.deepEqual([...STAGES], ["qualify", "discover", "validate", "propose", "negotiate", "won", "lost"]);
  assert.deepEqual(DEFAULT_PROBABILITY, {
    qualify: 10,
    discover: 25,
    validate: 50,
    propose: 70,
    negotiate: 90,
    won: 100,
    lost: 0,
  });
});

test("exactly two stages are terminal, and neither is on the selling line", () => {
  assert.deepEqual(STAGES.filter(isTerminal), ["won", "lost"]);
  for (const s of OPEN_STAGE_ORDER) assert.equal(isTerminal(s), false);
  assert.equal(OPEN_STAGE_ORDER.length, 5);
});

test("status is derived from stage, and abandoned is never inferred", () => {
  assert.equal(statusFor("qualify"), "open");
  assert.equal(statusFor("won"), "won");
  assert.equal(statusFor("lost"), "lost");
  // abandoned is a human decision about an open deal, not a stage.
  assert.equal(STAGES.map(statusFor).includes("abandoned"), false);
});

// --- Journalling ------------------------------------------------------------

test("a stage change always produces the journal event and the patch together", () => {
  const r = plan(opp(), "discover");
  assert.ok(r.ok);
  assert.deepEqual(r.value.event, {
    fromStage: "qualify",
    toStage: "discover",
    reason: null,
    actorSub: "usr_1",
    occurredAt: AT,
  });
  assert.equal(r.value.patch.stage, "discover");
});

test("a no-op move is refused rather than journalled", () => {
  // The DB CHECK forbids from = to; catching it here also keeps a zero-length
  // interval out of the velocity journal.
  const r = plan(opp({ stage: "discover", probability: 25 }), "discover");
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "stage_unchanged");
});

test("an agent-driven move may have a null actor", () => {
  const r = planStageChange(opp(), { to: "discover", actorSub: null, occurredAt: AT });
  assert.ok(r.ok);
  assert.equal(r.value.event.actorSub, null);
});

test("a blank reason is normalized to null rather than stored as whitespace", () => {
  const r = plan(opp(), "discover", { reason: "   " });
  assert.ok(r.ok);
  assert.equal(r.value.event.reason, null);
});

// --- Terminal stages --------------------------------------------------------

test("entering a terminal stage books the deal in one patch", () => {
  // A won deal with a null closed_at falls out of every period-scoped report -
  // and one left in `commit` is counted by rollUp() as revenue still to come
  // while closedAmount stays empty, which is the same money reported twice.
  const r = plan(opp({ stage: "negotiate", probability: 90 }), "won");
  assert.ok(r.ok);
  assert.deepEqual(r.value.patch, {
    stage: "won",
    status: "won",
    closedAt: AT,
    probability: 100,
    forecastCategory: "closed",
  });
});

test("reopening puts the deal back in the most conservative bucket", () => {
  // Not the bucket it held before. A reopened deal has to earn `commit` again;
  // restoring it silently would keep a commitment nobody re-made.
  const r = plan(
    opp({ stage: "won", status: "won", probability: 100, closedAt: AT }),
    "negotiate",
    { reopen: true, reason: "customer restarted the process" },
  );
  assert.ok(r.ok);
  assert.equal(r.value.patch.forecastCategory, "pipeline");
  assert.equal(r.value.patch.closedAt, null);
});

test("a move between open stages leaves the bucket alone", () => {
  // The forecast bucket is a salesperson's judgement everywhere except the
  // terminal boundary, where it is a fact.
  const r = plan(opp({ stage: "discover" }), "validate");
  assert.ok(r.ok);
  assert.equal("forecastCategory" in r.value.patch, false);
});

test("entering a terminal stage requires a win/loss review", () => {
  const won = plan(opp({ stage: "negotiate", probability: 90 }), "won");
  assert.equal(won.ok && won.value.requiresWinLossReview, true);
  const lost = plan(opp({ stage: "qualify" }), "lost");
  assert.equal(lost.ok && lost.value.requiresWinLossReview, true);
});

test("a re-close does not demand a second review - there is only ever one", () => {
  const r = plan(opp({ stage: "negotiate", probability: 90, hasWinLossReview: true }), "won");
  assert.equal(r.ok && r.value.requiresWinLossReview, false);
});

test("a deal can be lost from any open stage", () => {
  for (const from of OPEN_STAGE_ORDER) {
    const r = plan(opp({ stage: from, probability: DEFAULT_PROBABILITY[from] }), "lost");
    assert.ok(r.ok, `lost from ${from}`);
    assert.equal(r.value.patch.probability, 0);
  }
});

test("leaving a terminal stage is refused without explicit reopen intent", () => {
  const r = plan(opp({ stage: "won", status: "won", probability: 100, closedAt: AT }), "negotiate");
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "terminal_stage");
});

test("reopening needs a reason and clears closed_at", () => {
  const closed = opp({ stage: "lost", status: "lost", probability: 0, closedAt: AT });

  const noReason = plan(closed, "negotiate", { reopen: true });
  assert.equal(noReason.ok, false);
  assert.equal(noReason.ok === false && noReason.violations[0].code, "reason_required");

  const r = plan(closed, "negotiate", { reopen: true, reason: "customer restarted the budget cycle" });
  assert.ok(r.ok);
  // A reopened deal keeping its old closed_at lands in a closed period it is no
  // longer part of.
  assert.equal(r.value.patch.closedAt, null);
  assert.equal(r.value.patch.status, "open");
});

// --- Direction --------------------------------------------------------------

test("moving forward needs no reason; moving back does", () => {
  const forward = plan(opp({ stage: "discover", probability: 25 }), "validate");
  assert.ok(forward.ok);

  const backward = plan(opp({ stage: "validate", probability: 50 }), "discover");
  assert.equal(backward.ok, false);
  assert.equal(backward.ok === false && backward.violations[0].code, "reason_required");

  const explained = plan(opp({ stage: "validate", probability: 50 }), "discover", {
    reason: "champion left, decision chain reset",
  });
  assert.ok(explained.ok);
});

test("a stage may skip ahead - selling is not a queue", () => {
  const r = plan(opp(), "negotiate");
  assert.ok(r.ok);
  assert.equal(r.value.patch.probability, 90);
});

test("isRegression only applies along the open line", () => {
  assert.equal(isRegression("validate", "discover"), true);
  assert.equal(isRegression("discover", "validate"), false);
  // Terminal stages are not on the line, so nothing involving them regresses.
  assert.equal(isRegression("won", "negotiate"), false);
  assert.equal(isRegression("negotiate", "lost"), false);
});

// --- Probability ------------------------------------------------------------

test("the default win rate follows the stage while nobody has overridden it", () => {
  const r = plan(opp({ stage: "discover", probability: 25 }), "propose");
  assert.ok(r.ok);
  assert.equal(r.value.patch.probability, 70);
});

test("an override survives later stage moves", () => {
  // The whole point: a salesperson was asked for a judgement, and the machine
  // must not silently discard it on the next stage change.
  const overridden = opp({ stage: "discover", probability: 35 });
  assert.equal(isProbabilityOverridden(overridden), true);

  const r = plan(overridden, "validate");
  assert.ok(r.ok);
  assert.equal(r.value.patch.probability, undefined, "probability must be left untouched");
  assert.equal(applyProbability(overridden, "validate"), null);
});

test("a terminal stage overrides the override - won is 100, lost is 0", () => {
  const overridden = opp({ stage: "negotiate", probability: 35 });
  assert.equal(applyProbability(overridden, "won"), 100);
  assert.equal(applyProbability(overridden, "lost"), 0);
});

test("a null probability is not an override", () => {
  assert.equal(isProbabilityOverridden({ stage: "qualify", probability: null }), false);
  assert.equal(applyProbability({ stage: "qualify", probability: null }, "discover"), 25);
});

test("setting the probability to exactly the default reads as not overridden", () => {
  // The documented blind spot of deriving the flag instead of storing it.
  assert.equal(isProbabilityOverridden({ stage: "discover", probability: 25 }), false);
});

test("an explicit override is range-checked and refused on terminal stages", () => {
  assert.ok(planProbabilityOverride(opp(), 65).ok);
  for (const bad of [-1, 101, 12.5]) {
    const r = planProbabilityOverride(opp(), bad);
    assert.equal(r.ok, false, String(bad));
    assert.equal(r.ok === false && r.violations[0].code, "probability_range");
  }
  const terminal = planProbabilityOverride(opp({ stage: "won", status: "won", probability: 100 }), 50);
  assert.equal(terminal.ok, false);
  assert.equal(terminal.ok === false && terminal.violations[0].code, "terminal_probability_fixed");
});

test("an unknown stage is rejected before anything else runs", () => {
  const r = planStageChange(opp(), { to: "shipped" as Stage, occurredAt: AT });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "unknown_stage");
});

test("every failure reports all violations it found, not just the first", () => {
  // Regressing out of a terminal stage with no reason breaks two rules.
  const r = plan(opp({ stage: "won", status: "won", probability: 100, closedAt: AT }), "won");
  assert.equal(r.ok, false);
  assert.ok(r.ok === false && r.violations.length >= 2, "expected the no-op and terminal violations together");
});
