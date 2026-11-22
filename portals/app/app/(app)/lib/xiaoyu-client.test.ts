import { test } from "node:test";
import assert from "node:assert/strict";
import { XiaoyuClient, pageObject, pointerKey, workspaceHref, type TaskView } from "./xiaoyu-client";
import { InMemoryTaskStore } from "../../domains/copilot/task-store";
import { TASK_RULE_VERSION } from "../../domains/copilot/lib/task-contract";
async function fixture() {
  const store = new InMemoryTaskStore(), scope = { workspaceId: "workspace-a", actorSub: "alice" };
  const task = await store.create(scope,"Private planning",TASK_RULE_VERSION,[],crypto.randomUUID());
  const bundle = () => store.load(scope,task.id,true).then(b => ({...b!,currentRuleVersion:TASK_RULE_VERSION,ruleChanged:false,recovery:{interruptedRequests:[]}} as TaskView));
  const calls: {url:string;method:string;body:Record<string,unknown>}[] = [], pointers:(string|null)[]=[];
  let hook: ((url:string,method:string,body:Record<string,unknown>)=>Promise<Response|undefined>)|undefined;
  const client = new XiaoyuClient(async (url,init) => {
    const method=init?.method??"GET",body=JSON.parse(String(init?.body??"{}"));calls.push({url,method,body});
    const override=await hook?.(url,method,body);if(override)return override;
    if(method==="POST"&&url.endsWith("/tasks"))return Response.json(task);
    if(method==="PATCH"){
      await store.mutate(scope,task.id,Number(body.revision),{ruleVersion:TASK_RULE_VERSION,...(body.action==="notes"?{draft:{key:"notes",text:String(body.text)}}:{})});
      return Response.json(await bundle());
    }
    return Response.json(url.endsWith("/tasks")?[task]:await bundle());
  },id=>pointers.push(id));
  return {client,store,scope,task,bundle,calls,pointers,setHook:(next:typeof hook)=>{hook=next;}};
}
test("pointers isolate owner/workspace; only UUID detail routes bind objects",()=>{
  assert.notEqual(pointerKey("a","alice"),pointerKey("b","alice"));assert.notEqual(pointerKey("a","alice"),pointerKey("a","bob"));
  const id=crypto.randomUUID();assert.deepEqual(pageObject(`/segment/${id}`),{kind:"segment",id});assert.equal(pageObject("/segment/new"),null);assert.equal(pageObject("/admin/alice"),null);assert.equal(workspaceHref(id),`/copilot?task=${id}`);
});
test("refresh restores the same task without a model call",async()=>{
  const f=await fixture();await f.client.start(f.task.id);await f.client.refresh();assert.equal(f.client.getSnapshot().bundle?.task.id,f.task.id);assert.ok(f.calls.every(c=>c.method==="GET"));
});
test("late response from previous task cannot replace the current conversation",async()=>{
  const f=await fixture();await f.client.start(null);let finish!:(r:Response)=>void;
  f.setHook(async url=>url.endsWith(f.task.id)?new Promise(r=>{finish=r;}):undefined);
  const loading=f.client.select(f.task.id);f.client.newTask();finish(Response.json(await f.bundle()));await loading;assert.equal(f.client.getSnapshot().bundle,null);assert.equal(f.pointers.at(-1),null);
});
test("unmount rejects late results and storage writes; effect replay safely restarts",async()=>{
  const f=await fixture();let finish!:(r:Response)=>void;f.setHook(async()=>new Promise(r=>{finish=r;}));
  const loading=f.client.start(f.task.id);f.client.suspend();f.setHook(undefined);await f.client.start(null);finish(Response.json([f.task]));await loading;
  assert.equal(f.client.getSnapshot().bundle,null);assert.deepEqual(f.pointers,[]);assert.equal(f.client.getSnapshot().loading,false);
});
test("dirty notes and composer survive refresh; switching is blocked until explicit save",async()=>{
  const f=await fixture();await f.client.start(f.task.id);f.client.setNotes("My decision");f.client.setInput("Unsent question");await f.client.refresh();f.client.newTask();
  assert.equal(f.client.getSnapshot().notes,"My decision");assert.equal(f.client.getSnapshot().input,"Unsent question");assert.equal(f.client.getSnapshot().bundle?.task.id,f.task.id);
  await f.client.saveNotes();assert.equal(f.client.getSnapshot().notesDirty,false);assert.equal((await f.bundle()).drafts.at(-1)?.text,"My decision");
});
test("permission/source rejection clears messages, notes, composer and pointers",async()=>{
  for(const [code,status]of [["POLICY_DENIED",403],["COPILOT_TASK_SOURCE_CHANGED",409],["COPILOT_TASK_NOT_FOUND",404]]as const){
    const f=await fixture();await f.client.start(f.task.id);f.client.setNotes("secret");f.client.setInput("secret");f.setHook(async()=>Response.json({code},{status}));await f.client.refresh();const s=f.client.getSnapshot();
    assert.equal(s.bundle,null);assert.equal(s.notes,"");assert.equal(s.input,"");assert.deepEqual(s.tasks,[]);assert.equal(f.pointers.at(-1),null);
  }
});
test("list access rejection also clears the already open task",async()=>{
  const f=await fixture();await f.client.start(f.task.id);f.setHook(async()=>Response.json({code:"COPILOT_TASK_ACCESS_DENIED"},{status:403}));await f.client.refreshList();assert.equal(f.client.getSnapshot().bundle,null);
});
test("failed model calls never auto retry; explicit recovery restores the question",async()=>{
  const f=await fixture();await f.client.start(f.task.id);f.setHook(async(url,method,body)=>{
    if(method==="POST"&&url.endsWith("/turn")){const turn=await f.store.beginTurn(f.scope,f.task.id,Number(body.revision),String(body.requestId),String(body.question),"hash",TASK_RULE_VERSION);await f.store.finishTurn(f.scope,f.task.id,turn!.id,{errorCode:"task_model_failed"});return Response.json({code:"COPILOT_TASK_TASK_MODEL_FAILED"},{status:502});}
  });
  f.client.setInput("What next?");await f.client.send();await f.client.refresh();assert.equal(f.calls.filter(c=>c.method==="POST").length,1);assert.ok(f.client.getSnapshot().pending);await f.client.continueAfterFailure();assert.equal(f.client.getSnapshot().pending,null);assert.equal(f.client.getSnapshot().input,"What next?");assert.equal(f.calls.filter(c=>c.method==="POST").length,1);
});
test("lost success response recovers read-only without duplicate model calls",async()=>{
  const f=await fixture();await f.client.start(f.task.id);f.setHook(async(url,method,body)=>{
    if(method==="POST"&&url.endsWith("/turn")){const turn=await f.store.beginTurn(f.scope,f.task.id,Number(body.revision),String(body.requestId),String(body.question),"hash",TASK_RULE_VERSION);await f.store.finishTurn(f.scope,f.task.id,turn!.id,{answer:"Verified answer",tokens:1});throw new Error("lost");}
  });f.client.setInput("Question");await f.client.send();assert.equal(f.client.getSnapshot().pending,null);assert.equal(f.client.getSnapshot().bundle?.messages.at(-1)?.content,"Verified answer");assert.equal(f.calls.filter(c=>c.method==="POST").length,1);
});
test("missing receipt recovery explicitly replays the original key and revision",async()=>{
  const f=await fixture();await f.client.start(f.task.id);f.setHook(async(_url,method)=>{if(method==="POST")throw new Error("not_delivered");});f.client.setInput("Question");await f.client.send();const original=f.calls.find(c=>c.method==="POST")!;await f.client.continueAfterFailure();assert.deepEqual(f.calls.filter(c=>c.method==="POST").at(-1)!.body,original.body);assert.equal(f.calls.filter(c=>c.method==="POST").length,2);
});
test("lost creation response retains the original key until explicit recovery",async()=>{
  const f=await fixture();await f.client.start(null);let lost=true;f.setHook(async(url,method)=>{if(method==="POST"&&url.endsWith("/tasks")&&lost){lost=false;throw new Error("lost");}});f.client.setInput("Question");await f.client.send();assert.ok(f.client.getSnapshot().creation);await f.client.refresh();assert.equal(f.calls.filter(c=>c.method==="POST").length,1);await f.client.send();const creates=f.calls.filter(c=>c.method==="POST"&&c.url.endsWith("/tasks"));assert.equal(creates.length,2);assert.deepEqual(creates[0].body,creates[1].body);
});

test("missing receipt can recover after a notes revision without changing its request key",async()=>{
  const f=await fixture();await f.client.start(f.task.id);let lost=true;
  f.setHook(async(_url,method)=>{if(method==="POST"&&lost){lost=false;throw new Error("not_delivered");}});
  f.client.setInput("Question");await f.client.send();const original=f.calls.find(c=>c.method==="POST")!;
  f.client.setNotes("Updated plan");await f.client.saveNotes();await f.client.continueAfterFailure();
  const replay=f.calls.filter(c=>c.method==="POST").at(-1)!;
  assert.equal(replay.body.requestId,original.body.requestId);assert.equal(replay.body.question,original.body.question);
  assert.equal(replay.body.revision,Number(original.body.revision)+1);
});

test("unverifiable task lists do not retain cached private titles",async()=>{
  const f=await fixture();await f.client.start(f.task.id);assert.ok(f.client.getSnapshot().tasks.length);
  f.setHook(async()=>Response.json({code:"COPILOT_TASK_UNAVAILABLE"},{status:503}));await f.client.refreshList();
  assert.deepEqual(f.client.getSnapshot().tasks,[]);
});
test("suspending a scope clears private state before any later reactivation",async()=>{
  const f=await fixture();await f.client.start(f.task.id);f.client.setInput("Secret question");f.client.setNotes("Secret note");f.client.suspend();
  assert.equal(f.client.getSnapshot().bundle,null);assert.equal(f.client.getSnapshot().input,"");assert.equal(f.client.getSnapshot().notes,"");assert.deepEqual(f.client.getSnapshot().tasks,[]);
});
