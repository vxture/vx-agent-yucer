import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDealMeetingPack } from "./deal-meeting-pack";

// 商机会前包 (deal batch 11a) - the rule half.

const now = new Date("2026-10-01T00:00:00Z");
const at = (d: number) => new Date(now.getTime() + d * 86_400_000);

test("the goal is the current stage's first criterion not met - unjudgeable counts - else the next stage's first", () => {
  const base = { attendees: [], commitments: [], now };
  const current = { stage: "方案验证", checks: [{ name: "经济决策人 30 天内触达", status: "met" as const }, { name: "决策流程已写明", status: "unknown" as const }, { name: "x", status: "unmet" as const }] };
  assert.deepEqual(buildDealMeetingPack({ ...base, current, next: null }).goal, { criterion: "决策流程已写明", stage: "方案验证", from: "current" });
  const allMet = { stage: "方案验证", checks: [{ name: "a", status: "met" as const }] };
  assert.deepEqual(buildDealMeetingPack({ ...base, current: allMet, next: { stage: "方案报价", criteria: ["明细已定价"] } }).goal, {
    criterion: "明细已定价",
    stage: "方案报价",
    from: "next",
  });
  // Nothing defined: no goal is invented.
  assert.equal(buildDealMeetingPack({ ...base, current: { stage: "s", checks: [] }, next: { stage: "t", criteria: [] } }).goal, null);
});

test("attendees carry days since last contact; only open promises, soonest (most overdue) first", () => {
  const pack = buildDealMeetingPack({
    attendees: [
      { contactId: "c1", name: "许明", title: "研发中心副总", role: "economic", stance: "supporter", lastContactAt: at(-20) },
      { contactId: "c2", name: "秦岚", title: null, role: null, stance: null, lastContactAt: null },
    ],
    commitments: [
      { id: "p1", direction: "we_owe", status: "open", statement: "提交方案", dueAt: at(5) },
      { id: "p2", direction: "they_owe", status: "open", statement: "给出试点名单", dueAt: at(-3) },
      { id: "p3", direction: "they_owe", status: "done", statement: "已完成", dueAt: at(-10) },
    ],
    current: null,
    next: null,
    now,
  });
  assert.deepEqual(pack.attendees.map((a) => [a.name, a.lastDays]), [["许明", 20], ["秦岚", null]]);
  assert.deepEqual(pack.promises.map((p) => [p.id, p.daysToDue]), [["p2", -3], ["p1", 5]]);
});
