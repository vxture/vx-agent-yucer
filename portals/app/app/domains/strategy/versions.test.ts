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
