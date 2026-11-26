import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStrategyNumber, matchesStrategyNumber, strategyNumbers } from "./plan-number";

test("strategy numbers use the Beijing creation day and advance across all reserved codes",()=>{
  const before=new Date("2026-11-25T15:59:59Z"), after=new Date("2026-11-25T16:00:00Z");
  assert.equal(nextStrategyNumber([],before),"STR-20261125-001");
  assert.equal(nextStrategyNumber(["STR-20261125-999","STR-20261126-007","STR-20261126-NO","PLAN-2027-900"],after),"STR-20261126-008");
  assert.equal(nextStrategyNumber(["STR-20261126-999"],after),"STR-20261126-1000");
});
test("old strategy numbers resolve to the original lineage and are reserved by allocation",()=>{
  const plan={planNo:"STR-20261126-002",previousNumbers:["PLAN-2027-Q1-001","STR-20261126-009"]};
  assert.equal(matchesStrategyNumber(plan,"PLAN-2027-Q1-001"),true);
  assert.equal(matchesStrategyNumber(plan,plan.planNo),true);
  assert.equal(matchesStrategyNumber(plan,"PLAN-OTHER"),false);
  assert.equal(nextStrategyNumber(strategyNumbers(plan),new Date("2026-11-26T00:00:00Z")),"STR-20261126-010");
});
