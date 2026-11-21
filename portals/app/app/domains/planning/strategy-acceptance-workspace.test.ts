import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { emptyContent, closedSlice, type PlanRevision, type SalesPlan } from "./plan-model";
import { acceptanceSources, acceptanceSummary, groupAcceptances, proposeAcceptance, type AcceptanceSource } from "./strategy-acceptance-workspace";
import { validatePlanningWorkflow } from "./plan-workflow";
import type { StrategyAcceptance } from "./strategy-handoff";

function source(metric: "revenue" | "channels" | "reference_cases" = "revenue", currency: string | null = "CNY"): AcceptanceSource {
  return { id: id(), name: "Retail", period: "2026", versionNo: 1, ownerSub: "owner", expectations: [{id:id(), metric, amount: metric === "revenue" ? "1000.10" : "3", currency: metric === "revenue" ? currency : null, criterion: "Signed"}] };
}
function content() { const c = emptyContent(2026, [], "CNY"); c.targets[0]!.target = "5000"; return c; }
function acceptance(p = source(), c = content()): StrategyAcceptance { return proposeAcceptance(c, p, p.expectations![0]!, "fallback", id()); }

test("selectable sources require publication, annual overlap and supported standard metrics", () => {
  const p = source();
  const fake = { ...p, expectations: [{ ...p.expectations![0]!, metric: "custom" }] } as unknown as AcceptanceSource;
  assert.deepEqual(acceptanceSources([p, {...p, id:id(), versionNo:null}, {...p, id:id(), period:"2027"}, fake],2026).map(x=>x.id),[p.id]);
});
test("summary uses accepted amounts, exact minor units and independent currency and metric groups", () => {
  const a=acceptance(), b=acceptance(), usd=acceptance(source("revenue","USD")), count=acceptance(source("channels"));
  a.amount="0.10"; b.amount="0.20"; usd.amount="50"; count.amount="2";
  assert.deepEqual(acceptanceSummary([a,b,usd,count]).map(x=>[x.metric,x.currency,x.amount]),[["revenue","CNY","0.30"],["revenue","USD","50.00"],["channels",null,"2"]]);
  const huge={...a,amount:"9999999999999.99"};
  assert.equal(acceptanceSummary([huge,huge,huge])[0]!.amount,"29999999999999.97");
});
test("regional summary includes only local allocations and distinguishes absence from a recorded zero", () => {
  const a=acceptance(), b=acceptance(), count=acceptance(source("channels"));
  a.allocations=[{key:id(),regionId:"east",period:"2026Q1",amount:"0",ownerSub:null},{key:id(),regionId:"west",period:"2026Q1",amount:"90",ownerSub:null}];
  const result=acceptanceSummary([a,b,count],"east");
  assert.equal(result[0]!.amount,"0.00"); assert.equal(result[0]!.pending,1);
  assert.equal(result[1]!.pending,1);
});
test("group order follows strategic roster, retaining missing historic sources", () => {
  const a=source(),b=source(),old=source();const rows=[acceptance(b),acceptance(old),acceptance(a)];
  assert.deepEqual(groupAcceptances(rows,[a,b]).map(g=>g[0]!.strategyId),[a.id,b.id,old.id]);
  const channels={...source("channels").expectations![0]!}, cases={...source("reference_cases").expectations![0]!};
  a.expectations!.push(channels,cases);
  const revenue=acceptance(a), channel=proposeAcceptance(content(),a,channels,null,id()), reference=proposeAcceptance(content(),a,cases,null,id());
  assert.deepEqual(groupAcceptances([channel,reference,revenue],[a])[0]!.map(x=>x.expectation.metric),["revenue","channels","reference_cases"]);
});
test("proposal uses remaining company capacity and preserves the existing UUID, source and regional allocations", () => {
  const c=content(),p=source();c.targets[0]!.target="100";
  const x=acceptance(p,c);assert.equal(x.amount,"100.00");
  x.amount="50";x.allocations=[{key:id(),regionId:"east",period:"2026Q1",amount:"50",ownerSub:"owner"}];c.strategyAcceptances=[x];
  const next=proposeAcceptance(c,{...p,id:id(),lineageId:p.id,versionNo:2},p.expectations![0]!,null,id());
  assert.deepEqual(next,x);next.allocations[0]!.amount="1";assert.equal(x.allocations[0]!.amount,"50");
  const other=acceptance(source(),c);assert.equal(other.amount,"50.00");
});
test("multi-year count proposals stay integral and use only this year's execution window", () => {
  const p={...source("channels"),period:"2026-01-01/2027-12-31"};
  assert.equal(acceptance(p).amount,"1");
  assert.equal(acceptance({...p,ownerSub:null}).ownerSub,"fallback");
});
test("company cancellation removes a whole acceptance but cannot change retained regional content", () => {
  const c=content(), a=acceptance(), b=acceptance();
  for(const x of [a,b])x.allocations=[{key:id(),regionId:"east",period:"2026Q1",amount:"100",ownerSub:"owner"}];
  c.strategyAcceptances=[a,b];
  const base={id:id(),state:"sealed",content:c} as PlanRevision;const plan={revisions:[base]} as SalesPlan;
  const next={...structuredClone(c),releaseScope:"company" as const};next.strategyAcceptances=[structuredClone(b)];
  validatePlanningWorkflow(plan,next,base.id);
  assert.equal(c.strategyAcceptances.length,2);
  next.strategyAcceptances[0]!.allocations[0]!.amount="1";
  assert.throws(()=>validatePlanningWorkflow(plan,next,base.id),/regional_draft_required/);
  next.strategyAcceptances=[];next.capacityNote="Allowed company note";validatePlanningWorkflow(plan,next,base.id);
  next.actions=[{key:id()} as never];assert.throws(()=>validatePlanningWorkflow(plan,next,base.id),/regional_draft_required/);
  const cancelled={...c,strategyAcceptances:[b]};assert.notDeepEqual(closedSlice(c,"2026Q1"),closedSlice(cancelled,"2026Q1"));
});
