import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysAtStage,
  planSuggestedCategory,
  suggestCategory,
  STALL_DAYS,
  type CategorizableDeal,
} from "./forecast-rule";

const NOW = new Date("2026-08-31T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const D = (over: Partial<CategorizableDeal> = {}): CategorizableDeal => ({
  id: "opp_1",
  stage: "negotiate",
  forecastCategory: "commit",
  probability: null,
  expectedCloseAt: daysAhead(20),
  lastStageChangeAt: daysAgo(5),
  ...over,
});

test("a terminal deal has no judgement to second-guess", () => {
  // Its category is bound to the stage by planCategoryChange, in both
  // directions. A second opinion about a settled fact is noise.
  for (const stage of ["won", "lost"] as const) {
    const v = suggestCategory(D({ stage, forecastCategory: "closed" }), NOW);
    assert.equal(v.kind, "settled");
  }
});

test("the band comes from the probability, and the stage default stands in", () => {
  // negotiate defaults to 90 -> commit; discover to 25 -> pipeline.
  const hot = suggestCategory(D({ stage: "negotiate", probability: null }), NOW);
  assert.equal(hot.kind === "suggested" && hot.category, "commit");
  assert.equal(hot.kind === "suggested" && hot.basis.probabilityIsHuman, false);

  const cold = suggestCategory(
    D({ stage: "discover", probability: null, forecastCategory: "pipeline" }),
    NOW,
  );
  assert.equal(cold.kind === "suggested" && cold.category, "pipeline");
});

test("a rep's own number is used, and the basis says it was theirs", () => {
  // THE SELF-CONTRADICTION CASE, and the reason the probability is used as-is:
  // 35% at validate while filed as commit is the rep disagreeing with
  // themselves, which nothing in the product could say before.
  const v = suggestCategory(
    D({ stage: "validate", probability: 35, forecastCategory: "commit" }),
    NOW,
  );
  assert.equal(v.kind === "suggested" && v.category, "pipeline");
  assert.equal(v.kind === "suggested" && v.agrees, false);
  assert.equal(v.kind === "suggested" && v.basis.probabilityIsHuman, true);
  assert.equal(v.kind === "suggested" && v.basis.probability, 35);
});

test("a probability equal to the stage default does not read as a human's", () => {
  // The same honest blind spot isProbabilityOverridden documents: setting it to
  // exactly the default is indistinguishable from never setting it.
  const v = suggestCategory(D({ stage: "negotiate", probability: 90 }), NOW);
  assert.equal(v.kind === "suggested" && v.basis.probabilityIsHuman, false);
});

test("commit needs a date, because committing IS naming a period", () => {
  const v = suggestCategory(D({ expectedCloseAt: null }), NOW);
  assert.equal(v.kind === "suggested" && v.category, "pipeline");
  assert.deepEqual(v.kind === "suggested" && v.basis.caps, ["no_close_date"]);
  // The probability still says commit - the cap is what moved it, and the
  // basis keeps both halves so the page can say which.
  assert.equal(v.kind === "suggested" && v.basis.band, "commit");
});

test("a close date that came and went drops the deal to pipeline", () => {
  // The most common way a forecast stays at commit forever: the date slips,
  // the category does not, and the number keeps being reported.
  const v = suggestCategory(D({ expectedCloseAt: daysAgo(9) }), NOW);
  assert.equal(v.kind === "suggested" && v.category, "pipeline");
  assert.deepEqual(v.kind === "suggested" && v.basis.caps, ["close_date_passed"]);
});

test("a stall costs one band, not the whole ladder", () => {
  // Long negotiations are ordinary here. A rule that dropped every slow deal
  // to the bottom would be ignored within a week.
  const v = suggestCategory(D({ lastStageChangeAt: daysAgo(STALL_DAYS + 1) }), NOW);
  assert.equal(v.kind === "suggested" && v.category, "best_case");
  assert.deepEqual(v.kind === "suggested" && v.basis.caps, ["stalled"]);
});

test("a stall exactly at the threshold is not yet a stall", () => {
  const v = suggestCategory(D({ lastStageChangeAt: daysAgo(STALL_DAYS) }), NOW);
  assert.equal(v.kind === "suggested" && v.category, "commit");
  assert.deepEqual(v.kind === "suggested" && v.basis.caps, []);
});

test("a stall never lifts a deal, and never falls below pipeline", () => {
  // demote() floors at pipeline; there is no fourth band below it, and
  // `closed` is deliberately not on this scale - a downgrade must never walk a
  // live deal into "closed", which would be a rule inventing an outcome.
  const v = suggestCategory(
    D({
      stage: "qualify",
      probability: null,
      forecastCategory: "pipeline",
      lastStageChangeAt: daysAgo(400),
    }),
    NOW,
  );
  assert.equal(v.kind === "suggested" && v.category, "pipeline");
  assert.equal(v.kind === "suggested" && v.agrees, true);
});

test("caps compound: a dateless deal that also stalled is still only pipeline", () => {
  const v = suggestCategory(
    D({ expectedCloseAt: null, lastStageChangeAt: daysAgo(STALL_DAYS + 30) }),
    NOW,
  );
  assert.equal(v.kind === "suggested" && v.category, "pipeline");
  assert.deepEqual(v.kind === "suggested" && v.basis.caps, ["no_close_date", "stalled"]);
});

test("an empty journal is not a stall", () => {
  // No stage events means nothing is known about how long it has sat, and
  // "unknown" must not read as "a long time" - that would downgrade every deal
  // whose history predates the journal.
  const v = suggestCategory(D({ lastStageChangeAt: null }), NOW);
  assert.equal(v.kind === "suggested" && v.category, "commit");
  assert.deepEqual(v.kind === "suggested" && v.basis.caps, []);
  assert.equal(daysAtStage({ lastStageChangeAt: null }, NOW), null);
});

test("agreement is computed, never stored", () => {
  const deal = D({ forecastCategory: "commit" });
  assert.equal(suggestCategory(deal, NOW).kind === "suggested", true);
  const agreeing = suggestCategory(deal, NOW);
  assert.equal(agreeing.kind === "suggested" && agreeing.agrees, true);
  // Change nothing but the person's own filing and the same call flips.
  const disagreeing = suggestCategory({ ...deal, forecastCategory: "pipeline" }, NOW);
  assert.equal(disagreeing.kind === "suggested" && disagreeing.agrees, false);
});

test("there is nothing to apply when the rule already agrees", () => {
  const deal = D({ forecastCategory: "commit" });
  const plan = planSuggestedCategory(deal, suggestCategory(deal, NOW));
  assert.equal(plan.ok, false);
  assert.equal(plan.ok ? "" : plan.violations[0].code, "category_already_agrees");
});

test("there is nothing to apply on a settled deal", () => {
  const deal = D({ stage: "won", forecastCategory: "closed" });
  const plan = planSuggestedCategory(deal, suggestCategory(deal, NOW));
  assert.equal(plan.ok, false);
  assert.equal(plan.ok ? "" : plan.violations[0].code, "category_settled");
});

test("a real disagreement plans the suggested band", () => {
  const deal = D({ expectedCloseAt: null, forecastCategory: "commit" });
  const plan = planSuggestedCategory(deal, suggestCategory(deal, NOW));
  assert.equal(plan.ok && plan.value.forecastCategory, "pipeline");
});

test("days at stage counts down from the last move", () => {
  assert.equal(daysAtStage({ lastStageChangeAt: daysAgo(64) }, NOW), 64);
});
