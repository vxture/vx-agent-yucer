import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { PrismaStrategyStore } from "./prisma-store";
import { createPlan } from "./service";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { unwrap } from "../shared/result";

const skip=process.env.DATABASE_URL ? false : "no DATABASE_URL";
const ddl=fileURLToPath(new URL("../../../../../deploy/database/ddl/",import.meta.url));

// Rehearse against a separate real database so no concurrent test observes a
// temporarily old schema. Replay the same baseline/increment order as db-init.
test("0140 migrates all lineages, reserves former codes and preserves publications and UUID attribution",{skip},async()=>{
  const database=`yucer_number_${randomUUID().replaceAll("-","")}`;
  const admin=new Client({connectionString:process.env.DATABASE_URL});await admin.connect();
  let c:Client|undefined;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    const url=new URL(process.env.DATABASE_URL!);url.pathname=`/${database}`;
    c=new Client({connectionString:url.toString()});await c.connect();
    for(const file of ["00_baseline.sql","97_service_role.sql","98_column_locks.sql"])await c.query(await readFile(`${ddl}/${file}`,"utf8"));
    const increments=(await readdir(`${ddl}/incr`)).filter(x=>x.endsWith(".sql")).sort();
    for(const file of increments.filter(x=>x<"0140"))await c.query(await readFile(`${ddl}/incr/${file}`,"utf8"));
    const ws=randomUUID(),other=randomUUID(),root=randomUUID(),second=randomUUID(),foreign=randomUUID(),campaign=randomUUID();
    const day="2026-11-25T16:30:00Z";
    await c.query("INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,plan_no,name,period,created_at) VALUES($1,$2,'PLAN-2027-001','Published strategy','2027',$3),($4,$2,'STR-20261126-009','Reserved daily code','2027-Q1',$3),($5,$6,'PLAN-2027-001','Other workspace','2027',$3)",[root,ws,day,second,foreign,other]);
    await c.query("SELECT yucer_gtm.publish_strategy_plan($1,$2,1,'publisher',now())",[ws,root]);
    const draft=(await c.query("SELECT yucer_gtm.revise_strategy_plan($1,$2,'editor') id",[ws,root])).rows[0].id;
    await c.query("INSERT INTO yucer_gtm.campaign(id,workspace_id,campaign_no,name,plan_id) VALUES($1,$2,'CAMP-MIGRATION','Historical campaign',$3)",[campaign,ws,root]);
    const before=(await c.query("SELECT * FROM yucer_gtm.strategy_plan ORDER BY id")).rows;
    const events=(await c.query("SELECT * FROM yucer_gtm.strategy_plan_event ORDER BY id")).rows;
    await c.query(await readFile(`${ddl}/incr/0140_strategy_number_alias.sql`,"utf8"));
    const after=(await c.query("SELECT * FROM yucer_gtm.strategy_plan ORDER BY id")).rows;
    assert.equal(after.length,before.length);
    for(const old of before){
      const current=after.find(x=>x.id===old.id)!;
      const {plan_no:oldNumber,...oldFields}=old;const {plan_no:newNumber,...newFields}=current;
      assert.deepEqual(newFields,oldFields,"all fields except the business number stay byte-equivalent");
      assert.match(newNumber,/^STR-20261126-\d{3,}$/);assert.notEqual(newNumber,oldNumber);
    }
    assert.equal(after.find(x=>x.id===root).plan_no,after.find(x=>x.id===draft).plan_no);
    assert.equal(after.filter(x=>x.workspace_id===ws && x.base_plan_id===null).every(x=>Number(x.plan_no.split("-").at(-1))>9),true);
    assert.equal(after.find(x=>x.id===foreign).plan_no,"STR-20261126-001");
    assert.deepEqual((await c.query("SELECT * FROM yucer_gtm.strategy_plan_event ORDER BY id")).rows,events);
    assert.equal((await c.query("SELECT plan_id FROM yucer_gtm.campaign WHERE id=$1",[campaign])).rows[0].plan_id,root);
    assert.equal((await c.query("SELECT lineage_id FROM yucer_gtm.strategy_number_alias WHERE workspace_id=$1 AND legacy_no='PLAN-2027-001'",[ws])).rows[0].lineage_id,root);
    await c.query("SET ROLE yucer_svc");
    await assert.rejects(c.query("INSERT INTO yucer_gtm.strategy_plan(workspace_id,plan_no,name,period) VALUES($1,'PLAN-2027-001','Reuse old number','2027')",[ws]),/strategy_plan_no_reserved/);
    await assert.rejects(c.query("UPDATE yucer_gtm.strategy_plan SET plan_no='CHANGED' WHERE id=$1",[root]),/permission denied|immutable_identity/);
    await assert.rejects(c.query("DELETE FROM yucer_gtm.strategy_number_alias WHERE workspace_id=$1",[ws]),/permission denied/);
    await assert.rejects(c.query("INSERT INTO yucer_gtm.strategy_number_alias(workspace_id,legacy_no,lineage_id) VALUES($1,'FAKE',$2)",[ws,root]),/permission denied/);
    await c.query("RESET ROLE");
    await c.query("UPDATE yucer_gtm.strategy_plan SET change_reason='Publish after renumbering' WHERE id=$1",[draft]);
    await c.query("SELECT yucer_gtm.publish_strategy_plan($1,$2,2,'publisher',now())",[ws,draft]);
    assert.equal((await c.query("SELECT version_no FROM yucer_gtm.strategy_plan WHERE id=$1",[draft])).rows[0].version_no,2);
    assert.equal((await c.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='yucer_gtm.strategy_plan'::regclass AND tgname='strategy_plan_guard'")).rows[0].tgenabled,"O");
  } finally {
    await c?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);await admin.end();
  }
});

test("Prisma exposes former numbers on every revision and allocation cannot reuse them",{skip},async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
  const ws=randomUUID(),foreign=randomUUID(),root=randomUUID();
  try {
    await c.query("INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,plan_no,name,period) VALUES($1,$2,'STR-20261126-001','Retained strategy','2027')",[root,ws]);
    await c.query("INSERT INTO yucer_gtm.strategy_number_alias(workspace_id,legacy_no,lineage_id) VALUES($1,'PLAN-2027-001',$2)",[ws,root]);
    const store=new PrismaStrategyStore();
    const original=await store.getPlan(ws,root);assert.deepEqual(original?.previousNumbers,["PLAN-2027-001"]);
    assert.equal(await store.getPlan(foreign,root),null);assert.deepEqual(await store.listPlans(foreign),[]);
    const input={planNo:"PLAN-2027-001",name:"Reuse attempt",period:"2027",objective:null,ownerSub:null};
    assert.equal(await store.createPlan(ws,input),null);
    await c.query("SELECT yucer_gtm.publish_strategy_plan($1,$2,1,'publisher',now())",[ws,root]);
    const draft=await store.createRevision(ws,root,"editor");assert.deepEqual(draft.previousNumbers,["PLAN-2027-001"]);
    assert.equal((await store.listPlans(ws)).every(p=>p.previousNumbers?.includes("PLAN-2027-001")),true);
    const ctx={workspaceId:ws,sub:"creator",store,holder:{permissions:new Set(permissionsForRoles(["sales_leader"]))},entitlement:{...EMPTY_ENTITLEMENT,product:"yucer",workspace_id:ws,tier:"business" as const}};
    const automatic=unwrap(await createPlan(ctx,{...input,planNo:""},{autoNumber:true}));assert.match(automatic.planNo,/^STR-\d{8}-\d{3,}$/);
  } finally {
    await c.query("DELETE FROM yucer_gtm.strategy_number_alias WHERE workspace_id=$1",[ws]);
    await c.query("DELETE FROM yucer_gtm.strategy_plan_event WHERE workspace_id=$1",[ws]);
    await c.query("DELETE FROM yucer_gtm.strategy_plan WHERE workspace_id=$1",[ws]);
    await c.query("DELETE FROM yucer_gtm.strategy_option WHERE workspace_id IN ($1,$2)",[ws,foreign]);
    await c.end();
  }
});
