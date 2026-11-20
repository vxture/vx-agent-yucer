import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { readDiagnosticSource } from "./snapshot-source";
import { runStrategySnapshots } from "./snapshot-job";
import { PrismaStrategyStore } from "./prisma-store";
import { PrismaSalesPlanStore } from "../planning/plan-prisma-store";
import { emptyContent } from "../planning/plan-model";
import { changeSalesPlan, type SalesPlanContext } from "../planning/plan-service";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { currentPeriod, periodRange } from "../shared/period";
import { permissionsForRoles } from "../../authz/catalog";

const skip = !process.env.DATABASE_URL;
const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const PERIOD = currentPeriod(NOW);
const START = periodRange(PERIOD)!.start;
const PRIOR = new Date(START.getTime() - 1);
const FUTURE = new Date(NOW.getTime() + 86_400_000);
async function pg<T>(run: (c: Client) => Promise<T>) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try { return await run(c); } finally { await c.end(); }
}
async function fixture() {
  const ws = randomUUID(), other = randomUUID(), s1 = randomUUID(), s2 = randomUUID(), a1 = randomUUID(), a2 = randomUUID(), i1 = randomUUID(), i2 = randomUUID(), r1 = randomUUID(), r2 = randomUUID();
  await pg(async c => {
    for (const scope of [ws, other]) await c.query("INSERT INTO yucer_pipeline.stage_definition(workspace_id,stage_code,name,default_probability,is_won,is_terminal) VALUES($1,'qualify','Qualify',10,false,false),($1,'won','Won',100,true,true)",[scope]);
    await c.query("INSERT INTO yucer_core.industry(id,workspace_id,industry_code,name) VALUES($1,$3,'retail','Retail'),($2,$3,'manufacturing','Manufacturing')", [i1,i2,ws]);
    await c.query("INSERT INTO yucer_gtm.market_segment(id,workspace_id,segment_code,name,criteria,status) VALUES($1,$3,'M1','Retail market',$4,'active'),($2,$3,'M2','Factory market',$5,'active')", [s1,s2,ws,{industries:["Retail"],regions:[]},{industries:["Manufacturing"],regions:[]}]);
    await c.query("INSERT INTO yucer_core.account(id,workspace_id,account_no,name,industry_id,segment_id) VALUES($1,$3,'A1','Retail customer',$4,$6),($2,$3,'A2','Factory customer',$5,$7)", [a1,a2,ws,i1,i2,s2,s1]);
    await c.query("INSERT INTO yucer_gtm.territory(id,workspace_id,territory_code,name) VALUES($1,$3,'R1','Region one'),($2,$3,'R2','Region two')", [r1,r2,ws]);
    await c.query("INSERT INTO yucer_catalog.pricing_policy(workspace_id,default_currency) VALUES($1,'USD')", [ws]);
    const rows = [
      [a1,r1,"won","100.10","USD",START], [a2,r1,"open","200.20","USD",null],
      [a1,r1,"won","700.00","CNY",START], [a1,r1,"won","800.00","USD",PRIOR],
      [a1,r2,"won","900.00","USD",START], [a1,r1,"won","950.00","USD",FUTURE],
    ];
    for (const [n,row] of rows.entries()) await c.query("INSERT INTO yucer_pipeline.opportunity(workspace_id,opportunity_no,name,account_id,territory_id,status,amount,currency,closed_at,owner_sub,requirement,stage,forecast_category) VALUES($1,$2,'Diagnostic deal',$3,$4,$5,$6,$7,$8,'owner','Fixture requirement',CASE WHEN $5::varchar='won' THEN 'won' ELSE 'qualify' END,CASE WHEN $5::varchar='won' THEN 'closed' ELSE 'pipeline' END)", [ws,`OPP-${n}`,...row]);
    await c.query("INSERT INTO yucer_core.account(workspace_id,account_no,name) VALUES($1,'OTHER','Other workspace')",[other]);
    await c.query("INSERT INTO yucer_pipeline.opportunity(workspace_id,opportunity_no,name,account_id,status,amount,currency,closed_at,owner_sub,requirement,stage,forecast_category) SELECT $1,'OTHER','Other deal',id,'won',99999,'USD',now(),'owner','Other requirement','won','closed' FROM yucer_core.account WHERE workspace_id=$1",[other]);
  });
  return { ws, other, s1, s2, a1, r1 };
}

test("Postgres: real capture isolates markets and workspaces, currency and quarter, and records the publication", { skip }, async () => {
  const f = await fixture();
  const ctx: SalesPlanContext = { workspaceId: f.ws, sub: "ops", holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) }, entitlement: { ...EMPTY_ENTITLEMENT, product: "yucer", workspace_id: f.ws, tier: "enterprise" }, scope: { kind: "workspace" }, store: new PrismaSalesPlanStore() };
  const content = emptyContent(YEAR, [{ id: f.r1, divisionId: randomUUID(), code: "R1", name: "Region one", provinces: [], included: true, reason: "", ownerSub: null }], "USD");
  for (const t of content.targets) t.target = "1000.00";
  content.targets.push(...content.targets.map(t => ({ ...t, key: randomUUID(), period: PERIOD })));
  let plan = await changeSalesPlan(ctx, { year: YEAR, expectedEventNo: 0, requestKey: randomUUID(), command: { kind: "draft", content } });
  const rid = plan.revisions[0].id;
  plan = await changeSalesPlan(ctx, { year: YEAR, expectedEventNo: plan.events.at(-1)!.no, requestKey: randomUUID(), command: { kind: "release", revisionId: rid, editToken: 1, reason: "" } });
  const source = await readDiagnosticSource(f.ws);
  assert.equal(source.currency, "USD"); assert.equal(source.accounts.length, 2); assert.equal(source.deals.length, 6);
  const store = new PrismaStrategyStore();
  const capturedAt = new Date();
  const ledger = await runStrategySnapshots({ workspaces: [{ workspaceId: f.ws }], now: capturedAt, store });
  assert.equal(ledger.failed, 0); assert.equal(ledger.segmentSnapshots, 2); assert.equal(ledger.territorySnapshots, 2);
  const markets = await store.listSegmentCoverageSnapshots(f.ws, 10, { trustedOnly: true });
  const m1 = markets.find(r => r.segmentId === f.s1)!, m2 = markets.find(r => r.segmentId === f.s2)!;
  assert.deepEqual([m1.matchedAccountCount,m1.openPipelineAmount,m1.wonAmount], [1,0,1800.1]);
  assert.deepEqual([m2.matchedAccountCount,m2.openPipelineAmount,m2.wonAmount], [1,200.2,0]);
  const region = (await store.listTerritoryAttainmentSnapshots(f.ws, 10, { trustedOnly: true })).find(r => r.period === PERIOD)!;
  assert.equal(region.targetAmount,1000); assert.equal(region.attainedAmount,100.1); assert.equal(region.currency,"USD");
  assert.equal(region.basis?.kind === "published_plan" && region.basis.revisionId,rid);
  assert.equal((await store.listSegmentCoverageSnapshots(f.other,10)).length,0);
  await pg(c => c.query("UPDATE yucer_pipeline.opportunity SET closed_at=NULL WHERE workspace_id=$1 AND opportunity_no='OPP-0'",[f.ws]));
  await runStrategySnapshots({ workspaces:[{workspaceId:f.ws}], store, now: new Date(capturedAt.getTime()+1) });
  const incomplete = (await store.listTerritoryAttainmentSnapshots(f.ws,10,{trustedOnly:true})).find(r=>r.period===PERIOD)!;
  assert.equal(incomplete.attainedAmount,null,"a missing close date cannot be interpreted as zero revenue");
  await pg(c => c.query("INSERT INTO yucer_gtm.segment_coverage_snapshot(workspace_id,segment_id,snapshotted_at,matched_account_count,open_pipeline_amount,won_amount,currency) VALUES($1,$2,$3,999,999,999,'USD')",[f.ws,f.s1,new Date(capturedAt.getTime()+1000)]));
  assert.equal((await store.listSegmentCoverageSnapshots(f.ws,1))[0].matchedAccountCount,999);
  assert.notEqual((await store.listSegmentCoverageSnapshots(f.ws,1,{trustedOnly:true}))[0].matchedAccountCount,999,"filter before limit");
});

test("Postgres: nullable amounts preserve unknown and new basis remains append-only for the service role", { skip }, async () => {
  const f = await fixture();
  const store = new PrismaStrategyStore();
  await pg(async c => {
    await c.query("SET ROLE yucer_svc");
    try {
      await c.query("INSERT INTO yucer_gtm.segment_coverage_snapshot(workspace_id,segment_id,matched_account_count,open_pipeline_amount,won_amount) VALUES($1,$2,1,NULL,NULL)",[f.ws,f.s1]);
      await c.query("INSERT INTO yucer_gtm.territory_attainment_snapshot(workspace_id,territory_id,period,target_amount,attained_amount) VALUES($1,$2,'2026Q4',1000,NULL)",[f.ws,f.r1]);
      await assert.rejects(c.query("UPDATE yucer_gtm.segment_coverage_snapshot SET basis='{}' WHERE workspace_id=$1",[f.ws]),/permission denied/);
      await assert.rejects(c.query("UPDATE yucer_gtm.territory_attainment_snapshot SET attained_amount=0 WHERE workspace_id=$1",[f.ws]),/permission denied/);
    } finally { await c.query("RESET ROLE"); }
    await assert.rejects(c.query("INSERT INTO yucer_gtm.segment_coverage_snapshot(workspace_id,segment_id,matched_account_count,basis) VALUES($1,$2,1,'[]')",[f.ws,f.s1]),/chk_segment_snapshot_basis/);
  });
  const row = (await store.listSegmentCoverageSnapshots(f.ws,1))[0];
  assert.equal(row.openPipelineAmount,null); assert.equal(row.wonAmount,null); assert.equal(row.basis,null);
  assert.equal((await store.listSegmentCoverageSnapshots(f.ws,10,{trustedOnly:true})).length,0,"old rows are not implicitly upgraded");
  assert.equal((await store.listTerritoryAttainmentSnapshots(f.ws,1))[0].attainedAmount,null);
});

test("Postgres: incomplete close facts propagate through capture and do not become a zero market amount", { skip }, async () => {
  const f = await fixture();
  await pg(c => c.query("UPDATE yucer_pipeline.opportunity SET amount=NULL,closed_at=NULL WHERE workspace_id=$1 AND opportunity_no='OPP-0'",[f.ws]));
  const store = new PrismaStrategyStore();
  await runStrategySnapshots({ workspaces:[{workspaceId:f.ws}],store,now:NOW });
  const market = (await store.listSegmentCoverageSnapshots(f.ws,10,{trustedOnly:true})).find(r=>r.segmentId===f.s1)!;
  assert.equal(market.wonAmount,null);
  assert.equal(market.basis?.kind==='criteria' && market.basis.unpricedWon,1);
});
