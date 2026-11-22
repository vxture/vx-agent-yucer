import assert from "node:assert/strict";
import { test } from "node:test";
import { executionHttp } from "./handler";
import type { ExecutionContext } from "../../../../../domains/copilot/execution-service";
const post = (body: unknown, headers?: HeadersInit) => new Request("http://localhost/api/copilot/tasks/task/execution", { method: "POST", headers, body: JSON.stringify(body) });
test("execution HTTP rejects CSRF and oversized/invalid streams before resolving private access", async () => {
  let calls=0;
  const resolve=async()=>{calls++;return null;};
  for (const request of [post({}, {origin:"https://evil.example"}),post({}, {"sec-fetch-site":"cross-site"})])
    assert.equal((await executionHttp(request,"task",resolve)).status,403);
  assert.equal((await executionHttp(post({value:"x".repeat(33000)}),"task",resolve)).status,413);
  assert.equal((await executionHttp(new Request("http://localhost/api",{method:"POST",body:"{"}),"task",resolve)).status,400);
  assert.equal(calls,0);
});
test("execution HTTP withholds errors and private state without a current login",async()=>{
  for(const request of [new Request("http://localhost/api"),post({action:"execute"})]){
    const response=await executionHttp(request,"task",async()=>null);
    assert.equal(response.status,403);
    assert.match(response.headers.get("cache-control")!,/no-store/);
    assert.equal((await response.json()).code,"COPILOT_EXECUTION_ACCESS_CHANGED");
  }
  const response=await executionHttp(new Request("http://localhost/api"),"task",async()=>{throw Error("secret database message");});
  assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/secret database/);
});
test("execution HTTP refuses unknown actions, payloads and methods",async()=>{
  const resolve=async()=>({} as ExecutionContext);
  for(const value of [null,[],{action:"sql"},{action:"continue",receiptId:"x",unexpected:true},{action:"revoke",grantId:1},{action:"propose",key:"x",draftId:"bad",operation:"delete"}]){
    const response=await executionHttp(post(value),"task",resolve);
    assert.equal(response.status,400);
    assert.equal((await response.json()).code,"COPILOT_EXECUTION_INVALID_EXECUTION_REQUEST");
  }
  assert.equal((await executionHttp(new Request("http://localhost/api",{method:"DELETE"}),"task",resolve)).status,405);
});
