import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetFailureArtifacts, taskArtifacts, publicSourceUrl, readTaskArtifacts } from "./task-artifacts";
import { formChanges, mergeForm } from "./business-form";
import type { TurnResult } from "../../../agent/orchestrator/turn";
test("research metadata comes from actual successful evidence and excludes credential or unsafe links",()=>{
  for(const url of ["javascript:alert(1)","file:///etc/passwd","https://user:pass@example.org","http://127.0.0.1/admin","http://10.1.2.3/","http://192.168.1.1/","https://example.org/?api_key=secret","http://[::1]/"])
    assert.equal(publicSourceUrl(url),null,url);
  assert.equal(publicSourceUrl("https://example.org/report?id=5"),"https://example.org/report?id=5");
  const result={answer:"Model claims https://fake.example",totalTokens:42,toolRounds:2,truncated:false,invocations:[{capabilityId:"exa.web-research",operation:"search",ok:true,callId:"call-1",versionResolved:"1.0.0"}],readEvidence:[{id:"read-1-1",content:JSON.stringify({url:"https://example.org/report",other:"https://example.org/?token=secret",text:"x".repeat(3000)}),capabilityId:"exa.web-research",operation:"search",callId:"call-1",versionResolved:"1.0.0"}]} as TurnResult;
  const a=taskArtifacts(result,Date.now()-100);
  assert.equal(a.research[0]!.callId,"call-1");
  assert.equal(a.research[0]!.excerpt.length,1500);
  assert.doesNotMatch(a.research[0]!.excerpt,/token=secret/);
  assert.deepEqual(a.research[0]!.links,["https://example.org/report"]);
  assert.equal(a.usage.totalTokens,42);
  assert.ok(a.usage.elapsedMs>=100);
  assert.doesNotMatch(JSON.stringify(a),/fake.example/);
  assert.equal(readTaskArtifacts({}),undefined);
  assert.equal(readTaskArtifacts(null),undefined);
  assert.equal(readTaskArtifacts({version:"task-artifacts/1"}),undefined);
  assert.equal(readTaskArtifacts({...a,research:[{...a.research[0],links:["javascript:alert(1)"]}]}),undefined);
  assert.equal(readTaskArtifacts(a),a);
});
test("empty or large research is bounded and never manufactures an external source",()=>{
  const result={totalTokens:0,toolRounds:0,truncated:true,invocations:[],readEvidence:[]} as unknown as TurnResult;
  assert.deepEqual(taskArtifacts(result,Date.now()).research,[]);
  result.readEvidence=Array.from({length:50},(_,i)=>({id:String(i),content:"Plain text"}));
  const a=taskArtifacts(result,Date.now()+1000);
  assert.equal(a.research.length,20);
  assert.equal(a.usage.elapsedMs,0);
  assert.equal(a.research[0]!.callId,null);
  assert.deepEqual(a.research[0]!.links,[]);
});
test("multibyte excerpts and long public URLs fit the database byte ceiling",()=>{
  const content="\u6d4b".repeat(1500)+Array.from({length:8},(_,i)=>` https://example.org/${i}?id=${"x".repeat(1850)}`).join("");
  const a=taskArtifacts({totalTokens:1,toolRounds:1,truncated:false,readEvidence:Array.from({length:20},(_,i)=>({id:String(i),content})),invocations:Array.from({length:64},()=>({capabilityId:"x".repeat(500),operation:"read",callId:"y".repeat(500),versionResolved:"1",ok:true}))} as unknown as TurnResult,Date.now());
  assert.ok(new TextEncoder().encode(JSON.stringify(a)).length<=110000);
  assert.ok(a.research.length>0&&a.research.length<20);
  assert.equal(readTaskArtifacts(a),a);
});
test("field review compares nested proposed fields with server baseline and keeps human protection",()=>{
  const first={...mergeForm(null,"segment",null,{name:"GIS",criteria:{customerNeed:"Old",buyingScenario:"Same"}}),baseline:{name:"Saved",criteria:{customerNeed:"Old",buyingScenario:"Same"}}};
  const human=mergeForm(first,"segment",null,{criteria:{customerNeed:"Human correction"}},true);
  const model=mergeForm(human,"segment",null,{criteria:{customerNeed:"Overwritten",buyingScenario:"Improved"}});
  const changes=formChanges(model);
  assert.deepEqual(changes.find(c=>c.path==="name"),{path:"name",before:"Saved",after:"GIS",changed:true});
  assert.equal(changes.find(c=>c.path==="criteria.customerNeed")!.after,"Human correction");
  assert.equal(changes.find(c=>c.path==="criteria.customerNeed")!.before,"Old");
  assert.equal(formChanges(first).find(c=>c.path==="criteria.buyingScenario")!.changed,false);
  const fresh=formChanges(mergeForm(null,"solution",null,{items:[]}));
  assert.equal(fresh[0]!.before,undefined);
});

test("budget failure metadata contains counts only and rejects sources or invalid reasons", () => {
  const a = budgetFailureArtifacts({ reason: "tokens", elapsedMs: 30000, totalTokens: 40100, toolRounds: 4, modelRequests: 5, toolCalls: 4 });
  assert.equal(readTaskArtifacts(a), a);
  assert.deepEqual(a.research, []); assert.deepEqual(a.calls, []);
  assert.equal(a.usage.totalTokens, 40100); assert.equal(a.failure!.reason, "tokens");
  assert.equal(readTaskArtifacts({ ...a, failure: { ...a.failure, reason: "unknown" } }), undefined);
  assert.equal(readTaskArtifacts({ ...a, failure: { ...a.failure, modelRequests: -1 } }), undefined);
  assert.equal(readTaskArtifacts({ ...a, calls: [{ capabilityId: "x", operation: "read", callId: null, version: null, ok: true }] }), undefined);
});
