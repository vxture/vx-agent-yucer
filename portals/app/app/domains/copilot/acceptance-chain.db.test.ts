import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";
import { PrismaTaskStore } from "./task-prisma-store";
import { PrismaCopilotStore } from "./prisma-store";
import { continueExecution, executeStep, grantExecution, proposeExecution, readExecutions, type ExecutionContext } from "./execution-service";
import { writeBusinessForm, type BusinessReceipt } from "./execution-domain";
import { mergeForm, type FormModule } from "./lib/business-form";
import { TASK_RULE_VERSION, type TaskObject } from "./lib/task-contract";
import { readPrivateTask, type TaskContext } from "./task-service";
import { readTaskSource } from "../../api/copilot/tasks/context";
import { businessBindings } from "../../api/copilot/tasks/business";
import type { AppSession } from "../../(app)/lib/session";
import { PERM_CODES } from "../../authz/catalog";
import { getAuthzStore } from "../../authz/store";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { getAccountStore, getCatalogStore, getStrategyStore, getSalesPlanStore } from "../shared/registry";
import { listProductUnits, upsertProduct } from "../catalog/service";
import { emptyStrategyResult } from "../strategy/lib/strategy-result";
import { emptyContent, planVersions } from "../planning/plan-model";
import { unwrap } from "../shared/result";
const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL";

test("isolated native chain links market, solution, strategy publication and company-plan commitment through UUID receipts", {skip}, async()=>{
  const pg=new Client({connectionString:process.env.TEST_ADMIN_DATABASE_URL??process.env.DATABASE_URL});await pg.connect();
  const workspaceId=randomUUID(),otherWorkspace=randomUUID();
  const session={workspaceId,user:{sub:"xy05-owner"},scope:{kind:"workspace"},authz:{permissions:new Set(PERM_CODES)},entitlement:{...EMPTY_ENTITLEMENT,workspace_id:workspaceId,product:"yucer",tier:"enterprise"},stores:{account:()=>getAccountStore()}} as unknown as AppSession;
  const scope={workspaceId,actorSub:session.user.sub},store=new PrismaTaskStore();
  const source=(o:TaskObject)=>readTaskSource(session,o);
  const task:TaskContext={...scope,sub:scope.actorSub,holder:session.authz,entitlement:session.entitlement,store,sessions:new PrismaCopilotStore(),source,refresh:async()=>task,business:businessBindings(session,source)};
  const ctx:ExecutionContext={task,sessionHash:createHash("sha256").update("xy05-login").digest("hex"),write:(...args)=>writeBusinessForm(session,...args)};
  let previous:{taskId:string;receiptId:string}|undefined;
  const completed:BusinessReceipt[]=[];
  async function step(module:FormModule,fields:Record<string,unknown>,targetId:string|null=null,operation:"save"|"publish"="save") {
    const id=previous?(await continueExecution(ctx,previous.taskId,previous.receiptId)).taskId:(await store.create(scope,"XY-05 native acceptance sample",TASK_RULE_VERSION,[],randomUUID())).id;
    const form=await task.business!.prepare(mergeForm(null,module,targetId,fields));
    const b=(await store.load(scope,id,true))!;
    assert.equal(await store.mutate(scope,id,b.task.revision,{ruleVersion:TASK_RULE_VERSION,draft:{key:"review",text:JSON.stringify(form),contractVersion:"business-form/1"}}),true);
    const draft=(await store.load(scope,id,true))!.drafts.find(d=>d.key==="review")!;
    const proposal=await proposeExecution(ctx,id,{key:"review",draftId:draft.id,operation});
    const grant=await grantExecution(ctx,id,{stepIds:[proposal.id],confirmedIds:[proposal.id],mode:"ask_always"});
    const receipt=await executeStep(ctx,id,{stepId:proposal.id,grantId:grant.id});
    const persisted=(await readExecutions(ctx,id)).receipts.find(r=>r.id===receipt.id)!;
    assert.ok(persisted);assert.match(persisted.result.object.id,/^[a-f0-9-]{36}$/);
    previous={taskId:id,receiptId:receipt.id};completed.push(persisted.result);
    return persisted.result;
  }
  try {
    await getAuthzStore().seeMember({workspaceId,sub:session.user.sub,displayName:"Acceptance owner"});
    const catalog=getCatalogStore(),strategy=getStrategyStore();
    const base={workspaceId,sub:session.user.sub,holder:session.authz,entitlement:session.entitlement};
    // Fixture product uses the original human service; unified product writes
    // are deliberately not claimed as a Xiaoyu-supported action.
    const units=unwrap(await listProductUnits({...base,store:catalog}));
    const product=unwrap(await upsertProduct({...base,store:catalog},{productCode:"XY05-CUSTOM",name:"GIS agent",unitId:units[0]!.id,novelty:"existing"},"create"));
    const market=await step("segment",{name:"GIS software teams",priority:1,status:"active",criteria:{industries:[],regions:[],sizes:[],needSummary:"Reusable spatial workflows",customerNeed:"Reduce repeated analysis",buyingScenario:"Annual subscription renewal"}});
    const solution=await step("solution",{name:"GIS agent bundle",summary:"Workflow automation",scenario:"Annual renewal",novelty:"existing",items:[{productId:product.id,quantity:1,optional:false,note:null}]});
    await step("segment",{solutionIds:[solution.object.id],productIds:[product.id]},market.object.id);
    const type=(await strategy.listStrategyTypes(workspaceId)).find(t=>t.enabled)!;
    const value=(await strategy.listStrategyOptions(workspaceId)).find(v=>v.enabled&&v.kind==="value")!;
    const result={...emptyStrategyResult(),valuePropositionId:value.id!,goals:[{id:randomUUID(),metric:"revenue" as const,name:"Revenue",baseline:"0",target:"1000000",unit:"CNY",dueOn:"2099-12-31",criterion:"Signed revenue"}]};
    const plan=await step("strategy",{name:"GIS growth",period:"2099",ownerSub:session.user.sub,objective:"Expand recurring GIS revenue",strategyTypeId:type.id,result,targetMarkets:[{segmentId:market.object.id,intent:"focus",approach:null}],solutionIds:[solution.object.id],productIds:[product.id]});
    await step("strategy",{},plan.object.id,"publish");
    const published=(await strategy.getPlan(workspaceId,plan.object.id))!;
    const expectation=published.publishedSnapshot!.expectations![0]!;
    assert.equal(expectation.metric,"revenue");
    const content=emptyContent(2099,[],"CNY");content.releaseScope="company";
    for(const t of content.targets)t.target="1000000";
    content.strategyAcceptances=[{key:randomUUID(),strategyId:published.id,lineageId:published.lineageId!,version:published.versionNo!,name:published.publishedSnapshot!.name,period:published.period,expectation,amount:"800000",ownerSub:session.user.sub,note:"Feasibility reviewed",allocations:[]}];
    const company=await step("sales_plan",{year:2099,content});
    await step("sales_plan",{year:2099,content},company.object.id,"publish");
    const planning=(await getSalesPlanStore().read(workspaceId,2099))!;
    const state=planVersions(planning,new Date().toISOString());
    assert.equal(state.current!.content.strategyAcceptances![0]!.amount,"800000");
    assert.equal(state.current!.content.strategyAcceptances![0]!.strategyId,plan.object.id);
    assert.equal(completed.length,7);
    const current=previous!;
    const otherActor={...ctx,task:{...task,sub:"xy05-other",refresh:async()=>({...task,sub:"xy05-other"})}};
    const otherSpace={...task,workspaceId:otherWorkspace,entitlement:{...task.entitlement,workspace_id:otherWorkspace}};
    for(const refused of [otherActor,{...ctx,task:{...otherSpace,refresh:async()=>otherSpace}}])await assert.rejects(readExecutions(refused,current.taskId));
    assert.equal((await readPrivateTask({...task,sub:"xy05-other",refresh:async()=>({...task,sub:"xy05-other"})},current.taskId)).ok,false);
    assert.equal((await store.load(scope,current.taskId,true))!.messages.length,0);
  } finally {
    // Cleanup only this randomly allocated fixture workspace, using admin;
    // application execution above uses its configured service role.
    await pg.query("BEGIN");
    // Published fixtures are immutable even for the database owner. Disable
    // triggers only in this admin cleanup transaction, after all assertions.
    await pg.query("SET LOCAL session_replication_role = replica");
    for(const table of ["agent_execution_receipt","agent_execution_grant","agent_execution_step","agent_task_turn","agent_task_checkpoint","agent_task_draft","agent_task_session","agent_task_reference","agent_task","agent_message","agent_session"])
      await pg.query(`DELETE FROM yucer_agent.${table} WHERE workspace_id=$1`,[workspaceId]);
    for(const table of ["sales_plan_event","sales_plan_revision","sales_plan","strategy_plan_event","strategy_plan_market","strategy_plan","market_segment","strategy_type","strategy_option"])
      await pg.query(`DELETE FROM yucer_gtm.${table} WHERE workspace_id=$1`,[workspaceId]);
    for(const table of ["solution_item","solution","product","product_unit","product_status"])
      await pg.query(`DELETE FROM yucer_catalog.${table} WHERE workspace_id=$1`,[workspaceId]);
    await pg.query("DELETE FROM local_authz.member WHERE workspace_id=$1",[workspaceId]);
    await pg.query("COMMIT");
    await pg.end();
  }
});
