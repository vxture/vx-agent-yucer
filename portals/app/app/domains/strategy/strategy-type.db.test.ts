import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PrismaStrategyStore } from "./prisma-store";

const skip=process.env.DATABASE_URL?false:"no DATABASE_URL";
const WS="eeeeeeee-1115-0000-0000-000000000001";
const OTHER="eeeeeeee-1115-0000-0000-000000000002";
async function pg<T>(fn:(c:Client)=>Promise<T>,role=false) {
  const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
  try{if(role)await c.query("SET ROLE yucer_svc");return await fn(c);}finally{await c.end();}
}
const svc=<T>(fn:(c:Client)=>Promise<T>)=>pg(fn,true);
async function cleanup(){await pg(async c=>{
  await c.query("DELETE FROM yucer_gtm.strategy_plan_event WHERE workspace_id IN ($1,$2)",[WS,OTHER]);
  await c.query("DELETE FROM yucer_gtm.strategy_plan WHERE workspace_id IN ($1,$2)",[WS,OTHER]);
  await c.query("DELETE FROM yucer_gtm.strategy_type WHERE workspace_id IN ($1,$2)",[WS,OTHER]);
});}

test("real database freezes type metadata and artwork, inherits revisions, and rejects cross-workspace types",{skip},async()=>{
  await cleanup();try{
    const store=new PrismaStrategyStore();const types=await store.listStrategyTypes(WS);
    assert.equal(types.length,5);const type=types[1];
    const first=await store.createPlan(WS,{name:"Expansion",planNo:"TYPE-2027",period:"2027",ownerSub:null,objective:"New markets",strategyTypeCode:type.code});
    assert.equal(first?.strategyType?.name,type.name);
    let row=(await store.getPlan(WS,first!.id))!;assert.equal(row.strategyType?.theme,type.theme);
    const version=await store.publishPlan(WS,row.id,{expectedEditToken:row.editToken!,actorSub:"owner",at:new Date(),solutions:[],ownerName:null});
    assert.equal(version.strategyType?.theme,type.theme);
    await store.saveStrategyType(WS,{...type,name:"Changed type",theme:"partner",enabled:false});
    assert.equal((await store.getPlan(WS,row.id))?.strategyType?.name,type.name);
    const revision=await store.createRevision(WS,row.id,"editor");
    assert.equal(revision.strategyTypeCode,type.code);assert.equal(revision.strategyType?.theme,"partner");
    await store.updatePlan(WS,revision.id,{strategyTypeCode:types[0].code,changeReason:"New direction"},{expectedEditToken:revision.editToken});
    row=(await store.getPlan(WS,revision.id))!;
    const v2=await store.publishPlan(WS,row.id,{expectedEditToken:row.editToken!,actorSub:"owner",at:new Date(),solutions:[],ownerName:null});
    assert.equal(v2.strategyType?.code,types[0].code);
    await assert.rejects(svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET strategy_type_code=$1 WHERE id=$2",[types[0].code,first!.id])),/immutable_strategy/);
    await assert.rejects(svc(c=>c.query("UPDATE yucer_gtm.strategy_type SET code='renamed' WHERE workspace_id=$1",[WS])),/permission denied/);
    await assert.rejects(svc(c=>c.query("DELETE FROM yucer_gtm.strategy_type WHERE workspace_id=$1",[WS])),/permission denied/);
    await assert.rejects(svc(c=>c.query("INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,plan_no,name,period,strategy_type_code) VALUES($1,$2,'DISABLED','Disabled','2027',$3)",[randomUUID(),WS,type.code])),/strategy_type_unavailable/);
    await assert.rejects(svc(c=>c.query("INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,plan_no,name,period,strategy_type_code) VALUES($1,$2,'CROSS','Other','2027',$3)",[randomUUID(),OTHER,types[0].code])),/strategy_type_unavailable|foreign key/);
  }finally{await cleanup();}
});

test("config seeding is concurrent-safe and preserves custom and disabled types",{skip},async()=>{
  await cleanup();try{
    const store=new PrismaStrategyStore();
    const results=await Promise.all([store.listStrategyTypes(WS),store.listStrategyTypes(WS)]);
    assert.equal(results[0].length,5);assert.equal(results[1].length,5);
    await store.saveStrategyType(WS,{...results[0][0],enabled:false,name:"Custom name"});
    const after=await store.listStrategyTypes(WS);
    assert.equal(after[0].enabled,false);assert.equal(after[0].name,"Custom name");
    assert.notEqual((await store.listStrategyTypes(OTHER))[0].name,"Custom name");
  }finally{await cleanup();}
});
