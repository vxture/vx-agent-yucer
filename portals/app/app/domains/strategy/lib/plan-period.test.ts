import {test} from "node:test";
import assert from "node:assert/strict";
import {parseStrategyPeriod, strategyPeriodWindow, strategyPeriodRangeLabel} from "./plan-period";
import {analysePlans} from "./plan-advice";

test("annual, quarterly and legacy half-year keys resolve to exact calendar dates",()=>{
  assert.deepEqual(parseStrategyPeriod("2026"),{kind:"annual",year:2026,startOn:"2026-01-01",endOn:"2026-12-31"});
  assert.deepEqual(parseStrategyPeriod("2024Q1"),{kind:"quarter",year:2024,quarter:1,startOn:"2024-01-01",endOn:"2024-03-31"});
  assert.deepEqual(parseStrategyPeriod("2026-Q1"),parseStrategyPeriod("2026Q1"));
  assert.equal(parseStrategyPeriod("2026H2")?.endOn,"2026-12-31");
  assert.equal(parseStrategyPeriod("2026H3"),null);
});
test("custom windows accept cross-year and same-day ranges, validate leap dates, and include the full final day",()=>{
  const key="2026-11-15/2027-02-28";
  assert.equal(strategyPeriodRangeLabel(key),"2026-11-15 ~ 2027-02-28");
  assert.equal(strategyPeriodWindow(key)?.start.toISOString(),"2026-11-15T00:00:00.000Z");
  assert.equal(strategyPeriodWindow(key)?.end.toISOString(),"2027-02-28T23:59:59.999Z");
  assert.ok(parseStrategyPeriod("2024-02-29/2024-02-29"));
  for(const invalid of ["FY26","Retail launch","2026-11-01/","2026-02-29/2026-03-01","2026-02-30/2026-03-01","2027-01-01/2026-12-31","1899","10000","2026-Q0"])assert.equal(parseStrategyPeriod(invalid),null,invalid);
});
test("custom execution dates drive calendar checks while publication and lifecycle stay separate",()=>{
  const plan={id:"p",planNo:"P1",name:"Pilot",period:"2026-11-15/2027-02-28",objective:"Test",status:"active" as const};
  const run=(now:string)=>analysePlans({plans:[plan],campaignCounts:new Map([["p",1]]),segmentCounts:new Map([["p",1]]),now:new Date(now)});
  assert.equal(run("2027-02-28T23:59:59.999Z").some(x=>x.kind==="period_over_not_closed"),false);
  assert.equal(run("2027-03-01T00:00:00Z").some(x=>x.kind==="period_over_not_closed"),true);
  assert.equal(plan.status,"active");
});

test("date windows are primary; full years/quarters receive canonical keys and arbitrary ranges stay custom",async()=>{
  const {strategyPeriodForDates}=await import("./plan-period");
  assert.equal(strategyPeriodForDates("2028-01-01","2028-12-31"),"2028");
  assert.equal(strategyPeriodForDates("2028-04-01","2028-06-30"),"2028-Q2");
  assert.equal(strategyPeriodForDates("2027-11-15","2028-02-29"),"2027-11-15/2028-02-29");
  assert.equal(strategyPeriodForDates("2027-11-15","2027-01-01"),null);
  assert.equal(strategyPeriodForDates("","2028-02-29"),null);
});
