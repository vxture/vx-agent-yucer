import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { emptyContent, type CustomerBudget, type CustomerContribution, type PlanAction } from "./plan-model";
import type { StrategyAcceptance } from "./strategy-handoff";
import { commitmentRevenue, commitmentSupport } from "./commitment-summary";

function acceptance(id: string, value: string, currency = "CNY"): StrategyAcceptance {
  return {key:id,strategyId:id,lineageId:id,version:1,name:id,period:"Y2027",expectation:{id,metric:"revenue",amount:"500",currency,criterion:""},amount:value,ownerSub:null,note:"",allocations:[]};
}
function content() { const c = emptyContent(2027, [], "CNY"); c.targets[0]!.target = "1000"; return c; }

test("strategic shares reconcile exactly inside annual commitments, not across allocation axes", () => {
  const c=content(); c.strategyAcceptances=[acceptance("a","0.10"),acceptance("b","0.20")];
  c.targets.push({...c.targets[0]!,key:randomUUID(),period:"2027Q1",target:"1000"});
  c.targets.push({...c.targets[0]!,key:randomUUID(),scope:"territory:east",target:"1000"});
  const [row]=commitmentRevenue(c);
  assert.equal(row!.accepted,"0.30"); assert.equal(row!.remaining,"999.70"); assert.equal(row!.annual,"1000");
  c.strategyAcceptances[0]!.amount="1200";
  assert.equal(commitmentRevenue(c)[0]!.excess,"200.20"); assert.equal(commitmentRevenue(c)[0]!.remaining,null);
});
test("missing, zero, incomplete input and separate currencies do not become a false fulfilled budget", () => {
  const c=content(); c.targets[0]!.target="0"; c.strategyAcceptances=[acceptance("a","0"),acceptance("b","50","USD")];
  const [cny,usd]=commitmentRevenue(c);
  assert.equal(cny!.remaining,"0.00"); assert.equal(usd!.annual,null); assert.equal(usd!.remaining,null);
  c.targets[0]!.target=""; assert.equal(commitmentRevenue(c)[0]!.invalid,true); assert.equal(commitmentRevenue(c)[0]!.annual,null);
  assert.equal(commitmentRevenue(c)[0]!.accepted,"0.00");
  c.targets[0]!.target=null; assert.equal(commitmentRevenue(c)[0]!.annual,null);
});
test("regional summaries retain pending allocations and never borrow another region's share", () => {
  const c=content(); c.targets.push({...c.targets[0]!,key:randomUUID(),scope:"territory:east",target:"500"});
  c.strategyAcceptances=[acceptance("a","100"),acceptance("b","200")];
  c.strategyAcceptances[0]!.allocations=[{key:"x",regionId:"east",period:"2027Q1",amount:"0",ownerSub:null},{key:"y",regionId:"west",period:"2027Q1",amount:"100",ownerSub:null}];
  const [row]=commitmentRevenue(c,"east"); assert.equal(row!.accepted,"0.00"); assert.equal(row!.pending,1); assert.equal(row!.remaining,null);
});
test("customer identity is reused across support records; matching names never merge independent registrations", () => {
  const c=content();
  c.budgets=[{key:"b1",accountId:"one",name:"Same name"},{key:"b2",accountId:"two",name:"Same name"},{key:"unassigned",accountId:"unassigned",name:"Same name"}] as CustomerBudget[];
  c.contributions=[{key:"c1",budgetKey:"b1",regionId:"east"},{key:"c2",budgetKey:"b1",regionId:"west"},{key:"c3",budgetKey:"b2",regionId:"east"}] as CustomerContribution[];
  c.actions=[{key:"a1",accountId:"one",regionId:"east",ownerSub:"owner",due:"2027-01-01"},{key:"a2",accountId:"one",regionId:"east",ownerSub:null,due:""}] as PlanAction[];
  const row=commitmentSupport(c); assert.equal(row.customers,2); assert.equal(row.actions,2); assert.equal(row.datedActions,1);
  assert.equal(commitmentSupport(c,"west").customers,1);
});
test("special targets are a count of commitments, not a sum of distinct channel or case objects", () => {
  const c=content(); c.strategyAcceptances=[{...acceptance("a","5"),expectation:{id:"a",metric:"channels",amount:"5",currency:null,criterion:""}},{...acceptance("b","5"),expectation:{id:"b",metric:"channels",amount:"5",currency:null,criterion:""}}];
  assert.equal(commitmentSupport(c).specialTargets,2); assert.equal(commitmentRevenue(c)[0]!.accepted,"0.00");
});
test("support targets distinguish an unfinished edit from an explicit zero", () => {
  const c = content();
  c.targets.push({ ...c.targets[0]!, key: "new", metric: "new_logo", currency: null, target: "" });
  c.targets.push({ ...c.targets[0]!, key: "pipeline", metric: "pipeline", target: "invalid" });
  assert.equal(commitmentSupport(c).newCustomers, null);
  assert.equal(commitmentSupport(c).pipeline?.target, null);
  c.targets.find(t => t.key === "new")!.target = "0";
  c.targets.find(t => t.key === "pipeline")!.target = "0";
  assert.equal(commitmentSupport(c).newCustomers, "0");
  assert.equal(commitmentSupport(c).pipeline?.target, "0");
  c.targets.push({ ...c.targets[0]!, key: "pipeline-usd", metric: "pipeline", currency: "USD", target: "50" });
  assert.equal(commitmentSupport(c).pipeline, null);
});
