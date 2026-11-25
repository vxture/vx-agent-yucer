import assert from "node:assert/strict";
import {test} from "node:test";
import {withTaskDraftWrite} from "./task-draft-queue";
import {InMemoryTaskStore} from "../../domains/copilot/task-store";
test("simultaneous module supplements retain every task revision instead of racing",async()=>{
  const store=new InMemoryTaskStore(),scope={workspaceId:crypto.randomUUID(),actorSub:"reviewer"};
  const task=await store.create(scope,"Review several modules","r1",[],crypto.randomUUID());
  await Promise.all(["customer","market","solution"].map(key=>withTaskDraftWrite(task.id,async()=>{
    const current=(await store.load(scope,task.id,true))!;
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(await store.mutate(scope,task.id,current.task.revision,{ruleVersion:"r1",draft:{key,text:key,contractVersion:"private-notes/1"}}),true);
  })));
  assert.deepEqual((await store.load(scope,task.id,true))!.drafts.map(d=>d.key).sort(),["customer","market","solution"]);
});
test("a rejected edit stays visible to its caller without poisoning another task or a later retry",async()=>{
  const failed=withTaskDraftWrite("one",async()=>{throw Error("sync_failed");});
  const retry=withTaskDraftWrite("one",async()=>"retained");
  assert.equal(await withTaskDraftWrite("two",async()=>"independent"),"independent");
  await assert.rejects(failed,/sync_failed/);assert.equal(await retry,"retained");
});
