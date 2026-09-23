import { test } from "node:test";
import assert from "node:assert/strict";
import { isReviewable, reviewOutcome, REVIEW_WINDOW_DAYS, type OutcomeFacts } from "./outcome-review";

const DECIDED = new Date("2026-09-01T10:00:00Z");
const at = (days: number) => new Date(DECIDED.getTime() + days * 86_400_000);
const NONE: OutcomeFacts = { stageMoves: [], interactions: [], commitments: [] };

test("only an accepted or executed decision with a date is reviewable", () => {
  assert.equal(isReviewable({ status: "accepted", decidedAt: DECIDED }), true);
  assert.equal(isReviewable({ status: "executed", decidedAt: DECIDED }), true);
  assert.equal(isReviewable({ status: "rejected", decidedAt: DECIDED }), false);
  assert.equal(isReviewable({ status: "proposed", decidedAt: null }), false);
  assert.equal(isReviewable({ status: "accepted", decidedAt: null }), false);
});

test("facts strictly after the decision and inside the window are kept, in time order", () => {
  const r = reviewOutcome(
    { status: "accepted", decidedAt: DECIDED },
    {
      stageMoves: [
        { id: "s_before", opportunityId: "o", fromStage: "qualify", toStage: "discover", occurredAt: at(-1) },
        { id: "s_same", opportunityId: "o", fromStage: "discover", toStage: "validate", occurredAt: DECIDED },
        { id: "s2", opportunityId: "o", fromStage: "propose", toStage: "negotiate", occurredAt: at(9) },
        { id: "s1", opportunityId: "o", fromStage: "validate", toStage: "propose", occurredAt: at(3) },
        { id: "s_after", opportunityId: "o", fromStage: "negotiate", toStage: "won", occurredAt: at(REVIEW_WINDOW_DAYS + 1) },
      ],
      interactions: [{ id: "i1", occurredAt: at(2) }, { id: "i_old", occurredAt: at(-3) }],
      commitments: [],
    },
    at(30),
  );
  assert.deepEqual(r.stageMoves.map((s) => s.id), ["s1", "s2"]);
  assert.deepEqual(r.interactions.map((i) => i.id), ["i1"]);
  assert.equal(r.windowClosed, true);
  assert.equal(r.nothingFollowed, false);
});

test("a commitment kept in the window counts by met_at; one missed counts by its due date", () => {
  const r = reviewOutcome(
    { status: "accepted", decidedAt: DECIDED },
    {
      ...NONE,
      commitments: [
        { id: "met_in", status: "met", dueAt: at(20), metAt: at(5) },
        { id: "met_before", status: "met", dueAt: at(2), metAt: at(-1) },
        { id: "missed_in", status: "missed", dueAt: at(7), metAt: null },
        { id: "missed_later", status: "missed", dueAt: at(40), metAt: null },
        { id: "open", status: "open", dueAt: at(3), metAt: null },
      ],
    },
    at(30),
  );
  assert.deepEqual(r.commitmentsMet.map((c) => c.id), ["met_in"]);
  assert.deepEqual(r.commitmentsMissed.map((c) => c.id), ["missed_in"]);
});

test("nothing following is said explicitly, and a running window is provisional", () => {
  const r = reviewOutcome({ status: "accepted", decidedAt: DECIDED }, NONE, at(5));
  assert.equal(r.nothingFollowed, true);
  assert.equal(r.windowClosed, false);
  assert.deepEqual(r.windowEnd, at(REVIEW_WINDOW_DAYS));
});

// --- the recorded score (incr/0079) ----------------------------------------

test("health before and after are the recorded readings in force, not a replay", () => {
  const decision = { status: "accepted", decidedAt: DECIDED };
  const healthSnapshots = [
    { score: 71, computedAt: at(20) }, // after the window - not the "after"
    { score: 64, computedAt: at(9) },
    { score: 52, computedAt: at(-3) },
  ];
  const closed = reviewOutcome(decision, { ...NONE, healthSnapshots }, at(30));
  assert.deepEqual(closed.health, { before: 52, after: 64 }, "the window's end, not today");
  const running = reviewOutcome(decision, { ...NONE, healthSnapshots }, at(5));
  assert.deepEqual(running.health, { before: 52, after: 52 }, "while it runs, the reading in force now");
});

test("a decision older than the history has no before, and no history read means no line", () => {
  const decision = { status: "accepted", decidedAt: DECIDED };
  const r = reviewOutcome(decision, { ...NONE, healthSnapshots: [{ score: 60, computedAt: at(2) }] }, at(30));
  assert.deepEqual(r.health, { before: null, after: 60 });
  assert.equal(reviewOutcome(decision, NONE, at(30)).health, null);
});
