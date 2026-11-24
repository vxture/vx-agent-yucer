import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryTaskStore, type TaskBundle, type TaskTurn } from "../task-store";
import { taskWorkspaceView } from "./workspace-view";
const scope = {workspaceId:"a0000000-0000-4000-a000-000000000001",actorSub:"alice"};
async function fixture() { const store=new InMemoryTaskStore(); const t=await store.create(scope,"Prepare market entry","r1",[],crypto.randomUUID()); return (await store.load(scope,t.id))!; }
const turn = (patch: Partial<TaskTurn> = {}): TaskTurn => ({id:"turn",requestId:"request",questionHash:"h",ruleVersion:"r1",status:"succeeded",userMessageId:"user",assistantMessageId:"answer",errorCode:null,...patch});
test("empty and private input drafts do not invent a task type, plan or result", async()=>{
  const b=await fixture();b.drafts.push({id:"input",key:"conversation-input",revision:1,contractVersion:"private-notes/1",text:"Plan ten accounts",createdAt:new Date()});
  assert.equal(taskWorkspaceView(b).kind,"conversation"); assert.equal(taskWorkspaceView(b).overviewMessageId,null);
  assert.deepEqual(taskWorkspaceView(null).panels,[]);
});
test("structured forms take precedence and use only whitelisted panels",async()=>{
  const b=await fixture();b.drafts.push({id:"draft",key:"market",revision:1,contractVersion:"business-form/1",text:JSON.stringify({module:"segment",targetId:null,baseVersion:null,fields:{name:"Market"},manualFields:[],sources:[]}),createdAt:new Date()});
  b.messages.push({id:"answer",seq:1,role:"assistant",content:"Draft is ready",createdAt:new Date()});
  const v=taskWorkspaceView(b);assert.equal(v.kind,"form");assert.deepEqual(v.modules,["segment"]);assert.deepEqual(v.panels,["forms","overview"]);
  assert.equal(v.stage,"awaiting");
});
test("a failed research turn never makes partial evidence or a completed business result",async()=>{
  const b=await fixture();b.turns.push(turn({status:"failed",artifacts:{version:"task-artifacts/1",capturedAt:new Date().toISOString(),research:[],calls:[],usage:{elapsedMs:100,totalTokens:30,toolRounds:1,truncated:true},failure:{reason:"tokens",modelRequests:1,toolCalls:1}}}));
  const v=taskWorkspaceView(b);assert.equal(v.kind,"conversation");assert.equal(v.stage,"failed");assert.deepEqual(v.panels,["forms","sources","activity"]);
});
test("recorded successful research changes the layout; running and terminal states remain distinct",async()=>{
  const b=await fixture();b.turns.push(turn({artifacts:{version:"task-artifacts/1",capturedAt:new Date().toISOString(),research:[{id:"read-1",capabilityId:"search",operation:"search",callId:null,version:null,excerpt:"Evidence",links:[]}],calls:[],usage:{elapsedMs:100,totalTokens:30,toolRounds:1,truncated:false}}}));
  assert.equal(taskWorkspaceView(b).kind,"research");
  b.turns.push(turn({id:"running",status:"running"}));assert.equal(taskWorkspaceView(b).stage,"running");
  b.task.status="paused";assert.equal(taskWorkspaceView(b).stage,"paused");
  b.task.status="completed";assert.equal(taskWorkspaceView(b).stage,"completed");
});
test("unreadable form content is counted without treating it as valid data",async()=>{
  const b: TaskBundle=await fixture();b.drafts.push({id:"draft",key:"broken",revision:1,contractVersion:"business-form/1",text:'{"module":"unknown","html":"<script>bad</script>"}',createdAt:new Date()});
  const v=taskWorkspaceView(b);assert.equal(v.invalidDrafts,1);assert.deepEqual(v.modules,[]);assert.deepEqual(v.panels,["forms"]);
});
