import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import {
  BASE_SCORE,
  REQUIRED_ROLES,
  analyzeChain,
  deriveHealth,
  type ContactNode,
  type HealthInput,
  type RelationEdge,
} from "./health";

const NOW = new Date("2026-08-15T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function health(over: Partial<HealthInput> = {}) {
  return unwrap(
    deriveHealth({
      openOpportunities: [],
      lastInteractionAt: daysAgo(5),
      projectHealth: [],
      overdueRevenueCount: 0,
      now: NOW,
      ...over,
    }),
  );
}

// --- The score --------------------------------------------------------------

test("the score always lands in 0-100", () => {
  const worst = health({
    openOpportunities: [],
    lastInteractionAt: null,
    projectHealth: ["red", "red"],
    overdueRevenueCount: 5,
  });
  const best = health({
    openOpportunities: [{ stage: "negotiate" }, { stage: "propose" }, { stage: "validate" }],
    lastInteractionAt: daysAgo(1),
    projectHealth: ["green"],
  });
  assert.ok(worst.score >= 0 && worst.score <= 100);
  assert.ok(best.score >= 0 && best.score <= 100);
  assert.ok(best.score > worst.score);
});

test("an account with no data sits at the neutral base, neither healthy nor sick", () => {
  const r = health({ lastInteractionAt: daysAgo(5) });
  // Base, minus the no-pipeline penalty, plus the recency credit.
  assert.equal(r.score, BASE_SCORE - 15 + 15);
});

test("later-stage pipeline is worth more than more pipeline", () => {
  // A large deal stuck at qualify says less about the relationship than a small
  // one at negotiate.
  const deep = health({ openOpportunities: [{ stage: "negotiate" }] });
  const wide = health({ openOpportunities: [{ stage: "qualify" }, { stage: "qualify" }] });
  assert.ok(deep.score > wide.score);
});

test("silence costs points, and prolonged silence costs more", () => {
  const fresh = health({ lastInteractionAt: daysAgo(3) });
  const stale = health({ lastInteractionAt: daysAgo(45) });
  const cold = health({ lastInteractionAt: daysAgo(200) });
  const never = health({ lastInteractionAt: null });
  assert.ok(fresh.score > stale.score);
  assert.ok(stale.score > cold.score);
  assert.ok(never.score < fresh.score);
});

test("a red delivery outweighs a healthy pipeline", () => {
  // An unhappy delivery predicts a lost renewal and is invisible to anyone
  // looking only at the pipeline.
  const r = health({
    openOpportunities: [{ stage: "negotiate" }],
    lastInteractionAt: daysAgo(2),
    projectHealth: ["red"],
  });
  assert.equal(r.primaryConcern?.factor, "delivery");
});

test("overdue money is weighted heavily and caps out", () => {
  const one = health({ overdueRevenueCount: 1 });
  const two = health({ overdueRevenueCount: 2 });
  const many = health({ overdueRevenueCount: 20 });
  assert.ok(one.score > two.score);
  assert.equal(two.score, many.score, "the collections penalty is capped");
});

test("the score explains itself - a red account can be argued with", () => {
  const r = health({
    openOpportunities: [{ stage: "propose" }],
    lastInteractionAt: daysAgo(120),
    projectHealth: ["amber"],
    overdueRevenueCount: 1,
  });
  const factors = r.contributions.map((c) => c.factor).sort();
  assert.deepEqual(factors, ["collections", "delivery", "pipeline", "recency"]);
  for (const c of r.contributions) assert.ok(c.detail.length > 0, `${c.factor} has no detail`);
});

test("the primary concern is the single worst contributor, or null when nothing is wrong", () => {
  const good = health({ openOpportunities: [{ stage: "negotiate" }], lastInteractionAt: daysAgo(1) });
  assert.equal(good.primaryConcern, null);

  const bad = health({ lastInteractionAt: null, overdueRevenueCount: 3 });
  assert.equal(bad.primaryConcern?.factor, "collections");
});

test("terminal opportunities do not count as open pipeline", () => {
  const r = health({ openOpportunities: [{ stage: "won" }, { stage: "lost" }] });
  assert.equal(r.contributions.find((c) => c.factor === "pipeline")?.detail, "no open opportunities");
});

test("green projects help, and no projects at all is neutral", () => {
  const withGreen = health({ projectHealth: ["green", "green"] });
  const none = health({ projectHealth: [] });
  assert.ok(withGreen.score > none.score);
  assert.equal(none.contributions.some((c) => c.factor === "delivery"), false);
});

// --- Decision chain ---------------------------------------------------------

const c = (id: string, role: ContactNode["decisionRole"], over: Partial<ContactNode> = {}): ContactNode => ({
  id,
  decisionRole: role,
  influence: 50,
  status: "active",
  ...over,
});

const edge = (from: string, to: string, type: RelationEdge["relationType"] = "reports_to"): RelationEdge => ({
  fromContactId: from,
  toContactId: to,
  relationType: type,
});

test("missing roles are reported against what a deal actually needs", () => {
  const r = analyzeChain([c("1", "user")], []);
  assert.deepEqual(r.missing, [...REQUIRED_ROLES]);
  // `user` and `unknown` are not gaps.
  assert.deepEqual(r.covered, ["user"]);
});

test("a departed contact is not coverage", () => {
  // Counting them is how a deal believes it has a champion it lost months ago.
  const r = analyzeChain([c("1", "coach", { status: "left" }), c("2", "economic")], []);
  assert.ok(r.missing.includes("coach"));
  assert.equal(r.coaches.length, 0);
});

test("blockers are surfaced separately from missing roles", () => {
  const r = analyzeChain([c("1", "blocker"), c("2", "economic"), c("3", "technical"), c("4", "coach")], [
    edge("4", "2"),
  ]);
  assert.deepEqual(r.missing, []);
  assert.equal(r.blockers.length, 1);
  assert.equal(r.blockers[0].id, "1");
});

test("coaches are ordered by influence, so the copilot can name the best one", () => {
  const r = analyzeChain(
    [c("weak", "coach", { influence: 20 }), c("strong", "coach", { influence: 90 }), c("eb", "economic")],
    [edge("strong", "eb")],
  );
  assert.deepEqual(r.coaches.map((x) => x.id), ["strong", "weak"]);
});

test("having an economic buyer on file is not the same as being able to reach them", () => {
  // Only the second fact advances a deal.
  const unreachable = analyzeChain([c("coach", "coach"), c("eb", "economic")], []);
  assert.equal(unreachable.economicBuyerUnreachable, true);

  const reachable = analyzeChain([c("coach", "coach"), c("eb", "economic")], [edge("coach", "eb")]);
  assert.equal(reachable.economicBuyerUnreachable, false);
});

test("an introduction travels in either direction along a relationship", () => {
  const r = analyzeChain([c("coach", "coach"), c("eb", "economic")], [edge("eb", "coach")]);
  assert.equal(r.economicBuyerUnreachable, false);
});

test("a path may run through intermediaries", () => {
  const r = analyzeChain(
    [c("coach", "coach"), c("mid", "technical"), c("eb", "economic")],
    [edge("coach", "mid"), edge("mid", "eb")],
  );
  assert.equal(r.economicBuyerUnreachable, false);
});

test("a path does not run through someone opposed to the deal", () => {
  const r = analyzeChain(
    [c("coach", "coach"), c("hostile", "blocker"), c("eb", "economic")],
    [edge("coach", "hostile", "opposed_to"), edge("hostile", "eb", "opposed_to")],
  );
  assert.equal(r.economicBuyerUnreachable, true);
});

test("a path does not run through a departed contact", () => {
  const r = analyzeChain(
    [c("coach", "coach"), c("gone", "technical", { status: "left" }), c("eb", "economic")],
    [edge("coach", "gone"), edge("gone", "eb")],
  );
  assert.equal(r.economicBuyerUnreachable, true);
});

test("no coach at all means the buyer is unreachable", () => {
  const r = analyzeChain([c("eb", "economic")], []);
  assert.equal(r.economicBuyerUnreachable, true);
});

test("a relationship cycle does not hang the walk", () => {
  const r = analyzeChain(
    [c("a", "coach"), c("b", "technical"), c("eb", "economic")],
    [edge("a", "b"), edge("b", "a"), edge("a", "a", "peer_of")],
  );
  assert.equal(r.economicBuyerUnreachable, true);
});

test("an empty account analyses cleanly rather than crashing", () => {
  const r = analyzeChain([], []);
  assert.deepEqual(r.covered, []);
  assert.deepEqual(r.missing, [...REQUIRED_ROLES]);
  assert.equal(r.economicBuyerUnreachable, true);
});
