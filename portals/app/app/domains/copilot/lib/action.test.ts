import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import {
  ACTION_STATUSES,
  DEFAULT_PROPOSAL_TTL_MS,
  assertProposalUnchanged,
  batchRisk,
  isTerminalStatus,
  planBatchDecision,
  planDecision,
  planExecution,
  planExpiry,
  planFailure,
  type ActionStatus,
  type AgentAction,
} from "./action";

const CREATED = new Date("2026-08-01T00:00:00Z");
const NOW = new Date("2026-08-15T10:00:00Z");

function action(over: Partial<AgentAction> = {}): AgentAction {
  return {
    id: "act_1",
    status: "proposed",
    actionType: "advance_stage",
    subjectType: "opportunity",
    subjectId: "opp_1",
    payload: { to: "validate" },
    rationale: "POC passed and the economic buyer is engaged",
    confidence: 78,
    decidedBySub: null,
    decidedAt: null,
    executedAt: null,
    createdAt: CREATED,
    ...over,
  };
}

test("the six statuses match the schema, and four of them are terminal", () => {
  assert.deepEqual([...ACTION_STATUSES], [
    "proposed",
    "accepted",
    "rejected",
    "executed",
    "failed",
    "expired",
  ]);
  assert.deepEqual(ACTION_STATUSES.filter(isTerminalStatus), ["rejected", "executed", "failed", "expired"]);
});

// --- Accepting needs a human ------------------------------------------------

test("accepting records the human and the moment", () => {
  const patch = unwrap(planDecision(action(), { decision: "accept", decidedBySub: "usr_1", decidedAt: NOW }));
  assert.deepEqual(patch, { status: "accepted", decidedBySub: "usr_1", decidedAt: NOW });
});

test("there is no accepted action without a decider", () => {
  // A decision with no decider is exactly the shape of an agent approving itself.
  for (const sub of ["", "   "]) {
    const r = planDecision(action(), { decision: "accept", decidedBySub: sub });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.violations[0].code, "decider_required");
  }
});

test("rejecting also needs a named decider", () => {
  // "Who decided not to act on this" is the question asked after a deal is lost.
  const r = planDecision(action(), { decision: "reject", decidedBySub: "" });
  assert.equal(r.ok === false && r.violations[0].code, "decider_required");

  const okPatch = unwrap(planDecision(action(), { decision: "reject", decidedBySub: "usr_2", decidedAt: NOW }));
  assert.equal(okPatch.status, "rejected");
  assert.equal(okPatch.decidedBySub, "usr_2");
});

test("only a proposed action can be decided", () => {
  for (const status of ["accepted", "rejected", "executed", "failed", "expired"] as ActionStatus[]) {
    const r = planDecision(action({ status }), { decision: "accept", decidedBySub: "usr_1" });
    assert.equal(r.ok, false, status);
    assert.equal(r.ok === false && r.violations[0].code, "not_pending");
  }
});

test("a decider is trimmed, not stored with whitespace", () => {
  const patch = unwrap(planDecision(action(), { decision: "accept", decidedBySub: "  usr_1  " }));
  assert.equal(patch.decidedBySub, "usr_1");
});

// --- Execution --------------------------------------------------------------

test("an accepted action executes", () => {
  const patch = unwrap(
    planExecution(action({ status: "accepted", decidedBySub: "usr_1", decidedAt: NOW }), { executedAt: NOW }),
  );
  assert.deepEqual(patch, { status: "executed", executedAt: NOW });
});

test("a proposed action cannot execute without autopilot", () => {
  const r = planExecution(action());
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "human_decision_required");
});

test("autopilot executes a proposal directly and marks it as unsigned", () => {
  // The record is still written in full; the null decided_by_sub IS the marker
  // that no human signed for it.
  const patch = unwrap(planExecution(action(), { autopilot: true, executedAt: NOW }));
  assert.equal(patch.status, "executed");
  assert.equal(patch.decidedBySub, null);
  assert.equal(patch.decidedAt, null);
  assert.equal(patch.executedAt, NOW);
});

test("an accepted row with no decider refuses to execute", () => {
  // Reaching this state means something wrote around planDecision; executing it
  // would launder an unapproved action.
  const r = planExecution(action({ status: "accepted", decidedBySub: null }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "accepted_without_decider");
});

test("terminal actions cannot be executed, even with autopilot", () => {
  for (const status of ["rejected", "executed", "failed", "expired"] as ActionStatus[]) {
    const r = planExecution(action({ status }), { autopilot: true });
    assert.equal(r.ok, false, status);
    assert.equal(r.ok === false && r.violations[0].code, "not_executable");
  }
});

test("a failed execution is terminal - a retry is a new proposal", () => {
  // Keeping failure terminal preserves the record of the failed attempt instead
  // of overwriting it with the retry's outcome.
  assert.equal(unwrap(planFailure(action({ status: "accepted", decidedBySub: "usr_1" }))).status, "failed");
  assert.equal(planFailure(action({ status: "failed" })).ok, false);
  assert.equal(planFailure(action({ status: "executed" })).ok, false);
});

// --- Expiry -----------------------------------------------------------------

test("an undecided proposal expires rather than vanishing", () => {
  const old = action({ createdAt: new Date(NOW.getTime() - DEFAULT_PROPOSAL_TTL_MS - 1) });
  const patch = unwrap(planExpiry(old, { now: NOW }));
  assert.equal(patch.status, "expired");
  assert.equal(patch.decidedBySub, undefined, "nobody decided - that is the point of this state");
});

test("a proposal inside its window does not expire", () => {
  const r = planExpiry(action({ createdAt: new Date(NOW.getTime() - 1000) }), { now: NOW });
  assert.equal(r.ok === false && r.violations[0].code, "not_yet_expired");
});

test("only a proposed action expires", () => {
  const r = planExpiry(action({ status: "accepted", createdAt: CREATED }), { now: NOW });
  assert.equal(r.ok === false && r.violations[0].code, "not_pending");
});

test("the TTL is configurable per call", () => {
  const a = action({ createdAt: new Date(NOW.getTime() - 60_000) });
  assert.equal(planExpiry(a, { now: NOW, ttlMs: 30_000 }).ok, true);
  assert.equal(planExpiry(a, { now: NOW, ttlMs: 120_000 }).ok, false);
});

// --- Immutability -----------------------------------------------------------

test("the model's own record cannot be edited", () => {
  // An audit must answer "what did the agent recommend AT THE TIME".
  for (const key of ["payload", "rationale", "confidence"]) {
    const r = assertProposalUnchanged({ [key]: "x" });
    assert.equal(r.ok, false, key);
    assert.equal(r.ok === false && r.violations[0].code, "proposal_immutable");
    assert.match(r.ok === false ? r.violations[0].message : "", /new proposal/);
  }
});

test("the decision and execution columns stay writable", () => {
  assert.ok(
    assertProposalUnchanged({ status: "accepted", decidedBySub: "usr_1", decidedAt: NOW, executedAt: NOW }).ok,
  );
});

test("every frozen key in a patch is reported", () => {
  const r = assertProposalUnchanged({ payload: {}, rationale: "revised", confidence: 99 });
  assert.equal(r.ok === false && r.violations.length, 3);
});

// --- Batch adjudication -----------------------------------------------------

test("a batch decision signs every row individually", () => {
  const batch = planBatchDecision([action({ id: "a" }), action({ id: "b" })], {
    decision: "accept",
    decidedBySub: "usr_1",
    decidedAt: NOW,
  });
  assert.equal(batch.accepted.length, 2);
  assert.equal(batch.skipped.length, 0);
  for (const item of batch.accepted) {
    assert.equal(item.patch.decidedBySub, "usr_1", "batching must not weaken accountability");
  }
});

test("one stale proposal does not discard the rest of the batch", () => {
  // The bottleneck this exists to remove is what makes people turn the human
  // step off; failing the whole batch would recreate it.
  const batch = planBatchDecision(
    [action({ id: "a" }), action({ id: "b", status: "expired" }), action({ id: "c" })],
    { decision: "accept", decidedBySub: "usr_1" },
  );
  assert.deepEqual(batch.accepted.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(batch.skipped.map((x) => x.id), ["b"]);
  assert.equal(batch.skipped[0].violations[0].code, "not_pending");
});

test("a batch with no decider accepts nothing at all", () => {
  const batch = planBatchDecision([action({ id: "a" }), action({ id: "b" })], {
    decision: "accept",
    decidedBySub: "",
  });
  assert.equal(batch.accepted.length, 0);
  assert.equal(batch.skipped.length, 2);
});

test("batch risk gives the dialog the numbers it needs to not lie", () => {
  // "Accept 200 low-confidence proposals that each rewrite a deal" must not be
  // presentable as "accept 200 items".
  const r = batchRisk([
    action({ id: "a", confidence: 90, actionType: "advance_stage", subjectType: "opportunity" }),
    action({ id: "b", confidence: 40, actionType: "draft_email", subjectType: "account" }),
    action({ id: "c", confidence: 50, actionType: "advance_stage", subjectType: "opportunity" }),
  ]);
  assert.equal(r.count, 3);
  assert.equal(r.lowConfidenceCount, 2);
  assert.deepEqual(r.actionTypes, ["advance_stage", "draft_email"]);
  assert.deepEqual(r.subjectTypes.sort(), ["account", "opportunity"]);
  assert.equal(r.meanConfidence, 60);
});

test("batch risk handles proposals that reported no confidence", () => {
  const r = batchRisk([action({ confidence: null }), action({ confidence: null })]);
  assert.equal(r.meanConfidence, null);
  // A proposal with no confidence is counted as low: unknown is not high.
  assert.equal(r.lowConfidenceCount, 2);
});

test("batch risk of an empty batch is empty, not a crash", () => {
  const r = batchRisk([]);
  assert.equal(r.count, 0);
  assert.equal(r.meanConfidence, null);
});
