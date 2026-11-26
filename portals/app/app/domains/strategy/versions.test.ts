import { nextStrategyNumber } from "./lib/plan-number";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore } from "../catalog/store";
import { InMemoryStrategyStore, currentStrategyPlans, type PlanRecord } from "./store";
import { createPlan, editPlan, publishStrategy, reviseStrategy, discardStrategyDraft, transitionPlan, createCampaign, type StrategyContext } from "./service";
import { checkCampaignLinks } from "./lib/campaign";

const WS="strategy-version-workspace";
const AT=new Date("2026-11-14T12:00:00Z");
function context():StrategyContext {
  return {workspaceId:WS,sub:"creator",holder:{permissions:new Set(permissionsForRoles(["sales_leader"]))},
    entitlement:{...EMPTY_ENTITLEMENT,workspace_id:WS,product:"yucer",tier:"business"},store:new InMemoryStrategyStore()};
}
const input={planNo:"STRATEGY-2026",name:"Retail expansion",period:"2026",objective:"Pilot then expand",ownerSub:null};
const edit=(p:PlanRecord,over:Partial<typeof input>={})=>({name:p.name,period:p.period,objective:p.objective,ownerSub:p.ownerSub,...over});
const token=(p:PlanRecord)=>p.editToken ?? 1;
const code=(r:{ok:boolean;violations?:readonly {code:string}[]})=>!r.ok && r.violations?.[0]?.code;

async function published(c:StrategyContext){const p=unwrap(await createPlan(c,input));return unwrap(await publishStrategy(c,p.id,token(p),AT));}

test("revision publishes a new stable id, keeps the code and historical campaign attribution, and is idempotent",async()=>{
  const c=context();const v1=await published(c);
  assert.equal(v1.versionNo,1);assert.equal(v1.publishedBySub,"creator");
  unwrap(await transitionPlan(c,v1.id,"active"));
  const campaign=unwrap(await createCampaign(c,{campaignNo:"CAMP-V1",name:"Old campaign",planId:v1.id,segmentId:null,channel:null,budgetAmount:null,currency:"CNY",ownerSub:null,startsAt:null,endsAt:null}));
  c.sub="reviser";
  const [draft,again]=await Promise.all([reviseStrategy(c,v1.id),reviseStrategy(c,v1.id)]).then(rows=>rows.map(unwrap));
  assert.equal(draft.id,again.id);assert.notEqual(draft.id,v1.id);assert.equal(draft.planNo,v1.planNo);
  assert.equal(draft.basePlanId,v1.id);assert.equal(draft.createdBySub,"reviser");assert.equal(draft.versionNo,null);
  assert.equal(currentStrategyPlans(await c.store.listPlans(WS))[0].id,v1.id,"drafts do not displace the publication");
  const changed=unwrap(await editPlan(c,draft.id,{...edit(draft,{name:"Retail and logistics"}),changeReason:"Extend the successful pilot"},{expectedEditToken:token(draft)}));
  assert.equal((await c.store.getPlan(WS,v1.id))?.name,input.name);
  const v2=unwrap(await publishStrategy(c,changed.id,token(changed),new Date(AT.getTime()+1000)));
  assert.equal(v2.versionNo,2);assert.equal(v2.status,"active");assert.equal(v2.publishedBySub,"reviser");
  assert.equal((await c.store.getPlan(WS,v1.id))?.status,"closed");
  assert.equal((await c.store.getPlan(WS,v1.id))?.publishedSnapshot?.name,input.name);
  assert.equal((await c.store.getCampaign(WS,campaign.id))?.planId,v1.id);
  assert.equal(currentStrategyPlans(await c.store.listPlans(WS))[0].id,v2.id);
  const retry=unwrap(await publishStrategy({...c,sub:"retrying-caller"},v2.id,token(changed),new Date(AT.getTime()+5000)));
  assert.equal(retry.versionNo,2);assert.equal(retry.publishedBySub,"reviser");assert.equal(retry.approvedAt?.getTime(),v2.approvedAt?.getTime());
  assert.equal(code(await reviseStrategy(c,v1.id)),"strategy_not_revisable");
  const v3draft=unwrap(await reviseStrategy(c,v2.id));assert.equal(v3draft.basePlanId,v2.id);assert.equal(v3draft.lineageId,v1.id);
  assert.equal(checkCampaignLinks({planId:v1.id,segmentId:null},{plan:(await c.store.getPlan(WS,v1.id)),segmentIds:[]}).ok,false);
  assert.equal(checkCampaignLinks({planId:v1.id,segmentId:null},{plan:(await c.store.getPlan(WS,v1.id)),segmentIds:[]},{planId:v1.id,segmentId:null}).ok,true);
});

test("publication needs a revision reason, draft saves reject stale tokens, and discard keeps the publication",async()=>{
  const c=context();const v1=await published(c);const draft=unwrap(await reviseStrategy(c,v1.id));
  assert.equal(code(await publishStrategy(c,draft.id,token(draft))),"strategy_reason_required");
  const results=await Promise.all([editPlan(c,draft.id,{...edit(draft),changeReason:"A"},{expectedEditToken:token(draft)}),editPlan(c,draft.id,{...edit(draft),changeReason:"B"},{expectedEditToken:token(draft)})]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(code(results.find(r=>!r.ok)!),"strategy_draft_conflict");
  assert.equal(code(await publishStrategy(c,draft.id,token(draft))),"strategy_draft_conflict");
  const latest=(await c.store.getPlan(WS,draft.id))!;
  assert.equal(code(await discardStrategyDraft(c,draft.id,token(draft))),"strategy_draft_conflict");
  const discarded=unwrap(await discardStrategyDraft(c,draft.id,token(latest)));assert.equal(discarded.status,"archived");
  assert.equal(unwrap(await discardStrategyDraft(c,draft.id,token(latest))).id,draft.id);
  assert.equal(code(await publishStrategy(c,draft.id,token(discarded))),"draft_required");
  assert.equal(currentStrategyPlans(await c.store.listPlans(WS))[0].id,v1.id);
  const replacement=unwrap(await reviseStrategy(c,v1.id));assert.notEqual(replacement.id,draft.id);
});

test("revision saves require a nonblank reason and preserve it on partial edits", async () => {
  const c=context();
  const first=unwrap(await createPlan(c,input));
  const edited=unwrap(await editPlan(c,first.id,edit(first)));
  const v1=unwrap(await publishStrategy(c,edited.id,token(edited),AT));
  const draft=unwrap(await reviseStrategy(c,v1.id));
  for(const reason of [undefined,""," \t\n "]) {
    const result=await editPlan(c,draft.id,{...edit(draft),name:"Unsaved change",changeReason:reason},{expectedEditToken:token(draft)});
    assert.equal(code(result),"strategy_reason_required");
    if(!result.ok)assert.equal(result.violations[0].field,"changeReason");
    const unchanged=(await c.store.getPlan(WS,draft.id))!;
    assert.equal(unchanged.name,draft.name);
    assert.equal(token(unchanged),token(draft));
  }
  const saved=unwrap(await editPlan(c,draft.id,{...edit(draft),changeReason:"  Focus on repeat business  "}));
  assert.equal(saved.changeReason,"Focus on repeat business");
  const partial=unwrap(await editPlan(c,saved.id,{...edit(saved),name:"Repeat business"}));
  assert.equal(partial.changeReason,saved.changeReason);
  assert.equal(code(await editPlan(c,partial.id,{...edit(partial),changeReason:"   "})),"strategy_reason_required");
  const v2=unwrap(await publishStrategy(c,partial.id,token(partial),AT));
  assert.equal(v2.versionNo,2);
  assert.equal(v2.changeReason,saved.changeReason);
});

test("a closed base invalidates a pending revision without changing either version",async()=>{
  const c=context();const v1=await published(c);unwrap(await transitionPlan(c,v1.id,"active"));
  const draft=unwrap(await reviseStrategy(c,v1.id));const saved=unwrap(await editPlan(c,draft.id,{...edit(draft),changeReason:"Ready"}));
  unwrap(await transitionPlan(c,v1.id,"closed"));
  assert.equal(code(await publishStrategy(c,saved.id,token(saved))),"strategy_base_conflict");
  assert.equal((await c.store.getPlan(WS,draft.id))?.versionNo,null);
  assert.equal((await c.store.getPlan(WS,v1.id))?.versionNo,1);
});

test("version operations keep entitlement, permission and workspace gates",async()=>{
  const c=context();const p=unwrap(await createPlan(c,input));
  const noPermission={...c,holder:{permissions:new Set<never>()}};
  const downgraded={...c,entitlement:{...c.entitlement,tier:"pro" as const}};
  for(const denied of [noPermission,downgraded])assert.equal((await publishStrategy(denied,p.id,token(p))).ok,false);
  const v1=unwrap(await publishStrategy(c,p.id,token(p)));
  for(const denied of [noPermission,downgraded])assert.equal((await reviseStrategy(denied,v1.id)).ok,false);
  const foreign={...c,workspaceId:"another-workspace"};
  assert.equal(code(await reviseStrategy(foreign,v1.id)),"strategy_not_found");
  assert.equal(code(await publishStrategy(foreign,v1.id,token(v1))),"strategy_not_found");
  const draft=unwrap(await reviseStrategy(c,v1.id));
  for(const denied of [noPermission,downgraded,foreign])assert.equal((await discardStrategyDraft(denied,draft.id,token(draft))).ok,false);
  assert.equal(code(await publishStrategy(c,draft.id,NaN)),"strategy_draft_conflict");
});

test("frozen solution names remain stable and publication cannot bypass catalog visibility",async()=>{
  const c=context();const catalog=new InMemoryCatalogStore();c.catalog=catalog;
  const solution={id:"solution",workspaceId:WS,solutionCode:"S1",name:"Original solution",summary:null,scenario:null,status:"active" as const,sortOrder:1};catalog.seed({solutions:[solution]});
  const p=unwrap(await createPlan(c,{...input,solutionIds:[solution.id]}));
  const hidden={...c,holder:{permissions:new Set([...c.holder.permissions].filter(p=>p!=="catalog.read"))}};
  assert.equal((await publishStrategy(hidden,p.id,token(p))).ok,false);
  const v1=unwrap(await publishStrategy(c,p.id,token(p)));catalog.seed({solutions:[{...solution,name:"Renamed solution"}]});
  assert.equal((await c.store.getPlan(WS,v1.id))?.publishedSnapshot?.solutions[0].name,"Original solution");
  const draft=unwrap(await reviseStrategy(c,v1.id));
  const saved=unwrap(await editPlan(c,draft.id,{...edit(draft),changeReason:"New positioning"}));
  const v2=unwrap(await publishStrategy(c,saved.id,token(saved)));assert.equal(v2.publishedSnapshot?.solutions[0].name,"Renamed solution");
});


test("store reads cannot mutate frozen publications through shared references", async () => {
  const c = context(); const v1 = await published(c);
  const fetched = (await c.store.getPlan(WS, v1.id))!;
  fetched.publishedSnapshot!.name = "Caller mutation";
  const listed = await c.store.listPlans(WS);
  listed[0].publishedSnapshot!.name = "List mutation";
  assert.equal((await c.store.getPlan(WS, v1.id))?.publishedSnapshot?.name, input.name);
});

test("automatic numbers follow the creation day, remain workspace scoped and survive revisions", async () => {
  const c = context();
  const annual = unwrap(await createPlan(c, {...input, planNo: ""}, {autoNumber: true}));
  assert.equal(annual.planNo, nextStrategyNumber([]));
  const quarterly = unwrap(await createPlan(c, {...input, planNo: "stale-preview", period: "2026-Q1"}, {autoNumber: true}));
  assert.equal(quarterly.planNo, nextStrategyNumber([annual.planNo]));
  const parallel = await Promise.all(Array.from({length: 4}, () => createPlan(c, {...input, planNo: nextStrategyNumber([annual.planNo]), period: "2026Q1"}, {autoNumber: true})));
  assert.equal(parallel.every(r => r.ok), true);
  const numbers = parallel.map(r => unwrap(r).planNo);
  assert.equal(new Set(numbers).size, 4);
  assert.deepEqual(numbers.toSorted(), [3,4,5,6].map(n=>`${annual.planNo.slice(0,-3)}${String(n).padStart(3,"0")}`));
  const foreign = unwrap(await createPlan({...c, workspaceId: "other"}, {...input, planNo: ""}, {autoNumber: true}));
  assert.equal(foreign.planNo, annual.planNo);
  const released = unwrap(await publishStrategy(c, annual.id, token(annual)));
  const draft = unwrap(await reviseStrategy(c, released.id));
  const changed = unwrap(await editPlan(c, draft.id, {...edit(draft), period: "2027", changeReason: "Extend planning period"}));
  assert.equal(changed.planNo, annual.planNo);
  assert.equal(code(await createPlan(c, {...input, planNo: annual.planNo})), "plan_no_taken");
  assert.equal(code(await createPlan(c, {...input, planNo: ""})), "plan_no_required");
});

test("automatic numbering preserves manual codes and remains independent of custom execution dates", async () => {
  const c = context();
  const custom = unwrap(await createPlan(c, {...input, planNo: "CORP-RETAIL-26", period: "2026-11-01/2027-02-28"}));
  assert.equal(custom.planNo, "CORP-RETAIL-26");
  const first = unwrap(await createPlan(c, {...input, planNo: "", period: "2026-11-01/2027-02-28"}, {autoNumber: true}));
  assert.equal(first.planNo, nextStrategyNumber([]));
  const second = unwrap(await createPlan(c, {...input, planNo: "", period: "2026-11-01/2027-02-28"}, {autoNumber: true}));
  assert.equal(second.planNo, nextStrategyNumber([first.planNo]));
});

test("new strategies and publication require real windows; unknown legacy labels are preserved until corrected", async () => {
  const c = context();
  for (const period of ["Pilot wave", "2026-02-30/2026-03-10", "2027-01-01/2026-12-31", "2026-Q5"]) {
    assert.equal(code(await createPlan(c, {...input, period})), "period_invalid");
  }
  const legacy: PlanRecord = {id:"old",workspaceId:WS,planNo:"OLD",name:"Legacy",period:"FY26",objective:null,ownerSub:null,solutionIds:[],status:"active",approvedAt:AT};
  (c.store as InMemoryStrategyStore).seed({plans:[legacy]});
  const draft = unwrap(await reviseStrategy(c, legacy.id));
  const saved = unwrap(await editPlan(c, draft.id, {...edit(draft), changeReason:"Confirm historical execution dates"}));
  assert.equal(saved.period,"FY26");
  assert.equal(code(await publishStrategy(c,saved.id,token(saved))),"period_invalid");
  const corrected = unwrap(await editPlan(c,saved.id,{...edit(saved),period:"2026-04-01/2027-03-31",changeReason:"Confirm historical execution dates"}));
  const v2 = unwrap(await publishStrategy(c,corrected.id,token(corrected)));
  assert.equal(v2.publishedSnapshot?.period,"2026-04-01/2027-03-31");
  assert.equal((await c.store.getPlan(WS,legacy.id))?.period,"FY26");
});


test("retained aliases reserve former numbers within a workspace in memory",async()=>{
  const c=context();
  const first=unwrap(await createPlan(c,{...input,planNo:"CURRENT"}));
  (c.store as InMemoryStrategyStore).seed({plans:[{...first,previousNumbers:[nextStrategyNumber([]),"LEGACY"]}]});
  assert.equal(code(await createPlan(c,{...input,planNo:"LEGACY"})),"plan_no_taken");
  const auto=unwrap(await createPlan(c,{...input,planNo:""},{autoNumber:true}));
  assert.equal(auto.planNo,nextStrategyNumber([nextStrategyNumber([])]));
  assert.equal(unwrap(await createPlan({...c,workspaceId:"other"},{...input,planNo:"LEGACY"})).planNo,"LEGACY");
});
