import { test } from "node:test";
import assert from "node:assert/strict";
import { admitPriceAdvice, allowedFigures, figuresConsistent, priceQuestion, type PriceAdviceInput } from "./price-advice";

// 价格参谋 (deal batch 10b): the model writes, the rule admits. Numbers must be
// the concession sheet's; quotes must be the buyer's exact words.

const input: PriceAdviceInput = {
  dealName: "实验室数据对接",
  currency: "CNY",
  lines: [
    { product: "零售中台基础平台", quantity: 1, listPrice: 800_000, floorPrice: 600_000, unitPrice: 520_000, belowFloor: 80_000 },
    { product: "经营分析模块", quantity: 1, listPrice: 400_000, floorPrice: 300_000, unitPrice: 330_000, belowFloor: 0 },
  ],
  listAmount: 1_200_000,
  concession: 350_000,
  rate: 350_000 / 1_200_000,
  notes: [
    { id: "n1", date: "2026-09-20", text: "采购说友商报价低 15%，预算只有 85 万，希望年底前签。" },
    { id: "n2", date: "2026-09-10", text: "技术评估已经通过。" },
  ],
};

test("the prompt carries the sheet's own numbers and the notes by id", () => {
  const q = priceQuestion(input);
  assert.match(q, /list 800000, floor 600000, quoted 520000, 80000 below the floor/);
  assert.match(q, /\[n1\] 2026-09-20: 采购说友商报价低 15%/);
  assert.match(q, /29.2%/);
});

test("a figure is admitted only when it is on the sheet; dates and counts are not prices", () => {
  const allowed = allowedFigures(input);
  assert.equal(figuresConsistent("底价 600,000，报价 52 万，低于底价 80000。", allowed), true);
  assert.equal(figuresConsistent("整单让价 29.2%。", allowed), true);
  assert.equal(figuresConsistent("可以让到 45 万。", allowed), false, "45 万 is on no line");
  assert.equal(figuresConsistent("再降 8%。", allowed), false);
  assert.equal(figuresConsistent("要求签 3 年合同，2026 年底前付首期。", allowed), true);
  assert.equal(figuresConsistent("报价改成 480000。", allowed), false);
});

test("admission drops invented numbers and unquotable quotes, and keeps the rest", () => {
  const answer = `Here is my advice: ${JSON.stringify({
    strategy: "守住 52 万，不要再往下走。对方提到预算，可以把实施放到下一期。建议让到 45 万成交。",
    trades: ["要求三年服务合同", "再降 5% 换预付", "要求年底前签约并预付首期"],
    quotes: [
      { noteId: "n1", text: "友商报价低 15%" },
      { noteId: "n1", text: "预算只有 80 万" },
      { noteId: "n9", text: "技术评估已经通过" },
    ],
  })}`;
  const r = admitPriceAdvice(answer, input);
  assert.ok(r);
  assert.equal(r.strategy, "守住 52 万，不要再往下走。对方提到预算，可以把实施放到下一期。");
  assert.deepEqual(r.trades, ["要求三年服务合同", "要求年底前签约并预付首期"]);
  assert.deepEqual(r.quotes, [{ noteId: "n1", text: "友商报价低 15%" }]);
  // One sentence, one trade, two quotes refused.
  assert.equal(r.dropped, 4);
});

test("not the JSON asked for, or nothing left after admission, is no advice", () => {
  assert.equal(admitPriceAdvice("我建议批准。", input), null);
  assert.equal(admitPriceAdvice(JSON.stringify({ strategy: "让到 45 万。", trades: ["再降 8%"] }), input), null);
});
