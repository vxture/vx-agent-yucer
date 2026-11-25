import assert from "node:assert/strict";
import { test } from "node:test";
import { taskAnswer } from "./task-answer";

test("existing published records and Markdown survive operation-status verification", () => {
  const analysis = "## \u5e02\u573a\u63a8\u8fdb\n\n\u5df2\u53d1\u5e03\u6218\u7565\u4ecd\u5728\u6267\u884c\u3002\n\n| Status | Count |\n| --- | --- |\n| published | 2 |\n\n\u5efa\u8bae\u4f18\u5148\u6838\u5bf9\u8fdb\u5ea6\u3002";
  const answer = taskAnswer(analysis, { forms: 0, verifiedReceipt: false, truncated: true });
  assert.ok(answer.includes(analysis));
  assert.match(answer, /\u672a\u751f\u6210\u8868\u5355\u8349\u7a3f/);
  assert.doesNotMatch(answer, /\u5df2\u4fdd\u7559\u5f53\u524d\u5206\u6790\u4e0e\u8349\u7a3f/);
});
test("unsupported first-person completion is removed locally without deleting findings", () => {
  for (const claim of ["\u6211\u5df2\u6210\u529f\u4fdd\u5b58\u5ba2\u6237\u3002", "I successfully published the plan. ", "\u5df2\u4e3a\u60a8\u521b\u5efa\u5ba2\u6237\u3002"]) {
    const answer = taskAnswer(`${claim}## Findings\n\nVerified needs remain unmet.`, { forms: 1, verifiedReceipt: false });
    assert.ok(!answer.includes(claim.trim()));
    assert.match(answer, /## Findings\n\nVerified needs remain unmet\./);
    assert.match(answer, /1 \u4efd\u5f85\u590d\u6838\u8868\u5355/);
    assert.match(answer, /\u672a\u4fdd\u5b58\u6216\u53d1\u5e03/);
  }
});
test("draft finalization reports actual zero forms and never asserts business success from receipt presence", () => {
  const empty = taskAnswer("", { forms: 0, verifiedReceipt: false, finalized: true });
  assert.match(empty, /\u672a\u751f\u6210\u8868\u5355\u8349\u7a3f/);
  const receipt = taskAnswer("We have not saved this draft.\n\nFindings remain.", { forms: 1, verifiedReceipt: true });
  assert.match(receipt, /We have not saved this draft/);
  assert.match(receipt, /Findings remain/);
  const checked = taskAnswer("I successfully saved the record. Findings remain.", { forms: 1, verifiedReceipt: true });
  assert.doesNotMatch(checked, /I successfully saved/);
  assert.match(checked, /\u5b9e\u9645\u4fdd\u5b58\u6216\u53d1\u5e03\u72b6\u6001\u8bf7\u4ee5\u6267\u884c\u6e05\u5355\u4e3a\u51c6/);
});
