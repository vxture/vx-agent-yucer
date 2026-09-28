import { test } from "node:test";
import assert from "node:assert/strict";
import { NEXT_ACTION_DAYS, nextActionQuestion, verifyNextAction } from "./next-action";

// 下一步最佳动作 (deal batch 8c): one action of ours, soon, for a named goal.

const today = new Date("2026-09-28T09:00:00Z");
const goals = ["经济决策人 30 天内触达", "卡点：卡在决策人王总：60 天没有接触"];
const step = (over: Record<string, unknown> = {}) => ({
  direction: "we_owe",
  statement: "请李经理引荐，约王总面谈",
  dueAt: "2026-10-05",
  forCriterion: goals[0],
  ...over,
});

test("the prompt names the goals verbatim, the open promises, the notes and the one-action shape", () => {
  const q = nextActionQuestion({
    dealName: "华东门店数字化",
    opportunityId: "opp_1",
    stage: "方案论证",
    goals,
    openCommitments: [{ direction: "对方", statement: "给出预算审批结果", dueAt: "2026-09-20" }],
    notes: [{ date: "2026-09-18", text: "王总在外地。" }],
    today: "2026-09-28",
  });
  assert.match(q, /^\[next-action\] Choose the ONE next action/);
  assert.match(q, /  - 卡点：卡在决策人王总/);
  assert.match(q, /对方 by 2026-09-20: 给出预算审批结果/);
  assert.match(q, /2026-09-18: 王总在外地。/);
  assert.match(q, new RegExp(`${NEXT_ACTION_DAYS} days from now`));
  assert.match(q, /"direction": "we_owe"/);
});

test("ours, soon, for a named goal and new: admitted - and only the first", () => {
  assert.equal(verifyNextAction(step(), goals, today, [], 0), true);
  assert.equal(verifyNextAction(step({ forCriterion: goals[1] }), goals, today, [], 0), true, "the stall point is a goal");
  assert.equal(verifyNextAction(step(), goals, today, [], 1), false, "exactly one");
});

test("the buyer's move, a far date, an unnamed goal or a repeated promise is refused", () => {
  assert.equal(verifyNextAction(step({ direction: "they_owe" }), goals, today, [], 0), false);
  assert.equal(verifyNextAction(step({ dueAt: "2026-10-12" }), goals, today, [], 0), true, "day 14 is inside");
  assert.equal(verifyNextAction(step({ dueAt: "2026-10-13" }), goals, today, [], 0), false, "day 15 is a plan, not the next action");
  assert.equal(verifyNextAction(step({ dueAt: "2026-09-27" }), goals, today, [], 0), false, "yesterday");
  assert.equal(verifyNextAction(step({ forCriterion: "推进一下" }), goals, today, [], 0), false);
  assert.equal(verifyNextAction(step(), goals, today, ["请李经理引荐， 约王总面谈"], 0), false, "already promised");
  assert.equal(verifyNextAction(null, goals, today, [], 0), false);
});
