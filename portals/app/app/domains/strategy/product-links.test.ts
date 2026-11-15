import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore } from "../catalog/store";
import { listProductReferences } from "../catalog/service";
import { InMemoryStrategyStore, type PlanRecord } from "./store";
import { createPlan, editPlan, upsertSegment, publishStrategy, reviseStrategy, type StrategyContext } from "./service";
import { strategyViews } from "../../(app)/lib/market-strategy";
import { strategyOfferings } from "../../(app)/lib/strategy-offerings";

const WS="product-link-workspace";
const input={planNo:"PLAN-2026",name:"Retail",period:"2026",objective:null,ownerSub:null};
const edit=(p:PlanRecord)=>({name:p.name,period:p.period,objective:p.objective,ownerSub:p.ownerSub});
const segment={segmentCode:"RETAIL",name:"Retail market",priority:1,status:"active" as const,criteria:{industries:["retail"],regions:[]}};
function setup(){
  const catalog=new InMemoryCatalogStore();
  catalog.seed({products:[
    {id:"same-id",workspaceId:WS,productCode:"P1",name:"POS device",typeId:null,unitId:"unit",statusId:"active",sortOrder:1},
    {id:"retired",workspaceId:WS,productCode:"P2",name:"Old POS",typeId:null,unitId:"unit",statusId:"retired",sortOrder:2},
    {id:"foreign",workspaceId:"foreign-workspace",productCode:"P3",name:"Foreign POS",typeId:null,unitId:"unit",statusId:"active",sortOrder:1},
  ],solutions:[{id:"same-id",workspaceId:WS,solutionCode:"S1",name:"Retail solution",summary:null,scenario:null,status:"active",sortOrder:1}],
  statuses:[
    {id:"active",workspaceId:WS,statusCode:"active",name:"Active",description:null,sortOrder:1},
    {id:"retired",workspaceId:WS,statusCode:"retired",name:"Retired",description:null,sortOrder:2},
  ]});
  const ctx:StrategyContext={workspaceId:WS,sub:"creator",holder:{permissions:new Set(permissionsForRoles(["sales_leader"]))},
    entitlement:{...EMPTY_ENTITLEMENT,workspace_id:WS,product:"yucer",tier:"business"},store:new InMemoryStrategyStore(),catalog};
  return {ctx,catalog};
}
const code=(r:{ok:boolean;violations?:readonly {code:string}[]})=>!r.ok && r.violations?.[0]?.code;

test("mixed offerings keep separate identities, icons and routes even for identical UUIDs",async()=>{
  const {ctx,catalog}=setup();
  const refs=unwrap(await listProductReferences({...ctx,store:catalog}));
  assert.equal(refs.length,2);assert.equal(refs.find(p=>p.id==="retired")?.status,"retired");
  const p=unwrap(await createPlan(ctx,{...input,solutionIds:["same-id"],productIds:["same-id","same-id"]}));
  assert.deepEqual(p.productIds,["same-id"]);assert.deepEqual(p.solutionIds,["same-id"]);
  const rows=strategyOfferings([{id:"same-id",name:"Solution",solutionCode:"S1",status:"active"}],refs.filter(p=>p.id==="same-id"));
  assert.deepEqual(rows.map(r=>[r.key,r.icon,r.href]),[
    ["solution:same-id","stack","/solution?solution=same-id"],["product:same-id","cube","/catalog?product=same-id"],
  ]);
});
test("retired, foreign and malformed additions refuse the entire draft",async()=>{
  const {ctx}=setup();
  for(const productIds of [["retired"],["foreign"],["missing"],[""],[null] as unknown as string[]])
    assert.equal(code(await createPlan(ctx,{...input,productIds})),"product_not_selectable");
  assert.equal((await ctx.store.listPlans(WS)).length,0);
});
test("both defaults inherit once; subsequent defaults and strategy edits remain independent",async()=>{
  const {ctx}=setup();
  const market=unwrap(await upsertSegment(ctx,{...segment,productIds:["same-id"],solutionIds:["same-id"]}));
  const p=unwrap(await createPlan(ctx,{...input,targetMarkets:[{segmentId:market.id,intent:"focus",approach:null}]}));
  assert.deepEqual(p.targetMarkets?.[0].productIds,["same-id"]);assert.deepEqual(p.targetMarkets?.[0].solutionIds,["same-id"]);
  unwrap(await upsertSegment(ctx,{...segment,productIds:[],solutionIds:[]}));
  const preserved=unwrap(await editPlan(ctx,p.id,{...edit(p),targetMarkets:[{segmentId:market.id,intent:"validate",approach:"Pilot"}]}));
  assert.deepEqual(preserved.targetMarkets?.[0].productIds,["same-id"]);
  const cleared=unwrap(await editPlan(ctx,p.id,{...edit(p),targetMarkets:[{segmentId:market.id,intent:"focus",approach:null,productIds:[]}]}));
  assert.deepEqual(cleared.targetMarkets?.[0].productIds,[]);assert.deepEqual(cleared.targetMarkets?.[0].solutionIds,["same-id"]);
});
test("omission preserves products during solution edits; explicit empty clears only that kind",async()=>{
  const {ctx}=setup();
  unwrap(await upsertSegment(ctx,{...segment,productIds:["same-id"],solutionIds:["same-id"]}));
  const market=unwrap(await upsertSegment(ctx,{...segment,name:"Updated",solutionIds:[]}));
  assert.deepEqual(market.productIds,["same-id"]);assert.deepEqual(market.solutionIds,[]);
  const p=unwrap(await createPlan(ctx,{...input,productIds:["same-id"],solutionIds:["same-id"]}));
  assert.deepEqual(unwrap(await editPlan(ctx,p.id,{...edit(p),solutionIds:[]})).productIds,["same-id"]);
  assert.deepEqual(unwrap(await editPlan(ctx,p.id,{...edit(p),productIds:[]})).productIds,[]);
});
test("retired products may remain but cannot be added elsewhere",async()=>{
  const {ctx,catalog}=setup();
  const p=unwrap(await createPlan(ctx,{...input,productIds:["same-id"]}));
  await catalog.setProductStatus(WS,"same-id","retired");
  assert.equal((await editPlan(ctx,p.id,{...edit(p),productIds:["same-id"]})).ok,true);
  assert.equal(code(await createPlan(ctx,{...input,planNo:"SECOND",productIds:["same-id"]})),"product_not_selectable");
  const market=unwrap(await upsertSegment(ctx,segment));
  assert.equal(code(await editPlan(ctx,p.id,{...edit(p),targetMarkets:[{segmentId:market.id,intent:"focus",approach:null,productIds:["same-id"]}]})),"product_not_selectable");
});
test("catalogue outages preserve products while allowing independent solution edits",async()=>{
  const {ctx}=setup();
  const p=unwrap(await createPlan(ctx,{...input,productIds:["same-id"],solutionIds:["same-id"]}));
  const unavailable={...ctx,catalog:{listSolutions:ctx.catalog!.listSolutions.bind(ctx.catalog)}};
  assert.equal(code(await editPlan(unavailable,p.id,{...edit(p),productIds:["same-id","new"]})),"product_catalog_unavailable");
  const saved=unwrap(await editPlan(unavailable,p.id,{...edit(p),solutionIds:[]}));
  assert.deepEqual(saved.productIds,["same-id"]);
  assert.equal(code(await publishStrategy(unavailable,p.id,saved.editToken!)),"product_catalog_unavailable");
});
test("publication freezes products; revision copies links and original publication stays immutable",async()=>{
  const {ctx,catalog}=setup();
  const p=unwrap(await createPlan(ctx,{...input,productIds:["same-id"],solutionIds:["same-id"]}));
  const published=unwrap(await publishStrategy(ctx,p.id,p.editToken!));
  assert.equal(published.publishedSnapshot?.products?.[0].name,"POS device");
  await catalog.setProductStatus(WS,"same-id","retired");
  const current=unwrap(await listProductReferences({...ctx,store:catalog})).map(p=>({...p,name:"Renamed device"}));
  const views=strategyViews([published],[],null,null,[{id:"same-id",name:"Renamed",solutionCode:"S1",status:"active"}],[],current);
  assert.equal(views[0].products?.[0].name,"POS device");assert.equal(views[0].products?.[0].status,"active");
  const hidden=strategyViews([published],[],null,null,null,[],null)[0];
  assert.equal(hidden.products,null);assert.equal("publishedSnapshot" in hidden,false);assert.equal("productIds" in hidden,false);
  const draft=unwrap(await reviseStrategy(ctx,p.id));assert.deepEqual(draft.productIds,["same-id"]);
  unwrap(await editPlan(ctx,draft.id,{...edit(draft),changeReason:"Change offer",productIds:[]}));
  assert.deepEqual((await ctx.store.getPlan(WS,p.id))?.productIds,["same-id"]);
  assert.equal(code(await editPlan(ctx,p.id,{...edit(p),productIds:[]})),"plan_settled");
});
test("product links enforce entitlement, permissions and workspace",async()=>{
  const {ctx}=setup();
  const denied={...ctx,holder:{permissions:new Set([...ctx.holder.permissions].filter(p=>p!=="catalog.read"))}};
  assert.equal((await createPlan(denied,{...input,productIds:["same-id"]})).ok,false);
  assert.equal((await upsertSegment(denied,{...segment,productIds:["same-id"]})).ok,false);
  assert.equal((await createPlan({...ctx,entitlement:{...ctx.entitlement,tier:"pro"}},{...input,productIds:["same-id"]})).ok,false);
  assert.equal((await createPlan({...ctx,workspaceId:"other"},{...input,productIds:["same-id"]})).ok,false);
});
