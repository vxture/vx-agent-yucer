import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_MAX_STEPS, planQuestion, verifyPlanStep } from "./plan-draft";

const TODAY = new Date("2026-09-25T08:00:00Z");
const goals = ["签约流程已写明", "成交日未过"];
const step = { direction: "we_owe", statement: "约王磊确认签约流程", dueAt: "2026-09-30", forCriterion: "签约流程已写明" };

test("a dated step toward a named goal passes", () => {
  assert.equal(verifyPlanStep(step, goals, TODAY, [], 0), true);
  assert.equal(verifyPlanStep({ ...step, dueAt: "2026-09-25" }, goals, TODAY, [], 0), true, "today counts");
});

test("no goal, no side, no date, the past, beyond the horizon, a repeat, or one too many is dropped", () => {
  assert.equal(verifyPlanStep({ ...step, forCriterion: "别的" }, goals, TODAY, [], 0), false);
  assert.equal(verifyPlanStep({ ...step, direction: "both" }, goals, TODAY, [], 0), false);
  assert.equal(verifyPlanStep({ ...step, dueAt: "下周" }, goals, TODAY, [], 0), false);
  assert.equal(verifyPlanStep({ ...step, dueAt: "2026-09-24" }, goals, TODAY, [], 0), false);
  assert.equal(verifyPlanStep({ ...step, dueAt: "2027-06-01" }, goals, TODAY, [], 0), false);
  assert.equal(verifyPlanStep(step, goals, TODAY, ["约王磊 确认签约流程"], 0), false);
  assert.equal(verifyPlanStep(step, goals, TODAY, [], PLAN_MAX_STEPS), false);
});

test("the question carries the goals, the open promises and today", () => {
  const q = planQuestion({
    dealName: "干线运输调度平台",
    opportunityId: "opp_6",
    stageName: "报价投标",
    goals,
    openCommitments: [{ direction: "they_owe", statement: "反馈方案", dueAt: "2026-09-26" }],
    today: "2026-09-25",
  });
  assert.match(q, /签约流程已写明/);
  assert.match(q, /they_owe by 2026-09-26: 反馈方案/);
  assert.match(q, /Today is 2026-09-25/);
  assert.match(q, /"plan_step"/);
});
