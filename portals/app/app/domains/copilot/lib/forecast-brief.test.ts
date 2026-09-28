import { test } from "node:test";
import assert from "node:assert/strict";
import { admitForecastBrief, forecastBriefQuestion, type ForecastBriefInput } from "./forecast-brief";

// 预测会简报 (deal batch 9e): the board's numbers, the model's words - admitted.

const input: ForecastBriefInput = {
  period: "2026Q4",
  totals: { commit: 16_740_000, bestCase: 14_810_000, pipeline: 27_800_000, closed: 0 },
  call: 15_000_000,
  change: {
    since: "2026-09-28",
    commit: { total: -900_000, byKind: { added: 1_800_000, pushed: -2_400_000, resized: -300_000 }, unexplained: 0 },
    bestCase: { total: 0, byKind: {}, unexplained: 0 },
  },
  unverified: [
    {
      category: "commit",
      total: 16_740_000,
      unverified: 14_340_000,
      deals: [{ id: "opp_1", name: "北京客户中心", ownerSub: "usr_a", amount: 2_510_000, lacks: ["明细已定价"] }],
    },
  ],
  owners: [
    { sub: "usr_a", name: "南希仁", commit: 8_000_000, bestCase: 5_000_000 },
    { sub: "usr_b", name: "张三", commit: 8_740_000, bestCase: 9_810_000 },
  ],
};

test("the prompt carries the board's figures, the unverified deals by id and the owners by sub", () => {
  const q = forecastBriefQuestion(input);
  assert.match(q, /commit 16740000, best case 14810000/);
  assert.match(q, /the manager's latest call 15000000/);
  assert.match(q, /pushed -2400000/);
  assert.match(q, /\[opp_1\] 北京客户中心, owner usr_a, 2510000: 明细已定价/);
  assert.match(q, /\[usr_b\] 张三/);
});

test("admission keeps the board's numbers and known owners and deals, drops the rest", () => {
  const answer = JSON.stringify({
    summary: "承诺 1674 万，较上次少了 90 万，主要是推出本期 240 万。其中 1434 万未经证实。预计最终能到 1600 万。另一句。",
    questions: [
      { owner: "usr_a", deal: "opp_1", question: "北京客户中心 251 万的明细什么时候定价？" },
      { owner: "usr_a", deal: "", question: "推出本期的 240 万里有哪些能拉回来？" },
      { owner: "usr_a", deal: "", question: "第三个问题" },
      { owner: "usr_c", deal: "", question: "不在名单上的人" },
      { owner: "usr_b", deal: "opp_9", question: "不在清单上的单" },
      { owner: "usr_b", deal: "", question: "能不能再加 300 万承诺？" },
      { owner: "usr_b", deal: "", question: "你的 874 万承诺里最没把握的是哪一单？" },
    ],
  });
  const r = admitForecastBrief(answer, input);
  assert.ok(r);
  // "1600 万" is on no line of the board, so that sentence goes.
  assert.deepEqual(r.summary, ["承诺 1674 万，较上次少了 90 万，主要是推出本期 240 万。", "其中 1434 万未经证实。", "另一句。"]);
  assert.deepEqual(r.questions.map((q) => [q.ownerSub, q.dealId]), [["usr_a", "opp_1"], ["usr_a", null], ["usr_b", null]]);
  assert.equal(r.questions[2]!.text, "你的 874 万承诺里最没把握的是哪一单？");
  assert.equal(r.dropped, 5);
});

test("not the JSON asked for is no brief", () => {
  assert.equal(admitForecastBrief("本季形势良好。", input), null);
});
