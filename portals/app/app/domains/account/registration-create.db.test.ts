import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaAccountStore } from "./prisma-store";
import { AccountHierarchyError } from "./lib/parent";
const skip=process.env.DATABASE_URL?false:"no DATABASE_URL - see ci.yml db-contract";
const WS="7accade0-0000-0000-0000-000000000011";
const basics={name:"Hierarchy create",region:null,province:null,industryId:null,segmentId:null,customerTypeId:null,customerSizeId:null,customerNatureId:null,creditCode:null,website:null,employeeCount:null,ownerSub:"owner"};
async function database(run:(pg:Client,store:PrismaAccountStore)=>Promise<void>){
 // Offline CI intentionally skips DB tests without generating a Prisma client.
 const { PrismaClient } = await import("@prisma/client");
 const pg=new Client({connectionString:process.env.DATABASE_URL});await pg.connect();
 // Execute the actual adapter with production column grants, never admin grants.
 const url=new URL(process.env.DATABASE_URL!);url.searchParams.set("options","-c role=yucer_svc");
 const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
 const clean=async()=>{await pg.query("DELETE FROM yucer_core.account_plan WHERE workspace_id=$1",[WS]);await pg.query("DELETE FROM yucer_core.account WHERE workspace_id=$1",[WS]);};
 try{await clean();await run(pg,new PrismaAccountStore(async()=>prisma));}finally{await clean();await prisma.$disconnect();await pg.end();}
}
const hierarchyCode=(code:string)=>(e:unknown)=>e instanceof AccountHierarchyError&&e.code===code;

test("registration atomically persists parent and confirmed child reassignment with service grants",{skip},async()=>{
 await database(async(pg,store)=>{
  const parent=await store.createAccount(WS,{...basics,name:"Parent"});
  const child=await store.createAccount(WS,{...basics,name:"Child",ownerSub:"child-owner",parentId:parent.id});
  await pg.query("UPDATE yucer_core.account SET updated_at=now()-interval '1 day' WHERE id=$1",[child.id]);
  const made=await store.createAccount(WS,{...basics,parentId:parent.id,childLinks:[{accountId:child.id,expectedParentId:parent.id}]});
  const rows=(await pg.query("SELECT id,parent_id,owner_sub,updated_at FROM yucer_core.account WHERE workspace_id=$1",[WS])).rows;
  assert.equal(rows.find(a=>a.id===made.id).parent_id,parent.id);
  assert.equal(rows.find(a=>a.id===child.id).parent_id,made.id);
  assert.equal(rows.find(a=>a.id===child.id).owner_sub,"child-owner");
  assert.ok(Date.now()-new Date(rows.find(a=>a.id===child.id).updated_at).getTime()<10000);
 });
});

test("stale, foreign, cyclic and failed-plan registrations leave customer and child rows unchanged",{skip},async()=>{
 await database(async(pg,store)=>{
  const parent=await store.createAccount(WS,{...basics,name:"Parent"});
  const child=await store.createAccount(WS,{...basics,name:"Child",parentId:parent.id});
  await assert.rejects(store.createAccount(WS,{...basics,childLinks:[{accountId:child.id,expectedParentId:null}]}),hierarchyCode("hierarchy_changed"));
  await assert.rejects(store.createAccount(WS,{...basics,parentId:child.id,childLinks:[{accountId:parent.id,expectedParentId:null}]}),hierarchyCode("parent_cycle"));
  await assert.rejects(store.createAccount(WS,{...basics,parentId:"7accade0-0000-0000-0000-000000000099"}),hierarchyCode("parent_not_found"));
  await assert.rejects(store.createAccount(WS,{...basics,tier:"strategic",childLinks:[{accountId:child.id,expectedParentId:parent.id}],
   plan:{period:"Y2026",targetAmount:1e30,contactCadenceDays:14,execCadenceDays:60,ownerSub:"owner",presalesSub:null,deliverySub:null,status:"active"}}));
  assert.equal(Number((await pg.query("SELECT count(*) FROM yucer_core.account WHERE workspace_id=$1",[WS])).rows[0].count),2);
  assert.equal((await store.getAccount(WS,child.id))?.parentId,parent.id);
  assert.equal((await pg.query("SELECT id FROM yucer_core.account_plan WHERE workspace_id=$1",[WS])).rowCount,0);
 });
});

test("concurrent ancestry updates cannot produce a cycle; concurrent child claims have one winner",{skip},async()=>{
 await database(async(_pg,store)=>{
  const a=await store.createAccount(WS,{...basics,name:"A"});const b=await store.createAccount(WS,{...basics,name:"B"});
  const moves=await Promise.allSettled([store.updateAccount(WS,a.id,{parentId:b.id}),store.updateAccount(WS,b.id,{parentId:a.id})]);
  assert.equal(moves.filter(r=>r.status==="fulfilled").length,1);
  const failed=moves.find(r=>r.status==="rejected");assert.ok(failed?.status==="rejected"&&hierarchyCode("parent_cycle")(failed.reason));
  const child=await store.createAccount(WS,{...basics,name:"Claimed child"});
  const claims=await Promise.allSettled([store.createAccount(WS,{...basics,name:"New parent A",childLinks:[{accountId:child.id,expectedParentId:null}]}),store.createAccount(WS,{...basics,name:"New parent B",childLinks:[{accountId:child.id,expectedParentId:null}]})]);
  assert.equal(claims.filter(r=>r.status==="fulfilled").length,1);
  assert.ok((await store.getAccount(WS,child.id))?.parentId);
 });
});
