import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { Client } from "pg";
import { emptyContent } from "./plan-model";
import type { StrategyAcceptance } from "./strategy-handoff";
const skip=!process.env.DATABASE_URL;
async function db(run:(c:Client)=>Promise<void>) {const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query("BEGIN");try{await run(c);}finally{await c.query("ROLLBACK");await c.end();}}
async function rejected(c:Client,sql:string,values:unknown[],pattern:RegExp){await c.query("SAVEPOINT refused");await assert.rejects(c.query(sql,values),pattern);await c.query("ROLLBACK TO SAVEPOINT refused");await c.query("RELEASE SAVEPOINT refused");}
async function seed(c:Client,metric:"channels"|"revenue"="channels"){
 const ws=id(),sid=id(),plan=id(),revision=id(),region=id(),objective=id();const year=new Date().getUTCFullYear();
 const expectation={id:objective,metric,amount:metric==="revenue"?"1000":"3",currency:metric==="revenue"?"CNY":null,criterion:"Signed and accepted"};
 await c.query("INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,plan_no,name,period,expectations) VALUES($1,$2,'STR-TEST','Retail',$3,$4)",[sid,ws,String(year),JSON.stringify([expectation])]);
 await c.query("SELECT yucer_gtm.publish_strategy_plan($1,$2,1,'owner',now())",[ws,sid]);
 const content=emptyContent(year,[{id:region,divisionId:id(),code:"E",name:"East",provinces:[],included:true,reason:"",ownerSub:"owner"}],"CNY");content.targets.forEach(t=>t.target="1000");
 content.targets.push({...content.targets[1]!,key:id(),period:`${year}Q1`,target:"1000"});
 const acceptance:StrategyAcceptance={key:id(),strategyId:sid,lineageId:sid,version:1,name:"Retail",period:String(year),expectation,amount:expectation.amount,ownerSub:"owner",note:"",allocations:[{key:id(),regionId:region,period:`${year}Q1`,amount:expectation.amount,ownerSub:"owner"}]};content.strategyAcceptances=[acceptance];
 await c.query("INSERT INTO yucer_gtm.sales_plan(id,workspace_id,year) VALUES($1,$2,$3)",[plan,ws,year]);
 await c.query("INSERT INTO yucer_gtm.sales_plan_revision(id,workspace_id,plan_id,content,created_by_sub) VALUES($1,$2,$3,$4,'owner')",[revision,ws,plan,JSON.stringify(content)]);
 return {ws,sid,plan,revision,region,objective,content,acceptance,year};
}
test("Postgres: expectations are frozen in publication and copied into revision drafts",{skip},async()=>db(async c=>{
 const f=await seed(c);const r=await c.query("SELECT published_snapshot->'expectations' AS doc FROM yucer_gtm.strategy_plan WHERE id=$1",[f.sid]);assert.deepEqual(r.rows[0].doc,[f.acceptance.expectation]);
 await c.query("SET LOCAL ROLE yucer_svc");await rejected(c,"UPDATE yucer_gtm.strategy_plan SET expectations='[]' WHERE id=$1",[f.sid],/immutable_strategy/);await c.query("RESET ROLE");
 const revision=await c.query("SELECT yucer_gtm.revise_strategy_plan($1,$2,'owner') AS id",[f.ws,f.sid]);const copied=await c.query("SELECT expectations FROM yucer_gtm.strategy_plan WHERE id=$1",[revision.rows[0].id]);assert.deepEqual(copied.rows[0].expectations,[f.acceptance.expectation]);
}));
test("Postgres: client snapshots and cross-workspace strategic references cannot be forged",{skip},async()=>db(async c=>{
 const f=await seed(c);await c.query("SET LOCAL ROLE yucer_svc");
 for(const patch of [{name:"Forged"},{strategyId:id()},{version:2}]){const content=structuredClone(f.content);Object.assign(content.strategyAcceptances![0]!,patch);await rejected(c,"UPDATE yucer_gtm.sales_plan_revision SET content=$2 WHERE id=$1",[f.revision,JSON.stringify(content)],/strategy_source_changed/);}
}));
test("Postgres: acceptance capacity and calendar overlap are enforced below services",{skip},async()=>db(async c=>{
 const f=await seed(c,"revenue");const tooMuch=structuredClone(f.content);tooMuch.strategyAcceptances![0]!.amount="1001";
 await rejected(c,"UPDATE yucer_gtm.sales_plan_revision SET content=$2 WHERE id=$1",[f.revision,JSON.stringify(tooMuch)],/strategy_overallocated/);
 assert.equal((await c.query("SELECT yucer_gtm.strategy_execution_window('2026-Q3') @> DATE '2026-07-01' AS inside")).rows[0].inside,true);
 assert.equal((await c.query("SELECT yucer_gtm.strategy_execution_window('2026-Q3') @> DATE '2026-10-01' AS inside")).rows[0].inside,false);
}));
test("Postgres: milestone evidence is append-only, deduplicated, scoped and revocable",{skip},async()=>db(async c=>{
 const f=await seed(c);await c.query("UPDATE yucer_gtm.sales_plan_revision SET state='sealed',version_no=1,content_hash=$2,sealed_by_sub='owner',sealed_at=now() WHERE id=$1",[f.revision,"a".repeat(64)]);
 const record=id();const args=[record,f.ws,f.plan,f.revision,f.acceptance.key,f.sid,f.objective,f.acceptance.allocations[0]!.key,f.region,`${f.year}-01-10`];
 const insert="INSERT INTO yucer_gtm.strategic_result(id,workspace_id,plan_id,revision_id,acceptance_key,lineage_id,objective_id,allocation_key,region_id,achieved_on,evidence_url,note,actor_sub) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'https://example.com/signed','Signed','owner')";
 await c.query("SET LOCAL ROLE yucer_svc");await c.query(insert,args);
 await rejected(c,insert,[id(),...args.slice(1)],/duplicate key/);
 await rejected(c,"UPDATE yucer_gtm.strategic_result SET note='rewrite' WHERE id=$1",[record],/permission denied/);
 await rejected(c,"DELETE FROM yucer_gtm.strategic_result WHERE id=$1",[record],/permission denied/);
 await rejected(c,insert,[id(),id(),...args.slice(2)],/strategy_result_invalid|foreign key/);
 const undo="INSERT INTO yucer_gtm.strategic_result(id,workspace_id,plan_id,revision_id,acceptance_key,lineage_id,objective_id,allocation_key,region_id,achieved_on,evidence_url,note,actor_sub,voids_id) SELECT $1,workspace_id,plan_id,revision_id,acceptance_key,lineage_id,objective_id,allocation_key,region_id,achieved_on,evidence_url,'Correction','owner',id FROM yucer_gtm.strategic_result WHERE id=$2";
 await c.query(undo,[id(),record]);await rejected(c,undo,[id(),record],/duplicate key/);
}));

test("Postgres: closed strategic period slice detects allocation changes without freezing future annual basis",{skip},async()=>db(async c=>{
 const f=await seed(c);const next=structuredClone(f.content);next.strategyAcceptances![0]!.amount="4";next.strategyAcceptances![0]!.note="Future basis";
 const compare=async()=> (await c.query("SELECT yucer_gtm.sales_plan_closed_slice($1,$3) IS NOT DISTINCT FROM yucer_gtm.sales_plan_closed_slice($2,$3) AS same",[JSON.stringify(f.content),JSON.stringify(next),`${f.year}Q1`])).rows[0].same;
 assert.equal(await compare(),true);next.strategyAcceptances![0]!.allocations[0]!.amount="2";assert.equal(await compare(),false);
}));
