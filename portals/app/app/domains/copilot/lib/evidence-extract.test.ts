import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commitmentSeenKey,
  evidenceQuestion,
  evidenceSeenKey,
  roleSeenKey,
  verifyCommitmentProposal,
  verifyEvidenceProposal,
  verifyRoleProposal,
} from "./evidence-extract";

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

// --- 4c: roles, stances, promises -----------------------------------------------

const meeting = { id: "int_2", text: "刘敏说她会全力推动这个项目；王总答应周五前把试点门店名单发过来。" };
const roster = [
  { id: "ct_liu", name: "刘敏", title: "运营经理", buyingRole: "user", stance: "supporter" },
  { id: "ct_wang", name: "王磊", title: "首席财务官", buyingRole: "economic", stance: null },
];

test("a role or stance change for someone on the roster, quoted, passes; the same state or a stranger does not", () => {
  const stance = { personId: "ct_liu", buyingRole: "user", stance: "champion", quote: "她会全力推动这个项目", interactionId: "int_2" };
  assert.equal(verifyRoleProposal(stance, meeting, roster, new Set()), true);
  assert.equal(verifyRoleProposal({ ...stance, stance: "supporter" }, meeting, roster, new Set()), false, "nothing changes");
  assert.equal(verifyRoleProposal({ ...stance, personId: "ct_zhao" }, meeting, roster, new Set()), false, "not on the roster");
  assert.equal(verifyRoleProposal({ ...stance, buyingRole: "blocker" }, meeting, roster, new Set()), false, "not a role one picks");
  assert.equal(verifyRoleProposal({ ...stance, quote: "她是反对者" }, meeting, roster, new Set()), false, "invented quote");
  assert.equal(verifyRoleProposal(stance, meeting, roster, new Set([roleSeenKey("ct_liu", "她会全力推动这个项目")])), false, "already seen");
});

test("a dated new promise, quoted, passes; no date, a known promise or a seen quote does not", () => {
  const promise = { direction: "they_owe", statement: "发来试点门店名单", dueAt: "2026-09-26", quote: "周五前把试点门店名单发过来", interactionId: "int_2" };
  assert.equal(verifyCommitmentProposal(promise, meeting, [], new Set()), true);
  assert.equal(verifyCommitmentProposal({ ...promise, dueAt: "周五" }, meeting, [], new Set()), false);
  assert.equal(verifyCommitmentProposal({ ...promise, direction: "maybe" }, meeting, [], new Set()), false);
  assert.equal(verifyCommitmentProposal(promise, meeting, ["发来 试点门店名单"], new Set()), false, "already open");
  assert.equal(verifyCommitmentProposal(promise, meeting, [], new Set([commitmentSeenKey("周五前把试点门店名单发过来")])), false);
});

test("the question lists the roster with ids and the open promises, and dates the note", () => {
  const q = evidenceQuestion({
    dealName: "d",
    opportunityId: "opp_1",
    note: { ...meeting, occurredOn: "2026-09-21" },
    current: {},
    roster,
    openCommitments: ["提交分期付款方案"],
  });
  assert.match(q, /ct_liu: 刘敏 \(运营经理\) - role user, stance supporter/);
  assert.match(q, /"set_buying_role"/);
  assert.match(q, /"add_commitment"/);
  assert.match(q, /"提交分期付款方案"/);
  assert.match(q, /written on 2026-09-21/);
});
