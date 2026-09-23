import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRisks, type RiskInput } from "./risk-types";

const base: RiskInput = {
  accountOwner: "王磊",
  chains: [],
  singleThread: null,
  openDeals: [],
  stallDays: 45,
  projects: [],
  renewal: { points: 0, reason: { code: "renewal_not_due" } as never },
};
const byType = (i: RiskInput) => new Map(classifyRisks(i).map((r) => [r.type, r]));

test("five types, always all five, clear when nothing is wrong", () => {
  const r = classifyRisks(base);
  assert.deepEqual(r.map((x) => x.type), ["relationship", "advance", "delivery", "collections", "renewal"]);
  assert.ok(r.every((x) => x.level === "clear"));
});

test("each type names who to go to - the stalled deal's owner, the late project's manager", () => {
  const r = byType({
    ...base,
    openDeals: [
      { name: "仓储", owner: "李娜", daysInStage: 60 },
      { name: "排班", owner: "周强", daysInStage: 90 },
      { name: "新单", owner: "赵敏", daysInStage: 5 },
    ],
    projects: [
      { name: "一期", manager: "陈工", health: "amber", overdueMilestones: 0, overdueRevenue: 0 },
      { name: "二期", manager: "孙工", health: "green", overdueMilestones: 2, overdueRevenue: 1 },
    ],
  });
  assert.equal(r.get("advance")!.level, "risk");
  assert.deepEqual(r.get("advance")!.who, { role: "deal_owner", name: "周强" }, "the longest stall first");
  assert.equal(r.get("delivery")!.level, "risk", "an overdue milestone outranks amber");
  assert.equal(r.get("delivery")!.who.name, "孙工");
  assert.equal(r.get("collections")!.who.name, "孙工");
  assert.equal(r.get("relationship")!.who.name, "王磊");
});

test("relationship: no or unreachable buyer and a single thread are risk; gaps and blockers are watch", () => {
  const watch = byType({ ...base, chains: [{ deal: "d", unreachable: false, hasEconomicBuyer: true, missing: 2, blockers: 1 }] });
  assert.equal(watch.get("relationship")!.level, "watch");
  const risk = byType({ ...base, chains: [{ deal: "d", unreachable: true, hasEconomicBuyer: true, missing: 0, blockers: 0 }] });
  assert.equal(risk.get("relationship")!.level, "risk");
  const thread = byType({ ...base, singleThread: "刘敏" });
  assert.deepEqual(thread.get("relationship")!.findings, [{ code: "single_thread", who: "刘敏" }]);
});

test("a source that could not be read is unknown, never clear", () => {
  const r = byType({ ...base, chains: null, projects: null, renewal: null });
  assert.equal(r.get("relationship")!.level, "unknown");
  assert.equal(r.get("delivery")!.level, "unknown");
  assert.equal(r.get("collections")!.level, "unknown");
  assert.equal(r.get("renewal")!.level, "unknown");
});

test("renewal follows the health factor: -10 or worse is risk, any cost is watch", () => {
  assert.equal(byType({ ...base, renewal: { points: -10, reason: {} as never } }).get("renewal")!.level, "risk");
  assert.equal(byType({ ...base, renewal: { points: -6, reason: {} as never } }).get("renewal")!.level, "watch");
});
