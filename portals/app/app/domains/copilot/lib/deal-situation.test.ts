import { test } from "node:test";
import assert from "node:assert/strict";
import { admitSituation, situationQuestion, type SituationInput } from "./deal-situation";

// 局势简报 (deal batch 8b): the rule has judged; the model explains. What it
// writes is admitted only when its figures, citations and quotes are real.

const input: SituationInput = {
  dealName: "华东门店数字化",
  stage: "方案论证",
  currency: "CNY",
  amount: 850_000,
  budget: 800_000,
  expectedCloseAt: "2026-11-30",
  score: 58,
  dimensions: [
    { key: "value", label: "需求价值", score: 100, indicators: [{ label: "痛点", verdict: "稳", gap: null }] },
    {
      key: "consensus",
      label: "买方共识",
      score: 40,
      indicators: [{ label: "经济决策人", verdict: "风险", gap: "约到经济决策人" }],
    },
    { key: "competition", label: "竞争位置", score: null, indicators: [{ label: "对手", verdict: "未知", gap: "摸清有哪些对手" }] },
  ],
  stall: { days: 52, line: 45, holder: "卡在决策人王总：60 天没有接触，比停在本阶段还久" },
  promises: [{ direction: "对方", statement: "给出预算审批结果", dueAt: "2026-09-20" }],
  notes: [
    { id: "n1", date: "2026-09-18", text: "李经理说预算要等十月的预算会，王总最近在外地。" },
    { id: "n2", date: "2026-08-30", text: "技术评估通过，演示反馈不错。" },
  ],
};

const answer = (o: unknown) => JSON.stringify(o);

test("the prompt carries the rule's levels as final, the stall holder and the notes by id", () => {
  const q = situationQuestion(input);
  assert.match(q, /^\[deal-brief\] /);
  assert.match(q, /\[consensus\] 买方共识: 40\/100/);
  assert.match(q, /经济决策人: 风险 - 约到经济决策人/);
  assert.match(q, /\[competition\] 竞争位置: unknown/);
  assert.match(q, /STALLED: 52 days at this stage, past the 45-day line\. The rule says: 卡在决策人王总/);
  assert.match(q, /\[n1\] 2026-09-18: 李经理说预算要等十月的预算会/);
  assert.match(q, /never change it/);
});

test("a clean answer is kept whole, risks in the rule's order", () => {
  const s = admitSituation(
    answer({
      summary: [
        { text: "方案已通过技术评估，但经济决策人仍未接触。", notes: ["n2"] },
        { text: "预算 80 万要等十月的预算会。", notes: ["n1"] },
        { text: "本阶段已停 52 天。", notes: [] },
      ],
      risks: [
        { dimension: "competition", why: "没有任何记录提到对手。", change: "在下次会上问清还有谁在谈。", notes: [] },
        { dimension: "consensus", why: "王总从未出现在近期跟进里。", change: "请李经理引荐王总。", notes: ["n1"] },
      ],
      stall: { why: "客户在等十月的预算会，决策人不在本地。", noteId: "n1", quote: "预算要等十月的预算会" },
    }),
    input,
  );
  assert.ok(s);
  assert.equal(s.summary.length, 3);
  assert.deepEqual(s.summary[1], { text: "预算 80 万要等十月的预算会。", noteIds: ["n1"] });
  assert.deepEqual(s.risks.map((r) => r.dimension), ["consensus", "competition"]);
  assert.deepEqual(s.stall, { why: "客户在等十月的预算会，决策人不在本地。", quote: { noteId: "n1", text: "预算要等十月的预算会" } });
  assert.equal(s.dropped, 0);
});

test("an invented figure, an unknown citation, a full dimension and a paraphrased quote are each refused", () => {
  const s = admitSituation(
    answer({
      summary: [
        { text: "客户愿意出 90 万。", notes: ["n1"] },
        { text: "技术评估已过。", notes: ["n9"] },
        { text: "决策人未接触。", notes: [] },
        { text: "一", notes: [] },
        { text: "二", notes: [] },
      ],
      risks: [
        { dimension: "value", why: "痛点明确。", change: "", notes: [] },
        { dimension: "consensus", why: "王总没见过。", change: "让价到 70 万换引荐。", notes: [] },
        { dimension: "nonsense", why: "x", change: "", notes: [] },
        { dimension: "competition", why: "不知道对手。", change: "", notes: [] },
        { dimension: "competition", why: "再说一次。", change: "", notes: [] },
      ],
      stall: { why: "在等预算会。", noteId: "n1", quote: "要等预算会" },
    }),
    input,
  );
  assert.ok(s);
  // 90 万 is no figure of the rule's; n9 is no note; after three the rest wait.
  assert.deepEqual(s.summary.map((x) => x.text), ["决策人未接触。", "一", "二"]);
  // value is full (100); 70 万 invented; nonsense unknown; the second competition a repeat.
  assert.deepEqual(s.risks.map((r) => r.dimension), ["competition"]);
  // The why stands; the quote is not in the note word for word.
  assert.deepEqual(s.stall, { why: "在等预算会。", quote: null });
  assert.equal(s.dropped, 2 + 4 + 1);
});

test("a stall diagnosis for a deal the rule does not call stalled is not shown", () => {
  const moving = { ...input, stall: null };
  const s = admitSituation(answer({ summary: [{ text: "推进正常。", notes: [] }], risks: [], stall: { why: "在等预算会。" } }), moving);
  assert.ok(s);
  assert.equal(s.stall, null);
  assert.equal(s.dropped, 1);
});

test("not the JSON asked for, or nothing surviving, is no situation", () => {
  assert.equal(admitSituation("这单还行。", input), null);
  assert.equal(admitSituation("{not json", input), null);
  assert.equal(admitSituation(answer({ summary: [{ text: "能签 120 万。", notes: [] }], risks: [], stall: null }), input), null);
  assert.equal(admitSituation(answer({ summary: "three sentences", risks: {}, stall: "x" }), input), null);
});
