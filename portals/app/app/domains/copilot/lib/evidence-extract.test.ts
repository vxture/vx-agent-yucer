import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceQuestion, evidenceSeenKey, verifyEvidenceProposal } from "./evidence-extract";

const note = { id: "int_1", text: "王总说采购委员会三个人投票，\n最后他有一票否决；预算要等10月内部预算会。" };
const ok = { slot: "decision_process", statement: "采购委员会三人投票，王总一票否决", quote: "采购委员会三个人投票， 最后他有一票否决", interactionId: "int_1" };

test("a proposal the note supports passes - the quote may differ in line breaks", () => {
  assert.equal(verifyEvidenceProposal(ok, note, {}, new Set()), true);
});

test("an invented quote, another note, an unknown slot or an empty statement is dropped", () => {
  assert.equal(verifyEvidenceProposal({ ...ok, quote: "CFO 拍板" }, note, {}, new Set()), false);
  assert.equal(verifyEvidenceProposal({ ...ok, interactionId: "int_2" }, note, {}, new Set()), false);
  assert.equal(verifyEvidenceProposal({ ...ok, slot: "budget" }, note, {}, new Set()), false);
  assert.equal(verifyEvidenceProposal({ ...ok, statement: "  " }, note, {}, new Set()), false);
  assert.equal(verifyEvidenceProposal(null, note, {}, new Set()), false);
});

test("nothing new is nothing: the slot already says it, or a person already saw the same point", () => {
  assert.equal(verifyEvidenceProposal(ok, note, { decision_process: ok.statement }, new Set()), false);
  const seen = new Set([evidenceSeenKey("decision_process", "采购委员会三个人投票，  最后他有一票否决")]);
  assert.equal(verifyEvidenceProposal(ok, note, {}, seen), false);
});

test("the question names the deal, the note, every slot's current state and the payload shape", () => {
  const q = evidenceQuestion({ dealName: "全国门店数字化", opportunityId: "opp_1", note, current: { pain: "盘点停业半天" } });
  assert.match(q, /全国门店数字化/);
  assert.match(q, /Note int_1/);
  assert.match(q, /pain: .*Currently: "盘点停业半天"/);
  assert.match(q, /metrics: .*\(not written\)/);
  assert.match(q, /"record_evidence"/);
  assert.match(q, /subject_id "opp_1"/);
});
