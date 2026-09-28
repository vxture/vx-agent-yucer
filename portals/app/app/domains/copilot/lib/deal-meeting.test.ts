import { test } from "node:test";
import assert from "node:assert/strict";
import { admitMeetingAdvice, meetingQuestion, type DealMeetingInput } from "./deal-meeting";

// 商机会前包 (deal batch 11a) - the 参谋's half, admitted.

const input: DealMeetingInput = {
  dealName: "实验室数据对接",
  stage: "方案验证",
  pack: {
    attendees: [
      { contactId: "c1", name: "许明", title: "研发中心副总", role: "economic", stance: "supporter", lastDays: 20 },
      { contactId: "c2", name: "秦岚", title: null, role: "coach", stance: "champion", lastDays: 5 },
    ],
    promises: [{ id: "p1", direction: "they_owe", statement: "给出试点名单", dueAt: "2026-09-28", daysToDue: -3 }],
    goal: { criterion: "决策流程已写明", stage: "方案验证", from: "current" },
  },
  notes: [{ id: "n1", date: "2026-09-19", text: "秦主任组织了技术交流" }],
  rivals: ["华策软件"],
  amounts: [930_000, 520_000],
};

test("the prompt carries the goal, the attendees by id and the open promises", () => {
  const q = meetingQuestion(input);
  assert.match(q, /get "决策流程已写明" \(this stage's exit criterion\)/);
  assert.match(q, /\[c1\] 许明, 研发中心副总, economic, supporter, 20/);
  assert.match(q, /they_owe 2026-09-28: 给出试点名单/);
  assert.match(q, /Rivals on record: 华策软件/);
});

test("tracks only for chosen attendees, once each; lines with a foreign figure dropped", () => {
  const r = admitMeetingAdvice(
    JSON.stringify({
      agenda: ["回顾试点名单", "确认决策流程", "报价 93 万的构成", "给出 80 万的优惠"],
      tracks: [
        { contact: "c1", text: "请许总说明采购委员会怎么投票" },
        { contact: "c1", text: "第二条" },
        { contact: "c9", text: "不在场的人" },
      ],
      objections: ["价格高于华策软件：强调 LIMS 对接不改原系统"],
      questions: ["谁最终签字？"],
    }),
    input,
  );
  assert.ok(r);
  assert.deepEqual(r.agenda, ["回顾试点名单", "确认决策流程", "报价 93 万的构成"]);
  assert.deepEqual(r.tracks, [{ contactId: "c1", text: "请许总说明采购委员会怎么投票" }]);
  assert.equal(r.objections.length, 1);
  assert.equal(r.questions.length, 1);
  assert.equal(r.dropped, 3);
});

test("not the JSON asked for is no advice", () => {
  assert.equal(admitMeetingAdvice("好的，准备如下……", input), null);
});
