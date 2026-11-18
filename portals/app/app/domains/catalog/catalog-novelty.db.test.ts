import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Client} from "pg";

const skip=process.env.DATABASE_URL?false:"no DATABASE_URL";
test("catalog novelty is writable only at its owning records and is included in strategy snapshots",{skip},async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
  try {
    await c.query("BEGIN");
    const ws=randomUUID(),unit=randomUUID(),status=randomUUID(),product=randomUUID(),solution=randomUUID(),plan=randomUUID();
    await c.query("INSERT INTO yucer_catalog.product_unit(id,workspace_id,unit_code,name) VALUES($1,$2,'set','Set')",[unit,ws]);
    await c.query("INSERT INTO yucer_catalog.product_status(id,workspace_id,status_code,name) VALUES($1,$2,'active','Active')",[status,ws]);
    await c.query("INSERT INTO yucer_catalog.product(id,workspace_id,product_code,name,unit_id,status_id) VALUES($1,$2,'PRD-TEST','POS',$3,$4)",[product,ws,unit,status]);
    await c.query("INSERT INTO yucer_catalog.solution(id,workspace_id,solution_code,name) VALUES($1,$2,'SOL-TEST','Retail package')",[solution,ws]);
    await c.query("INSERT INTO yucer_gtm.strategy_plan(id,workspace_id,plan_no,name,period) VALUES($1,$2,'PLAN-TEST','Plan','2099')",[plan,ws]);
    await c.query("INSERT INTO yucer_gtm.strategy_plan_product(workspace_id,plan_id,product_id) VALUES($1,$2,$3)",[ws,plan,product]);
    await c.query("INSERT INTO yucer_gtm.strategy_plan_solution(workspace_id,plan_id,solution_id) VALUES($1,$2,$3)",[ws,plan,solution]);
    await c.query("SET LOCAL ROLE yucer_svc");
    assert.equal((await c.query("SELECT novelty FROM yucer_catalog.product WHERE id=$1",[product])).rows[0].novelty,null);
    await c.query("UPDATE yucer_catalog.product SET novelty='new' WHERE id=$1 AND workspace_id=$2",[product,ws]);
    await c.query("UPDATE yucer_catalog.solution SET novelty='existing' WHERE id=$1 AND workspace_id=$2",[solution,ws]);
    await c.query("RESET ROLE");
    const snap=(await c.query("SELECT yucer_gtm.strategy_version_snapshot($1,$2) AS value",[ws,plan])).rows[0].value;
    assert.equal(snap.products[0].novelty,"new");assert.equal(snap.solutions[0].novelty,"existing");
    await c.query("SET LOCAL ROLE yucer_svc");
    await c.query("SAVEPOINT bad_attribute");
    await assert.rejects(c.query("UPDATE yucer_catalog.product SET novelty='guessed' WHERE id=$1",[product]),/check constraint/);
    await c.query("ROLLBACK TO SAVEPOINT bad_attribute");
    await c.query("UPDATE yucer_catalog.product SET novelty='existing' WHERE id=$1",[product]);
    assert.equal(snap.products[0].novelty,"new");
  } finally {await c.query("ROLLBACK");await c.end();}
});
