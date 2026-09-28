import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewDraft } from "./review-draft";

// 复盘底稿 (deal batch 12) - the rule's four sections, from the deal's own records.

const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("the four sections: where it slipped, who did not deliver, who was missing, how many rounds", () => {
  const r = reviewDraft({
    closedAt: d("2026-09-30"),
    claims: [
      { field: "amount", fromValue: "900000.00", toValue: "1000000.00", occurredAt: d("2026-07-01") }, // better - ignored
      { field: "expected_close_at", fromValue: "2026-08-31", toValue: "2026-09-30", occurredAt: d("2026-08-10") },
      { field: "forecast_category", fromValue: "commit", toValue: "best_case", occurredAt: d("2026-08-20") },
      { field: "amount", fromValue: "1000000.00", toValue: "930000.00", occurredAt: d("2026-09-05") },
    ],
    stageEvents: [
      { toStage: "discover", occurredAt: d("2026-06-01") },
      { toStage: "validate", occurredAt: d("2026-08-01") },
      { toStage: "propose", occurredAt: d("2026-09-01") },
    ],
    stageName: (c) => ({ discover: "需求挖掘", validate: "方案验证", propose: "方案报价" })[c] ?? c,
    commitments: [
      { id: "p1", direction: "they_owe", statement: "给出试点名单", dueAt: d("2026-08-15"), status: "missed", metAt: null },
      { id: "p2", direction: "we_owe", statement: "提交方案", dueAt: d("2026-08-20"), status: "met", metAt: d("2026-08-25") },
      { id: "p3", direction: "we_owe", statement: "按时的", dueAt: d("2026-08-20"), status: "met", metAt: d("2026-08-19") },
      { id: "p4", direction: "they_owe", statement: "预算确认", dueAt: d("2026-09-20"), status: "open", metAt: null },
    ],
    people: [
      { name: "许明", role: "economic", lastContactAt: d("2026-08-01") },
      { name: "秦岚", role: "coach", lastContactAt: d("2026-09-25") },
    ],
    approvals: [{ product: "零售中台基础平台", unitPrice: 520_000, floorPrice: 600_000, approvedAt: d("2026-09-06") }],
  });
  // First slip 08-10, while in 方案验证; the early increase is not a slip.
  assert.equal(r.slip.firstAt, "2026-08-10");
  assert.equal(r.slip.stageThen, "方案验证");
  assert.deepEqual(r.slip.events.map((e) => e.field), ["expected_close_at", "forecast_category", "amount"]);
  assert.deepEqual(r.promises.map((p) => [p.id, p.state]), [["p1", "missed"], ["p2", "late"], ["p4", "open"]]);
  assert.deepEqual(r.coverage.missingRoles, ["technical"]);
  assert.deepEqual(r.coverage.cold, [{ name: "许明", role: "economic", lastDays: 60 }]);
  assert.equal(r.concessions.rounds, 1);
  assert.deepEqual(r.concessions.signatures, [{ at: "2026-09-06", product: "零售中台基础平台", belowFloor: 80_000 }]);
  assert.deepEqual(r.concessions.cuts.map((c) => c.to), ["930000.00"]);
});

test("a clean deal has empty sections, not invented ones", () => {
  const r = reviewDraft({ closedAt: d("2026-09-30"), claims: [], stageEvents: [], stageName: (c) => c, commitments: [], people: [], approvals: [] });
  assert.equal(r.slip.firstAt, null);
  assert.equal(r.promises.length, 0);
  assert.deepEqual(r.coverage.missingRoles, ["economic", "technical", "coach"]);
  assert.equal(r.concessions.rounds, 0);
});
