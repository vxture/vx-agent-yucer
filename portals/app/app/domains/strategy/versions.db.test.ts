import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PrismaStrategyStore } from "./prisma-store";
import { StrategyVersionError } from "./store";

const skip=process.env.DATABASE_URL?false:"no DATABASE_URL";
const WS="eeeeeeee-1010-0000-0000-000000000001";
const OTHER="eeeeeeee-1010-0000-0000-000000000002";
const AT=new Date("2026-11-14T20:00:00Z");
async function pg<T>(run:(c:Client)=>Promise<T>,role=false):Promise<T>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();try{if(role)await c.query("SET ROLE yucer_svc");return await run(c);}finally{await c.end();}}
const svc=<T>(run:(c:Client)=>Promise<T>)=>pg(run,true);
async function cleanup(){await pg(async c=>{
  await c.query("DELETE FROM yucer_gtm.strategy_plan_event WHERE workspace_id IN ($1,$2)",[WS,OTHER]);
  await c.query("DELETE FROM yucer_gtm.campaign WHERE workspace_id IN ($1,$2)",[WS,OTHER]);
  await c.query("DELETE FROM yucer_gtm.strategy_plan WHERE workspace_id IN ($1,$2)",[WS,OTHER]);
  await c.query("DELETE FROM yucer_catalog.solution WHERE workspace_id IN ($1,$2)",[WS,OTHER]);
  await c.query("DELETE FROM yucer_gtm.market_segment WHERE workspace_id IN ($1,$2)",[WS,OTHER]);
});}
async function initial(){const id=randomUUID();await svc(c=>c.query("INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,plan_no,name,period,created_by_sub) VALUES($1,$2,'VERSION-2026','Original strategy','2026','creator')",[id,WS]));return id;}
const publish=(id:string,token:number,actor="publisher")=>svc(c=>c.query("SELECT yucer_gtm.publish_strategy_plan($1,$2,$3,$4,$5) AS id",[WS,id,token,actor,AT]));
const revise=(id:string)=>svc(c=>c.query("SELECT yucer_gtm.revise_strategy_plan($1,$2,'reviser') AS id",[WS,id]));
async function row(id:string){return pg(async c=>(await c.query("SELECT * FROM yucer_gtm.strategy_plan WHERE id=$1",[id])).rows[0]);}

test("service-role publication is atomic, creates frozen version snapshots, and retains historical attribution",{skip},async()=>{
  await cleanup();try{
    const id=await initial();const solution=randomUUID();const market=randomUUID();const campaign=randomUUID();
    await pg(async c=>{
      await c.query("INSERT INTO yucer_catalog.solution(id,workspace_id,solution_code,name) VALUES($1,$2,'SOL-V1','Original solution')",[solution,WS]);
      await c.query("INSERT INTO yucer_gtm.market_segment(id,workspace_id,segment_code,name,criteria) VALUES($1,$2,'MARKET-V1','Original market',$3)",[market,WS,{industries:["retail"],regions:[]}]);
      await c.query("INSERT INTO yucer_gtm.strategy_plan_solution VALUES($1,$2,$3)",[WS,id,solution]);
      await c.query("INSERT INTO yucer_gtm.strategy_plan_market(workspace_id,plan_id,segment_id,intent,market_name,criteria) VALUES($1,$2,$3,'focus','Original market',$4)",[WS,id,market,{industries:["retail"],regions:[]}]);
    });
    await publish(id,1);
    for (const table of ["strategy_plan_solution", "strategy_plan_market"]) {
      await assert.rejects(svc(c => c.query(`DELETE FROM yucer_gtm.${table} WHERE plan_id=$1`, [id])), /immutable_strategy/);
    }
    const original=await row(id);assert.equal(original.version_no,1);assert.equal(original.published_snapshot.solutions[0].name,"Original solution");
    await svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET status='active' WHERE id=$1",[id]));
    await pg(c=>c.query("INSERT INTO yucer_gtm.campaign(id,workspace_id,campaign_no,name,plan_id) VALUES($1,$2,'CAMP-V1','Historical campaign',$3)",[campaign,WS,id]));
    const draft=(await revise(id)).rows[0].id;
    await svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET name='Second strategy',change_reason='Successful pilot expansion' WHERE id=$1",[draft]));
    await pg(c=>c.query("UPDATE yucer_catalog.solution SET name='New solution name' WHERE id=$1",[solution]));
    assert.equal((await row(id)).published_snapshot.solutions[0].name,"Original solution");
    await publish(draft,2);const next=await row(draft);assert.equal(next.version_no,2);assert.equal(next.status,"active");assert.equal(next.base_plan_id,id);assert.equal(next.plan_no,original.plan_no);
    assert.equal(next.published_snapshot.solutions[0].name,"New solution name");assert.equal((await row(id)).status,"closed");
    assert.equal((await pg(c=>c.query("SELECT plan_id FROM yucer_gtm.campaign WHERE id=$1",[campaign]))).rows[0].plan_id,id);
    assert.equal((await row(id)).published_snapshot.name,"Original strategy");
    await publish(draft,2,"retry-actor");assert.equal((await row(draft)).published_by_sub,"publisher");
    assert.equal((await pg(c=>c.query("SELECT count(*)::int n FROM yucer_gtm.strategy_plan_event WHERE plan_id=$1 AND kind='publish'",[draft]))).rows[0].n,1);
    await assert.rejects(revise(id),/strategy_not_revisable/);
    const third=(await revise(draft)).rows[0].id;assert.equal((await row(third)).lineage_id,id);
  }finally{await cleanup();}
});

test("two revisions and two publications serialize to one draft and one version",{skip},async()=>{
  await cleanup();try{
    const id=await initial();await publish(id,1);
    const results=await Promise.all([revise(id),revise(id)]);const draft=results[0].rows[0].id;assert.equal(results[1].rows[0].id,draft);
    await svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET change_reason='Concurrent release' WHERE id=$1",[draft]));
    await Promise.all([publish(draft,2),publish(draft,2)]);
    assert.equal((await row(draft)).version_no,2);
    assert.equal((await pg(c=>c.query("SELECT count(*)::int n FROM yucer_gtm.strategy_plan_event WHERE plan_id=$1 AND kind='publish'",[draft]))).rows[0].n,1);
  }finally{await cleanup();}
});

test("stale save/publication and failed publication do not leave partial changes or events",{skip},async()=>{
  await cleanup();try{
    const id=await initial();await publish(id,1);const draft=(await revise(id)).rows[0].id;
    await assert.rejects(publish(draft,1),/strategy_reason_required/);
    assert.equal((await row(id)).status,"approved");assert.equal((await row(draft)).version_no,null);
    await svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET change_reason='First edit' WHERE id=$1 AND edit_token=1",[draft]));
    const stale=await svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET name='Stale overwrite' WHERE id=$1 AND edit_token=1",[draft]));assert.equal(stale.rowCount,0);
    await assert.rejects(publish(draft,1),/strategy_draft_conflict/);
    const race=await Promise.allSettled([publish(draft,2),svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET name='Fresh edit' WHERE id=$1 AND edit_token=2 AND status='draft'",[draft]))]);
    const after=await row(draft);
    if(after.version_no){assert.equal(after.published_snapshot.name,"Original strategy");assert.equal(race[1].status==="fulfilled" && race[1].value.rowCount,0);}
    else{assert.equal(after.name,"Fresh edit");assert.equal(race[0].status,"rejected");}
  }finally{await cleanup();}
});

test("published fields, selection rows, identity and events are frozen for the actual service role",{skip},async()=>{
  await cleanup();try{
    const id=await initial();await publish(id,1);
    for(const sql of ["UPDATE yucer_gtm.strategy_plan SET name='Mutated' WHERE id=$1","UPDATE yucer_gtm.strategy_plan SET status='draft' WHERE id=$1","UPDATE yucer_gtm.strategy_plan SET version_no=88 WHERE id=$1","UPDATE yucer_gtm.strategy_plan SET published_snapshot='{}' WHERE id=$1","DELETE FROM yucer_gtm.strategy_plan WHERE id=$1"]){await assert.rejects(svc(c=>c.query(sql,[id])),/immutable_strategy|permission denied/);}
    await assert.rejects(svc(c=>c.query("INSERT INTO yucer_gtm.strategy_plan_market(workspace_id,plan_id,segment_id,market_name,criteria) VALUES($1,$2,$3,'Tampered','{}')",[WS,id,randomUUID()])),/immutable_strategy/);
    await assert.rejects(svc(c=>c.query("DELETE FROM yucer_gtm.strategy_plan_event WHERE plan_id=$1",[id])),/permission denied/);
    await assert.rejects(svc(c=>c.query("UPDATE yucer_gtm.strategy_plan_event SET reason='edited' WHERE plan_id=$1",[id])),/permission denied/);
    const draft=(await revise(id)).rows[0].id;
    await assert.rejects(svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET status='approved' WHERE id=$1",[draft])),/controlled_release_required/);
    await assert.rejects(svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET created_by_sub='spoofed' WHERE id=$1",[draft])),/permission denied/);
    await assert.rejects(svc(c=>c.query("UPDATE yucer_gtm.strategy_plan SET edit_token=999 WHERE id=$1",[draft])),/permission denied/);
    await assert.rejects(svc(c=>c.query("INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,lineage_id,base_plan_id,plan_no,name,period) VALUES($1,$2,$3,$3,'VERSION-2026','Bypass','2026')",[randomUUID(),WS,id])),/controlled_release_required/);
    await assert.rejects(svc(c=>c.query("SELECT yucer_gtm.publish_strategy_plan($1,$2,1,'actor',$3)",[OTHER,id,AT])),/strategy_not_found/);
    await assert.rejects(svc(c=>c.query("SELECT yucer_gtm.revise_strategy_plan($1,$2,'actor')",[OTHER,id])),/strategy_not_found/);
  }finally{await cleanup();}
});

test("discard is idempotent and permits a fresh revision while retaining the current publication",{skip},async()=>{
  await cleanup();try{
    const id=await initial();await publish(id,1);const draft=(await revise(id)).rows[0].id;
    await assert.rejects(svc(c=>c.query("SELECT yucer_gtm.discard_strategy_draft($1,$2,2,'actor')",[WS,draft])),/strategy_draft_conflict/);
    await svc(c=>c.query("SELECT yucer_gtm.discard_strategy_draft($1,$2,1,'actor')",[WS,draft]));
    await svc(c=>c.query("SELECT yucer_gtm.discard_strategy_draft($1,$2,1,'actor')",[WS,draft]));
    assert.equal((await row(id)).status,"approved");assert.equal((await row(draft)).status,"archived");
    assert.notEqual((await revise(id)).rows[0].id,draft);
    assert.equal((await pg(c=>c.query("SELECT count(*)::int n FROM yucer_gtm.strategy_plan_event WHERE plan_id=$1 AND kind='discard'",[draft]))).rows[0].n,1);
  }finally{await cleanup();}
});

test("Prisma version adapter round-trips snapshots and translates database conflicts",{skip},async()=>{
  await cleanup();try{
    const s=new PrismaStrategyStore();const p=(await s.createPlan(WS,{planNo:"VERSION-2026",name:"From Prisma",period:"2026",objective:null,ownerSub:null,createdBySub:"creator"}))!;
    const command={expectedEditToken:1,actorSub:"publisher",at:AT,solutions:[],ownerName:null};
    const v1=await s.publishPlan(WS,p.id,command);assert.equal(v1.versionNo,1);assert.equal(v1.publishedSnapshot?.name,"From Prisma");
    const draft=await s.createRevision(WS,v1.id,"reviser");assert.equal(draft.basePlanId,p.id);assert.equal(draft.editToken,1);
    await assert.rejects(s.publishPlan(WS,draft.id,command),(e:unknown)=>e instanceof StrategyVersionError && e.code==="strategy_reason_required");
    assert.equal(await s.updatePlan(WS,draft.id,{changeReason:"Update"},{expectedEditToken:1,expectedStatus:"draft"}),true);
    assert.equal(await s.updatePlan(WS,draft.id,{name:"Stale"},{expectedEditToken:1}),false);
    await assert.rejects(s.publishPlan(WS,draft.id,command),(e:unknown)=>e instanceof StrategyVersionError && e.code==="strategy_draft_conflict");
    const v2=await s.publishPlan(WS,draft.id,{...command,expectedEditToken:2});assert.equal(v2.versionNo,2);
    const again=await s.createRevision(WS,v2.id,"third");const abandoned=await s.discardDraft(WS,again.id,1,"third");assert.equal(abandoned.status,"archived");
  }finally{await cleanup();}
});
