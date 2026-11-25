import assert from "node:assert/strict";
import {test} from "node:test";
import {formReviewHttp} from "./handler";
import {InMemoryTaskStore} from "../../../../../domains/copilot/task-store";
import type {TaskContext} from "../../../../../domains/copilot/task-service";
import {PERM_CODES} from "../../../../../authz/catalog";
import {EMPTY_ENTITLEMENT} from "../../../../../entitlement/types";
import type {AppSession} from "../../../../../(app)/lib/session";
async function fixture(){
  const store=new InMemoryTaskStore(),workspaceId=crypto.randomUUID(),sub="reviewer",scope={workspaceId,actorSub:sub};
  const context={workspaceId,sub,store,holder:{permissions:new Set(PERM_CODES)},entitlement:{...EMPTY_ENTITLEMENT,workspace_id:workspaceId,product:"yucer",tier:"enterprise"},source:async()=>null} as unknown as TaskContext;
  context.refresh=async()=>context;
  const t=await store.create(scope,"Private task","xiaoyu/1",[],crypto.randomUUID());
  return {context,store,scope,t,session:{} as AppSession};
}
test("form catalogs refuse missing, foreign and revoked private tasks before or after resolving names",async()=>{
  assert.equal((await formReviewHttp(crypto.randomUUID(),async()=>null)).status,403);
  const f=await fixture();let calls=0;
  const load=async()=>{calls++;return {secret:{labels:{private:"Private name"},options:{}}};};
  assert.equal((await formReviewHttp(crypto.randomUUID(),async()=>f,load)).status,404);assert.equal(calls,0);
  const foreign={...f,context:{...f.context,sub:"other",refresh:async()=>({...f.context,sub:"other"})}};
  assert.equal((await formReviewHttp(f.t.id,async()=>foreign,load)).status,404);
  const revoked=await formReviewHttp(f.t.id,async()=>f,async()=>{f.context.refresh=async()=>null;return load();});
  assert.equal(revoked.status,403);assert.doesNotMatch(await revoked.text(),/Private name/);
});
test("form catalogs reject a changed draft, hide backend details and deliver fresh names with no-store",async()=>{
  const f=await fixture();
  const changed=await formReviewHttp(f.t.id,async()=>f,async()=>{await f.store.mutate(f.scope,f.t.id,f.t.revision,{ruleVersion:"xiaoyu/1",draft:{key:"note",text:"Changed"}});return {};});
  assert.equal(changed.status,409);
  const failure=await formReviewHttp(f.t.id,async()=>f,async()=>{throw Error("private backend details");});
  assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private backend details/);
  const ok=await formReviewHttp(f.t.id,async()=>f,async()=>({customer:{labels:{size:"Medium business"},options:{}}}));
  assert.equal(ok.status,200);assert.match(ok.headers.get("cache-control")!,/no-store/);
  assert.equal((await ok.json()).catalogs.customer.labels.size,"Medium business");
});
