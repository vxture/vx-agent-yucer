import { test } from "node:test";
import assert from "node:assert/strict";
import { displayRationale } from "./proposal-rationale";
import { RATIONALE_TEXT } from "./messages";
import { UPSELL_ACTION_TYPE } from "../../domains/delivery/upsell-sweep";
import { SWEEP_ACTION_TYPE } from "../../domains/account/commitment-sweep";

// TD-010: a rule sweep's stored English rationale never reaches a Chinese page.

const CJK = /[一-鿿]/;

test("an upsell proposal reads in the dictionary's words, facts intact", () => {
  const text = displayRationale(
    {
      actionType: UPSELL_ACTION_TYPE,
      payload: { productId: "wms", productName: "仓储管理", owners: 7, peers: 12, accountId: "a" },
      rationale: "Not yet running 仓储管理. 7 of 12 same-industry customers with an in-force contract run it.",
    },
    RATIONALE_TEXT,
  );
  assert.ok(text && !text.includes("Not yet running"));
  assert.match(text, /仓储管理/);
  assert.match(text, /12 家客户里，7 家在用/);
});

test("an overdue-commitment chase reads in the dictionary's words, both directions", () => {
  for (const direction of ["they_owe", "we_owe"] as const) {
    const text = displayRationale(
      {
        actionType: SWEEP_ACTION_TYPE,
        payload: { direction, statement: "给出预算批复", dueAt: "2026-09-01T00:00:00.000Z", daysOverdue: 22 },
        rationale: "They promised: ...",
      },
      RATIONALE_TEXT,
    );
    assert.ok(text && CJK.test(text) && !/promised/.test(text));
    assert.match(text, /2026-09-01 到期，已过 22 天/);
  }
});

test("a model's own rationale passes through untouched", () => {
  assert.equal(
    displayRationale({ actionType: "advance_stage", payload: {}, rationale: "验收报告已签字" }, RATIONALE_TEXT),
    "验收报告已签字",
  );
});

test("a malformed sweep payload falls back to the stored text rather than to nothing", () => {
  assert.equal(
    displayRationale({ actionType: UPSELL_ACTION_TYPE, payload: { productId: "wms" }, rationale: "stored" }, RATIONALE_TEXT),
    "stored",
  );
});
