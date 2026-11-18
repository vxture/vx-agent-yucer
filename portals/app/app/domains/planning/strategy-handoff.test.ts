import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { closedSlice, emptyContent, validateContent, minor, type SalesPlan, type PlanRevision } from "./plan-model";
import { validateStrategyAcceptances, verifyStrategyAcceptance, type StrategyAcceptance } from "./strategy-handoff";
import { allocateStrategicTarget } from "./strategy-autofill";
import { strategicActual } from "./strategic-actual";
import { validateStrategicResult, type StrategicResult } from "./strategic-results";
import { validExpectations } from "../strategy/lib/expectations";
import { captureStrategyPublication, InMemoryStrategyStore, type PlanRecord, type CampaignRecord } from "../strategy/store";
import { validatePlanningWorkflow } from "./plan-workflow";
import { comparePlanContents } from "./plan-state";
import type { OpportunityRecord } from "../pipeline/store";
import { money } from "../shared/money";
const ws=id(), east=id(), west=id();
function fixture(metric:StrategyAcceptance["expectation"]["metric"]="revenue") {
 const p:PlanRecord={id:id(),workspaceId:ws,name:"Retail",planNo:"STR-1",period:"2026",objective:null,ownerSub:"owner",status:"active",versionNo:1,solutionIds:[],approvedAt:new Date("2026-01-01"),expectations:[{id:id(),metric,amount:metric==="revenue"?"1000":"3",currency:metric==="revenue"?"CNY":null,criterion:"Signed and accepted"}]};
 Object.assign(p,{publishedSnapshot:captureStrategyPublication(p,[],new Date("2026-01-01"))});
 const c=emptyContent(2026,[east,west].map((r,i)=>({id:r,divisionId:id(),code:String(i),name:String(i),provinces:[],included:true,reason:"",ownerSub:"owner"})),"CNY");
 c.targets.forEach(t=>t.target=t.scope==="workspace"?"1000":"500");
 for(const r of [east,west]) for(const q of [1,2,3,4]) c.targets.push({key:id(),scope:`territory:${r}`,period:`2026Q${q}`,metric:"revenue",currency:"CNY",target:"125",floor:null,stretch:null,note:""});
 const x:StrategyAcceptance={key:id(),strategyId:p.id,lineageId:p.id,version:1,name:p.name,period:p.period,expectation:p.expectations![0]!,amount:metric==="revenue"?"1000":"3",ownerSub:"owner",note:"",allocations:[]};
 c.strategyAcceptances=[x];return {c,x,p};
}
test("strategy and regional totals explain one quota without double counting",()=>{const {c,x}=fixture();Object.assign(x,allocateStrategicTarget(c,x,id));validateContent(c,true);assert.equal(x.allocations.reduce((n,a)=>n+minor(a.amount),0n),minor(x.amount));});
test("combined acceptances cannot exceed company or regional quarter capacity",()=>{
 const {c,x}=fixture();c.strategyAcceptances!.push({...structuredClone(x),key:id(),lineageId:id(),strategyId:id(),amount:"1"});assert.throws(()=>validateStrategyAcceptances(c,true),/strategy_overallocated/);
 c.strategyAcceptances!.forEach(row=>{row.amount="500";row.allocations=[{key:id(),regionId:east,period:"2026Q1",amount:"100",ownerSub:"owner"}];});assert.throws(()=>validateStrategyAcceptances(c,true),/strategy_overallocated/);
});
test("missing financial capacities and duplicate metrics are refused",()=>{
 const {c,x}=fixture();x.allocations=[{key:id(),regionId:east,period:"2026Q1",amount:"100",ownerSub:"owner"}];c.targets=c.targets.filter(t=>t.period!=="2026Q1");assert.throws(()=>validateStrategyAcceptances(c,false),/strategy_overallocated/);
 x.allocations=[];c.strategyAcceptances!.push({...x,key:id()});assert.throws(()=>validateStrategyAcceptances(c,false),/strategy_duplicate/);
});
test("real strategic dates constrain years and eligible quarters",()=>{const {c,x}=fixture();x.period="2026-07-15/2027-03-01";x.allocations=[{key:id(),regionId:east,period:"2026Q1",amount:"100",ownerSub:"owner"}];assert.throws(()=>validateStrategyAcceptances(c,false),/strategy_allocation_invalid/);x.allocations=[];x.period="2027";assert.throws(()=>validateStrategyAcceptances(c,false),/strategy_period_mismatch/);});
test("auto allocation preserves whole items and financial shortages",()=>{
 const {c,x}=fixture("channels");const a=allocateStrategicTarget(c,x,id);assert.equal(a.allocations.reduce((n,a)=>n+Number(a.amount),0),3);assert.ok(a.allocations.every(a=>Number.isInteger(Number(a.amount))));
 const r=fixture();r.x.amount="1200";assert.equal(allocateStrategicTarget(r.c,r.x,id).allocations.reduce((n,a)=>n+Number(a.amount),0),1000);
});
test("auto allocation respects existing allocations of other strategies",()=>{const {c,x}=fixture();c.strategyAcceptances!.push({...structuredClone(x),key:id(),lineageId:id(),amount:"200",allocations:[{key:id(),regionId:east,period:"2026Q1",amount:"125",ownerSub:"owner"}]});x.amount="800";assert.ok(!allocateStrategicTarget(c,x,id).allocations.some(a=>a.regionId===east&&a.period==="2026Q1"));});
test("count metrics require integers and identifiers require UUIDs",()=>{const {x}=fixture("channels");assert.equal(validExpectations([{...x.expectation,amount:"1.2"}]),false);assert.equal(validExpectations([{...x.expectation,amount:"3"}]),true);assert.equal(validExpectations([{...x.expectation,id:"MKT-20261117-01"}]),false);});
test("acceptance verifies the exact publication instead of trusting client facts",()=>{const {x,p}=fixture();verifyStrategyAcceptance(x,p,2026);assert.throws(()=>verifyStrategyAcceptance({...x,expectation:{...x.expectation,amount:"999"}},p,2026),/strategy_source_changed/);assert.throws(()=>verifyStrategyAcceptance(x,null,2026),/strategy_source_changed/);assert.throws(()=>verifyStrategyAcceptance({...x,version:2},p,2026),/strategy_source_changed/);});
test("publication snapshots expectations deeply and published records reject writes",async()=>{const {p}=fixture();const frozen=captureStrategyPublication(p,[],new Date());p.expectations![0]!.amount="1";assert.equal(frozen.expectations![0]!.amount,"1000");const store=new InMemoryStrategyStore();store.seed({plans:[p]});assert.equal(await store.updatePlan(ws,p.id,{expectations:[]}),false);});
test("company and regional releases preserve their separate edit boundaries",()=>{const {c}=fixture();const source={id:id(),state:"sealed",content:structuredClone(c)} as PlanRevision;const plan={revisions:[source]} as SalesPlan;const r=structuredClone(c);r.releaseScope="regions";r.companyRevisionId=source.id;validatePlanningWorkflow(plan,r,source.id);r.strategyAcceptances![0]!.amount="999";assert.throws(()=>validatePlanningWorkflow(plan,r,source.id),/company_basis_changed/);const company=structuredClone(c);company.releaseScope="company";company.strategyAcceptances![0]!.allocations=[{key:id(),regionId:east,period:"2026Q1",amount:"1",ownerSub:"owner"}];assert.throws(()=>validatePlanningWorkflow(plan,company,source.id),/regional_draft_required/);});
test("strategic acceptance changes appear in version differences",()=>{const {c}=fixture();const next=structuredClone(c);next.strategyAcceptances![0]!.amount="999";assert.ok(comparePlanContents(c,next).some(x=>x.section==="strategyAcceptances"));});
function deal(p:PlanRecord,patch:Partial<OpportunityRecord>={}):OpportunityRecord{return {id:id(),planId:p.id,campaignId:null,status:"won",territoryId:east,amount:money(100,"CNY"),currency:"CNY",closedAt:new Date("2026-10-12"),...patch} as OpportunityRecord;}
test("actual revenue deduplicates UUIDs and respects dates, currency and geography",()=>{const {x,p}=fixture();const d=deal(p);const input={start:"2026-10-01",end:"2027-01-01",plans:[p],campaigns:[],evidence:[],deals:[d,d,deal(p,{closedAt:new Date("2026-01-01")}),deal(p,{amount:money(900,"USD"),currency:"USD"}),deal(p,{territoryId:west})]};assert.equal(strategicActual(x,{...input,regionId:east}),"100.00");assert.equal(strategicActual(x,input),"200.00");});
test("missing facts or conflicting attribution show unknown instead of false zero",()=>{const {x,p}=fixture();const other={...p,id:id(),lineageId:id()};const campaign={id:id(),planId:other.id} as CampaignRecord;for(const d of [deal(p,{closedAt:null}),deal(p,{amount:null}),deal(p,{campaignId:campaign.id})])assert.equal(strategicActual(x,{start:"2026-01-01",end:"2027-01-01",plans:[p,other],deals:[d],campaigns:[campaign],evidence:[]}),null);});
test("new strategic versions retain explicit achievements from the same lineage",()=>{const {x,p}=fixture();const revision={...p,id:id(),lineageId:p.id,versionNo:2};x.strategyId=revision.id;x.version=2;assert.equal(strategicActual(x,{start:"2026-01-01",end:"2027-01-01",plans:[p,revision],deals:[deal(p)],campaigns:[],evidence:[]}),"100.00");});
function result(x:StrategyAcceptance):StrategicResult{return {id:id(),workspaceId:ws,planId:id(),revisionId:id(),acceptanceKey:x.key,lineageId:x.lineageId,objectiveId:x.expectation.id,allocationKey:x.allocations[0]!.key,regionId:east,achievedOn:"2026-10-10",evidenceUrl:"https://example.com/accepted",note:"Signed",actorSub:"owner",recordedAt:"2026-11-01T00:00:00Z",voidsId:null};}
test("milestone evidence validates dates, rejects duplicates and retains revoked history",()=>{const {c,x,p}=fixture("channels");x.allocations=[{key:id(),regionId:east,period:"2026Q4",amount:"3",ownerSub:"owner"}];const e=result(x);validateStrategicResult(e,c,x,[]);assert.throws(()=>validateStrategicResult({...e,id:id()},c,x,[e]),/strategy_result_duplicate/);assert.throws(()=>validateStrategicResult({...e,achievedOn:"2026-04-01"},c,x,[]),/strategy_result_invalid/);const revoked={...e,id:id(),voidsId:e.id};validateStrategicResult(revoked,c,x,[e]);assert.equal(strategicActual(x,{start:"2026-01-01",end:"2027-01-01",plans:[p],deals:[],campaigns:[],evidence:[e,revoked]}),"0");assert.throws(()=>validateStrategicResult({...revoked,id:id()},c,x,[e,revoked]),/strategy_result_conflict/);});

test("closed strategic quarters freeze allocation and source while future annual revisions remain editable",()=>{
 const {c,x}=fixture();x.allocations=[{key:id(),regionId:east,period:"2026Q1",amount:"100",ownerSub:"owner"}];
 const changed=structuredClone(c);changed.strategyAcceptances![0]!.amount="900";changed.strategyAcceptances![0]!.note="New future basis";
 assert.deepEqual(closedSlice(c,"2026Q1"),closedSlice(changed,"2026Q1"));
 changed.strategyAcceptances![0]!.allocations[0]!.amount="99";
 assert.notDeepEqual(closedSlice(c,"2026Q1"),closedSlice(changed,"2026Q1"));
});
test("strategic objective UUID cannot be repurposed to a different metric in memory revisions",async()=>{
 const {p}=fixture();const store=new InMemoryStrategyStore();store.seed({plans:[p]});
 const draft=await store.createRevision(ws,p.id,"owner");
 await assert.rejects(store.updatePlan(ws,draft.id,{expectations:[{...p.expectations![0]!,metric:"channels",currency:null}]}),/expectations_invalid/);
});

test("missing revenue currency or regional attribution stays unknown",()=>{
 const {x,p}=fixture();const input={start:"2026-01-01",end:"2027-01-01",plans:[p],campaigns:[],evidence:[]};
 assert.equal(strategicActual(x,{...input,deals:[deal(p,{amount:null,currency:undefined})]}),null);
 assert.equal(strategicActual(x,{...input,regionId:east,deals:[deal(p,{territoryId:null})]}),null);
});

test("planning can turn an exploratory channel expectation into an explicit acceptance criterion",()=>{
 const {c,x}=fixture("channels");x.expectation.criterion="";
 assert.throws(()=>validateStrategyAcceptances(c,true),/strategy_owner_required/);
 x.note="Signed partner with the first order";validateStrategyAcceptances(c,true);
});
