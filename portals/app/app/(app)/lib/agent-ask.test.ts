import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_MAX_CHARS, askHref, askOverBy } from "./agent-ask";
import { captureFeedback } from "./capture-feedback";

test("a question becomes a /copilot URL; a deal outranks a customer", () => {
  assert.equal(askHref("下一步怎么推", { opportunityId: "opp_1" }), "/copilot?opportunity=opp_1&ask=%E4%B8%8B%E4%B8%80%E6%AD%A5%E6%80%8E%E4%B9%88%E6%8E%A8");
  assert.equal(askHref("hi", { accountId: "acc_1" }), "/copilot?account=acc_1&ask=hi");
  assert.equal(askHref("hi", { opportunityId: "opp_1", accountId: "acc_1" }), "/copilot?opportunity=opp_1&ask=hi", "the deal implies its customer");
  assert.equal(askHref("hi"), "/copilot?ask=hi", "a page about neither still carries the question");
});

test("characters that would break a URL survive the round trip", () => {
  const q = "预算 & 时间? 100%=满意 #1 \"引号\"";
  const href = askHref(q, { accountId: "acc 1&x" })!;
  const params = new URL(href, "http://x").searchParams;
  assert.equal(params.get("ask"), q);
  assert.equal(params.get("account"), "acc 1&x");
});

test("nothing to send is null, not an empty question", () => {
  for (const blank of ["", "   ", "\n\t "]) assert.equal(askHref(blank, { accountId: "a" }), null);
});

test("the limit is the copilot page's own: exactly at it passes, one over is refused and counted", () => {
  const fits = "问".repeat(ASK_MAX_CHARS);
  assert.notEqual(askHref(fits), null);
  assert.equal(askOverBy(fits), 0);
  const over = "问".repeat(ASK_MAX_CHARS + 7);
  assert.equal(askHref(over), null, "never silently cut");
  assert.equal(askOverBy(over), 7);
  assert.equal(askOverBy(`  ${fits}  `), 0, "surrounding space is not part of the question");
});

const ERRORS = { denied: "没有权限", date_invalid: "日期不对" };

test("a saved note is confirmed and the box is emptied", () => {
  assert.deepEqual(captureFeedback({ ok: true }, ERRORS, "已记下"), { tone: "success", title: "已记下", clear: true });
});

test("a refused note says why, and STAYS in the box", () => {
  const f = captureFeedback({ ok: false, error: "date_invalid" }, ERRORS, "已记下");
  assert.deepEqual(f, { tone: "danger", title: "日期不对", clear: false });
});

test("a code the dictionary does not know gets the generic sentence, never the raw code", () => {
  const f = captureFeedback({ ok: false, error: "something_new" }, ERRORS, "已记下");
  assert.equal(f.title, "没有权限");
  assert.ok(!f.title.includes("something_new"));
  assert.equal(f.clear, false);
  assert.equal(captureFeedback({ ok: false }, ERRORS, "已记下").title, "没有权限");
});
