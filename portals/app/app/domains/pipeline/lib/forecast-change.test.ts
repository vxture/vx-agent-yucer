import { test } from "node:test";
import assert from "node:assert/strict";
import { explainChange, stateAt, type ChangeDeal } from "./forecast-change";
import type { ClaimEventRecord } from "./claims";

// 快照间变化 (deal batch 9c): each deal's state at the snapshot is rebuilt from
// the claim log, and the parts must add up to the total - what they cannot
// explain is reported, never spread.

const T = new Date("2026-10-05T00:00:00Z");
const IN_Q4 = new Date("2026-11-15T00:00:00Z");
const WS = { scopeType: "workspace" as const, territoryId: null, ownerSub: null };

function deal(over: Partial<ChangeDeal> & { id: string }): ChangeDeal {
  return {
    name: over.id,
    status: "open",
    forecastCategory: "commit",
    amount: 100,
    expectedCloseAt: IN_Q4,
    closedAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    territoryId: null,
    ownerSub: "usr_a",
    ...over,
  };
}

let n = 0;
function claim(opportunityId: string, field: ClaimEventRecord["field"], fromValue: string | null, toValue: string | null, at = "2026-10-10T00:00:00Z"): ClaimEventRecord {
  n += 1;
  return { id: `c${n}`, opportunityId, field, fromValue, toValue, source: "manual", reason: null, actorSub: "usr_a", occurredAt: new Date(at) };
}

test("the state at T takes each field's first change after T, and today's value otherwise", () => {
  const d = deal({ id: "a", amount: 300, forecastCategory: "commit" });
  const claims = [
    claim("a", "amount", "100.00", "200.00", "2026-10-06T00:00:00Z"),
    claim("a", "amount", "200.00", "300.00", "2026-10-07T00:00:00Z"),
    // Before T: not a change since the snapshot.
    claim("a", "forecast_category", "pipeline", "commit", "2026-10-01T00:00:00Z"),
  ];
  const s = stateAt(d, claims, T);
  assert.equal(s?.amount, 100);
  assert.equal(s?.category, "commit");
  // Created after T: did not exist.
  assert.equal(stateAt(deal({ id: "b", createdAt: new Date("2026-10-06T00:00:00Z") }), [], T), null);
  // Won after T: was open then.
  assert.equal(stateAt(deal({ id: "w", status: "won", closedAt: new Date("2026-10-09T00:00:00Z") }), [], T)?.open, true);
});

test("every kind of move, and the parts add up to the total", () => {
  const deals = [
    // added: raised into commit after T
    deal({ id: "add", amount: 50 }),
    // resized: 100 -> 130
    deal({ id: "res", amount: 130 }),
    // pushed: close moved into next year
    deal({ id: "push", amount: 80, expectedCloseAt: new Date("2027-01-20T00:00:00Z") }),
    // won: left commit for closed
    deal({ id: "won", amount: 60, status: "won", forecastCategory: "closed", closedAt: new Date("2026-10-12T00:00:00Z") }),
    // removed: lowered to pipeline
    deal({ id: "rm", amount: 40, forecastCategory: "pipeline" }),
    // untouched
    deal({ id: "same", amount: 70 }),
  ];
  const claims = [
    claim("add", "forecast_category", "best_case", "commit"),
    claim("res", "amount", "100.00", "130.00"),
    claim("push", "expected_close_at", "2026-11-15", "2027-01-20"),
    claim("won", "forecast_category", "commit", "closed"),
    claim("rm", "forecast_category", "commit", "pipeline"),
  ];
  // At T commit held res 100 + push 80 + won 60 + rm 40 + same 70 = 350;
  // today add 50 + res 130 + same 70 = 250.
  const r = explainChange({ category: "commit", period: "2026Q4", scope: WS, since: T, snapshotTotal: 350, currentTotal: 250, deals, claims })!;
  assert.equal(r.total, -100);
  assert.deepEqual(r.byKind, { added: 50, removed: -40, resized: 30, pushed: -80, won: -60 });
  assert.equal(r.unexplained, 0);
  assert.deepEqual(r.deals.map((d) => d.opportunityId).sort(), ["add", "push", "res", "rm", "won"]);
});

test("what the log cannot explain is reported with its amount, not spread", () => {
  // The snapshot said 500, today's rule says 300, and no deal moved since T:
  // the 200 is a change from before the log, or a scope move.
  const r = explainChange({ category: "commit", period: "2026Q4", scope: WS, since: T, snapshotTotal: 500, currentTotal: 300, deals: [deal({ id: "x", amount: 300 })], claims: [] })!;
  assert.equal(r.total, -200);
  assert.equal(r.deals.length, 0);
  assert.equal(r.unexplained, -200);
});

test("a deal created after the snapshot counts as added; an unbounded period gives nothing", () => {
  const fresh = deal({ id: "new", amount: 90, createdAt: new Date("2026-10-08T00:00:00Z") });
  const r = explainChange({ category: "commit", period: "2026Q4", scope: WS, since: T, snapshotTotal: 0, currentTotal: 90, deals: [fresh], claims: [] })!;
  assert.deepEqual(r.deals, [{ opportunityId: "new", name: "new", kind: "added", delta: 90 }]);
  assert.equal(r.unexplained, 0);
  assert.equal(explainChange({ category: "commit", period: "someday", scope: WS, since: T, snapshotTotal: 0, currentTotal: 0, deals: [], claims: [] }), null);
});
