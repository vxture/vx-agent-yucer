import { test } from "node:test";
import assert from "node:assert/strict";
import { admitReviewNarrative, reviewQuestion, type ReviewNarrativeInput } from "./review-narrative";

// 复盘底稿 - the 参谋's half (deal batch 12b), admitted.

const input: ReviewNarrativeInput = {
  dealName: "实验室数据对接",
  outcome: "lost",
  draft: {
    slip: { firstAt: "2026-08-10", stageThen: "方案验证", events: [{ at: "2026-09-05", field: "amount", from: "1000000.00", to: "930000.00" }] },
    promises: [{ id: "p1", direction: "they_owe", statement: "给出试点名单", dueAt: "2026-08-15", state: "missed" }],
    coverage: { missingRoles: ["technical"], cold: [{ name: "许明", role: "economic", lastDays: 60 }] },
    concessions: { rounds: 1, signatures: [{ at: "2026-09-06", product: "零售中台基础平台", belowFloor: 80_000 }], cuts: [] },
  },
  reasons: [
    { id: "wlx_2", name: "价格" },
    { id: "wlx_5", name: "决策人失联" },
  ],
};

test("the prompt carries the four sections and the reasons that fit the outcome", () => {
  const q = reviewQuestion(input);
  assert.match(q, /from 2026-08-10 in 方案验证/);
  assert.match(q, /2026-08-15 they_owe: 给出试点名单 \(missed\)/);
  assert.match(q, /许明 \(economic, 60\)/);
  assert.match(q, /零售中台基础平台: 80000 below the floor/);
  assert.match(q, /wlx_5: 决策人失联/);
});

test("figures only from the draft; a reason only from the offered list", () => {
  const r = admitReviewNarrative(
    JSON.stringify({
      narrative: "8 月 10 日起在方案验证阶段开始滑。经济决策人许明关单前 60 天没再出现。金额从 100 万降到 93 万。我们其实只差 20 万。",
      reason: "wlx_5",
    }),
    input,
  );
  assert.ok(r);
  assert.deepEqual(r.narrative, ["8 月 10 日起在方案验证阶段开始滑。", "经济决策人许明关单前 60 天没再出现。", "金额从 100 万降到 93 万。"]);
  assert.equal(r.reasonId, "wlx_5");
  assert.equal(r.dropped, 1);
  const invented = admitReviewNarrative(JSON.stringify({ narrative: "输在价格上。", reason: "wlx_99" }), input);
  assert.equal(invented?.reasonId, null);
  assert.equal(invented?.dropped, 1);
});
