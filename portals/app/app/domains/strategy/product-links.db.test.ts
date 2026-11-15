import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PrismaStrategyStore } from "./prisma-store";
import { PrismaCatalogStore } from "../catalog/prisma-store";
import { PlanProductUnavailableError } from "./store";

const skip=process.env.DATABASE_URL ? false : "no DATABASE_URL";
const WS="eeeeeeee-1414-0000-0000-000000000001";
const FOREIGN="eeeeeeee-1414-0000-0000-000000000002";
async function pg<T>(run:(c:Client)=>Promise<T>,svc=false){
  const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
  try{if(svc)await c.query("SET ROLE yucer_svc");return await run(c);}finally{await c.end();}
}
async function cleanup(){await pg(async c=>{
  await c.query("DELETE FROM yucer_gtm.strategy_plan_event WHERE workspace_id=$1",[WS]);
  await c.query("DELETE FROM yucer_gtm.strategy_plan WHERE workspace_id=$1",[WS]);
  await c.query("DELETE FROM yucer_gtm.market_segment WHERE workspace_id=$1",[WS]);
  for(const table of ["product","solution","product_status","product_unit"])
    await c.query(`DELETE FROM yucer_catalog.${table} WHERE workspace_id IN ($1,$2)`,[WS,FOREIGN]);
});}
test("product links persist, enforce workspace FKs and freeze/copy across SQL publication and revisions",{skip},async()=>{
  await cleanup();try{
    const product=randomUUID(),foreign=randomUUID(),solution=randomUUID(),unit=randomUUID(),status=randomUUID();
    await pg(async c=>{
      await c.query("INSERT INTO yucer_catalog.product_unit(id,workspace_id,unit_code,name) VALUES($1,$2,'set','Set')",[unit,WS]);
      await c.query("INSERT INTO yucer_catalog.product_status(id,workspace_id,status_code,name) VALUES($1,$2,'active','Active')",[status,WS]);
      await c.query("INSERT INTO yucer_catalog.product(id,workspace_id,product_code,name,unit_id,status_id) VALUES($1,$2,'P1','Original POS',$3,$4),($5,$6,'P2','Foreign POS',$3,$4)",[product,WS,unit,status,foreign,FOREIGN]);
      await c.query("INSERT INTO yucer_catalog.solution(id,workspace_id,solution_code,name) VALUES($1,$2,'S1','Retail solution')",[solution,WS]);
    });
    const store=new PrismaStrategyStore();
    const market=await store.upsertSegment(WS,{segmentCode:"RETAIL",name:"Retail",priority:1,status:"active",criteria:{industries:[],regions:[]},productIds:[product],solutionIds:[solution]});
    assert.deepEqual(market.productIds,[product]);
    const preserved=await store.upsertSegment(WS,{segmentCode:"RETAIL",name:"Retail revised",priority:1,status:"active",criteria:market.criteria,solutionIds:[]});
    assert.deepEqual(preserved.productIds,[product]);assert.deepEqual(preserved.solutionIds,[]);
    const plan=(await store.createPlan(WS,{planNo:"MIXED-2026",name:"Strategy",period:"2026",objective:null,ownerSub:null,solutionIds:[solution],productIds:[product],
      targetMarkets:[{segmentId:market.id,marketName:market.name,criteria:market.criteria,intent:"focus",approach:null,solutionIds:[solution],productIds:[product]}]}))!;
    assert.deepEqual(plan.productIds,[product]);assert.deepEqual(plan.targetMarkets?.[0].productIds,[product]);
    await assert.rejects(store.updatePlan(WS,plan.id,{name:"Must roll back",productIds:[foreign]}),PlanProductUnavailableError);
    assert.equal((await store.getPlan(WS,plan.id))?.name,"Strategy");
    for(const sql of [
      "INSERT INTO yucer_gtm.strategy_plan_product VALUES($1,$2,$3)",
      "INSERT INTO yucer_gtm.strategy_plan_market_product VALUES($1,$2,$4,$3)",
    ])await assert.rejects(pg(c=>c.query(sql,[WS,plan.id,foreign,...(sql.includes('$4')?[market.id]:[])]),true),/foreign key/);
    await assert.rejects(pg(c=>c.query("INSERT INTO yucer_gtm.market_segment_product VALUES($1,$2,$3)",[WS,market.id,foreign]),true),/foreign key/);
    await pg(c=>c.query("SELECT yucer_gtm.publish_strategy_plan($1,$2,$3,'publisher',now())",[WS,plan.id,plan.editToken]),true);
    const published=(await store.getPlan(WS,plan.id))!;
    assert.deepEqual(published.publishedSnapshot?.sharedProductIds,[product]);
    assert.equal(published.publishedSnapshot?.products?.[0].name,"Original POS");
    assert.deepEqual(published.publishedSnapshot?.targetMarkets[0].productIds,[product]);
    for(const table of ["strategy_plan_product","strategy_plan_market_product"]){
      await assert.rejects(pg(c=>c.query(`DELETE FROM yucer_gtm.${table} WHERE workspace_id=$1 AND plan_id=$2`,[WS,plan.id]),true),/immutable_strategy/);
      await assert.rejects(pg(c=>c.query(`UPDATE yucer_gtm.${table} SET product_id=$1 WHERE plan_id=$2`,[foreign,plan.id]),true),/permission denied/);
    }
    const draft=await store.createRevision(WS,plan.id,"reviser");
    assert.deepEqual(draft.productIds,[product]);assert.deepEqual(draft.targetMarkets?.[0].productIds,[product]);
    await store.updatePlan(WS,draft.id,{productIds:[],targetMarkets:[{...draft.targetMarkets![0],productIds:[]}]});
    assert.deepEqual((await store.getPlan(WS,draft.id))?.productIds,[]);
    assert.deepEqual((await store.getPlan(WS,draft.id))?.targetMarkets?.[0].productIds,[]);
    await pg(c=>c.query("UPDATE yucer_catalog.product SET name='Renamed POS' WHERE id=$1",[product]));
    assert.equal((await store.getPlan(WS,plan.id))?.publishedSnapshot?.products?.[0].name,"Original POS");
    const refs=await new PrismaCatalogStore().countProductRefs(WS,product);
    assert.equal(refs.strategyLinks,3,"publication and market defaults protect product history");
    await assert.rejects(pg(c=>c.query("DELETE FROM yucer_catalog.product WHERE id=$1",[product])),/foreign key/);
    await store.upsertSegment(WS,{segmentCode:"RETAIL",name:"Retail",priority:1,status:"active",criteria:market.criteria,productIds:[]});
    assert.deepEqual((await store.listSegments(WS))[0].productIds,[]);
  }finally{await cleanup();}
});
