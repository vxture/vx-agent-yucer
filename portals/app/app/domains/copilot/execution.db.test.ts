import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import { PrismaTaskStore } from "./task-prisma-store";
import { PrismaCopilotStore } from "./prisma-store";
import { PERM_CODES } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { TASK_RULE_VERSION } from "./lib/task-contract";
import { mergeForm } from "./lib/business-form";
import {
  continueExecution,
  proposeExecution,
  grantExecution,
  executeStep,
  readExecutions,
  revokeExecution,
  type ExecutionContext,
} from "./execution-service";
import { writeBusinessForm } from "./execution-domain";
import { businessBindings } from "../../api/copilot/tasks/business";
import { readTaskSource } from "../../api/copilot/tasks/context";
import { getAccountStore } from "../shared/registry";
import type { AppSession } from "../../(app)/lib/session";
import type { TaskContext } from "./task-service";
const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL";
async function fixture(
  fn: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>,
) {
  const f = await setup();
  try {
    await fn(f);
  } finally {
    for (const table of [
      "agent_execution_receipt",
      "agent_execution_grant",
      "agent_execution_step",
      "agent_task_turn",
      "agent_task_checkpoint",
      "agent_task_draft",
      "agent_task_session",
      "agent_task_reference",
      "agent_task",
      "agent_message",
      "agent_session",
    ]) {
      await f.pg.query(
        `DELETE FROM yucer_agent.${table} WHERE workspace_id=$1`,
        [f.session.workspaceId],
      );
    }
    await f.pg.query(
      "DELETE FROM yucer_gtm.market_segment WHERE workspace_id=$1",
      [f.session.workspaceId],
    );
    await f.pg.query("DELETE FROM yucer_core.account WHERE workspace_id=$1",[f.session.workspaceId]);
    await f.pg.end();
  }
}
async function setup() {
  const pg = new Client({ connectionString: process.env.TEST_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL });
  await pg.connect();
  try {
    const session = {
      workspaceId: randomUUID(),
      user: { sub: "execution-owner" },
      scope: { kind: "workspace" },
      authz: { permissions: new Set(PERM_CODES) },
      entitlement: {
        ...EMPTY_ENTITLEMENT,
        product: "yucer",
        tier: "enterprise",
      },
      stores: { account: () => getAccountStore() },
    } as unknown as AppSession;
    session.entitlement.workspace_id = session.workspaceId;
    const store = new PrismaTaskStore(),
      sessions = new PrismaCopilotStore();
    const scope = {
      workspaceId: session.workspaceId,
      actorSub: session.user.sub,
    };
    const source = (o: Parameters<typeof readTaskSource>[1]) =>
      readTaskSource(session, o);
    const task: TaskContext = {
      ...scope,
      sub: scope.actorSub,
      holder: session.authz,
      entitlement: session.entitlement,
      store,
      sessions,
      source,
      refresh: async () => task,
      business: businessBindings(session, source),
    };
    const record = await store.create(
      scope,
      "Create a market",
      TASK_RULE_VERSION,
      [],
      randomUUID(),
    );
    const form = await task.business!.prepare(
      mergeForm(null, "segment", null, {
        name: "Receipt market",
        priority: 1,
        status: "active",
        criteria: {
          industries: [],
          regions: [],
          sizes: [],
          needSummary: "Agent-assisted research",
        },
      }),
    );
    assert.equal(
      await store.mutate(scope, record.id, record.revision, {
        ruleVersion: TASK_RULE_VERSION,
        draft: {
          key: "market",
          contractVersion: "business-form/1",
          text: JSON.stringify(form),
        },
      }),
      true,
    );
    const draft = (await store.load(scope, record.id, true))!.drafts[0]!;
    const ctx: ExecutionContext = {
      task,
      sessionHash: createHash("sha256").update("login-one").digest("hex"),
      write: (...args) => writeBusinessForm(session, ...args),
    };
    const step = await proposeExecution(ctx, record.id, {
      key: "market",
      draftId: draft.id,
      operation: "save",
    });
    const grant = await grantExecution(ctx, record.id, {
      stepIds: [step.id],
      confirmedIds: [step.id],
      mode: "ask_always",
    });
    return { pg, session, ctx, record, scope, store, draft, step, grant };
  } catch (error) {
    await pg.end();
    throw error;
  }
}
test(
  "native service save and immutable receipt commit once; a lost response recovers the same UUID",
  { skip },
  () =>
    fixture(async (f) => {
      const receipt = await executeStep(f.ctx, f.record.id, {
        stepId: f.step.id,
        grantId: f.grant.id,
      });
      const second = await executeStep(f.ctx, f.record.id, {
        stepId: f.step.id,
        grantId: f.grant.id,
      });
      assert.equal(second.id, receipt.id);
      assert.equal(
        (
          await f.pg.query(
            "SELECT count(*) FROM yucer_gtm.market_segment WHERE workspace_id=$1",
            [f.session.workspaceId],
          )
        ).rows[0].count,
        "1",
      );
      assert.equal(
        (await readExecutions(f.ctx, f.record.id)).receipts.length,
        1,
      );
      const next = await continueExecution(f.ctx, f.record.id, receipt.id),
        replayed = await continueExecution(f.ctx, f.record.id, receipt.id);
      assert.equal(next.taskId, replayed.taskId);
      assert.notEqual(next.taskId, f.record.id);
      const phase = await f.store.load(f.scope, next.taskId, true);
      assert.equal(phase!.messages.length, 0);
      assert.equal(phase!.drafts.length, 1);
      assert.match(phase!.drafts[0]!.text, /grantsCopied/);
      assert.equal((await readExecutions(f.ctx, next.taskId)).grants.length, 0);
      for (const ctx of [
        { ...f.ctx, sessionHash: "f".repeat(64) },
        { ...f.ctx, task: { ...f.ctx.task, sub: "other" } },
      ])
        await assert.rejects(
          executeStep(ctx, f.record.id, {
            stepId: f.step.id,
            grantId: f.grant.id,
          }),
        );
    }),
);
test(
  "receipt failure rolls back actual domain service changes; retry cannot duplicate a hidden partial write",
  { skip },
  () =>
    fixture(async (f) => {
      const ctx = {
        ...f.ctx,
        write: async (...args: Parameters<ExecutionContext["write"]>) => {
          await f.ctx.write(...args);
          throw Error("simulated_receipt_failure");
        },
      };
      await assert.rejects(
        executeStep(ctx, f.record.id, {
          stepId: f.step.id,
          grantId: f.grant.id,
        }),
        /simulated_receipt_failure/,
      );
      assert.equal(
        (
          await f.pg.query(
            "SELECT count(*) FROM yucer_gtm.market_segment WHERE workspace_id=$1",
            [f.session.workspaceId],
          )
        ).rows[0].count,
        "0",
      );
      assert.equal(
        (
          await f.pg.query(
            "SELECT count(*) FROM yucer_agent.agent_execution_receipt WHERE task_id=$1",
            [f.record.id],
          )
        ).rows[0].count,
        "0",
      );
      await executeStep(f.ctx, f.record.id, {
        stepId: f.step.id,
        grantId: f.grant.id,
      });
    }),
);
test(
  "stale immutable form, cancellation, revocation and real expiry block native writes",
  { skip },
  () =>
    fixture(async (f) => {
      await revokeExecution(f.ctx, f.record.id, f.grant.id);
      await assert.rejects(
        executeStep(f.ctx, f.record.id, {
          stepId: f.step.id,
          grantId: f.grant.id,
        }),
        /grant_revoked/,
      );
      const expired = await grantExecution(f.ctx, f.record.id, {
        stepIds: [f.step.id],
        confirmedIds: [f.step.id],
        mode: "ask_always",
        seconds: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await assert.rejects(
        executeStep(f.ctx, f.record.id, {
          stepId: f.step.id,
          grantId: expired.id,
        }),
        /authorization_expired/,
      );
      const grant = await grantExecution(f.ctx, f.record.id, {
        stepIds: [f.step.id],
        confirmedIds: [f.step.id],
        mode: "ask_always",
      });
      await f.pg.query(
        "UPDATE yucer_agent.agent_task SET status='cancelled' WHERE id=$1",
        [f.record.id],
      );
      await assert.rejects(
        executeStep(f.ctx, f.record.id, {
          stepId: f.step.id,
          grantId: grant.id,
        }),
        /task_not_active/,
      );
      const cancelled = await readExecutions(f.ctx, f.record.id);
      assert.equal(cancelled.canPrepare, false);
      assert.equal(cancelled.steps[0]?.status, "proposal_unavailable");
      await f.pg.query(
        "UPDATE yucer_agent.agent_task SET status='active' WHERE id=$1",
        [f.record.id],
      );
      const bundle = (await f.store.load(f.scope, f.record.id, true))!;
      await f.store.mutate(f.scope, f.record.id, bundle.task.revision, {
        ruleVersion: TASK_RULE_VERSION,
        draft: {
          key: "market",
          contractVersion: "business-form/1",
          text: JSON.stringify(
            mergeForm(null, "segment", null, { name: "Changed" }),
          ),
        },
      });
      await assert.rejects(
        executeStep(f.ctx, f.record.id, {
          stepId: f.step.id,
          grantId: grant.id,
        }),
        /form_changed/,
      );
      const replaced = await readExecutions(f.ctx, f.record.id);
      assert.equal(replaced.canPrepare, true);
      assert.equal(replaced.steps[0]?.status, "proposal_unavailable");
      assert.equal(replaced.steps[0]?.form, undefined);
      assert.equal(
        (
          await f.pg.query(
            "SELECT count(*) FROM yucer_gtm.market_segment WHERE workspace_id=$1",
            [f.session.workspaceId],
          )
        ).rows[0].count,
        "0",
      );
    }),
);

test(
  "concurrent instances submit one actual native record and recover one receipt",
  { skip },
  () =>
    fixture(async (f) => {
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          executeStep({ ...f.ctx }, f.record.id, {
            stepId: f.step.id,
            grantId: f.grant.id,
          }),
        ),
      );
      assert.equal(new Set(results.map((r) => r.id)).size, 1);
      assert.equal(
        (
          await f.pg.query(
            "SELECT count(*) FROM yucer_gtm.market_segment WHERE workspace_id=$1",
            [f.session.workspaceId],
          )
        ).rows[0].count,
        "1",
      );
    }),
);

test("HTTP authorizes concrete steps, reports partial failure and recovers receipts without replay", {skip}, () => fixture(async f=>{
  const {executionHttp}=await import("../../api/copilot/tasks/[taskId]/execution/handler");
  const request=(value?:unknown)=>new Request("http://localhost/api/copilot/tasks/task/execution",value===undefined?undefined:{method:"POST",body:JSON.stringify(value)});
  const resolve=async()=>f.ctx;
  const denied=await executionHttp(request({action:"grant",stepIds:[f.step.id],confirmedIds:[],mode:"ask_always"}),f.record.id,resolve);
  assert.equal(denied.status,200);
  assert.equal((await denied.json()).state,"partial_or_waiting");
  const result=await executionHttp(request({action:"grant",stepIds:[f.step.id],confirmedIds:[f.step.id],mode:"ask_always"}),f.record.id,resolve);
  const completed=await result.json();
  assert.equal(completed.state,"succeeded");
  assert.equal(completed.completed.length,1);
  const read=await executionHttp(request(),f.record.id,resolve);
  const state=await read.json();
  assert.equal(state.steps[0].status,"succeeded");
  const replay=await executionHttp(request({action:"execute",stepId:f.step.id,grantId:completed.grant.id}),f.record.id,resolve);
  assert.equal((await replay.json()).id,completed.completed[0].id);
  assert.equal((await executionHttp(request({action:"revoke",grantId:completed.grant.id}),f.record.id,resolve)).status,200);
  const next=await executionHttp(request({action:"continue",receiptId:completed.completed[0].id}),f.record.id,resolve);
  assert.notEqual((await next.json()).taskId,f.record.id);
  const proposal=await executionHttp(request({action:"propose",key:"market",draftId:f.draft.id,operation:"save"}),f.record.id,resolve);
  assert.equal((await proposal.json()).id,f.step.id);
}));

test("partial native saves recover the completed receipt and resume only the unfinished step", { skip }, () =>
  fixture(async (f) => {
    const { executionHttp } = await import("../../api/copilot/tasks/[taskId]/execution/handler");
    const current = (await f.store.load(f.scope, f.record.id, true))!;
    const form = await f.ctx.task.business!.prepare(
      mergeForm(null, "segment", null, {
        name: "Recovery market", priority: 2, status: "active",
        criteria: { needSummary: "Optional matching dimensions are not set" },
      }),
    );
    assert.equal(await f.store.mutate(f.scope, f.record.id, current.task.revision, {
      ruleVersion: TASK_RULE_VERSION,
      draft: { key: "second", contractVersion: "business-form/1", text: JSON.stringify(form) },
    }), true);
    const secondDraft = (await f.store.load(f.scope, f.record.id, true))!.drafts.find((d) => d.key === "second")!;
    const second = await proposeExecution(f.ctx, f.record.id, {
      key: secondDraft.key, draftId: secondDraft.id, operation: "save",
    });
    const nativeWrites: string[] = [];
    let interrupt = true;
    const ctx: ExecutionContext = {
      ...f.ctx,
      write: async (...args) => {
        nativeWrites.push(args[2]);
        const record = await f.ctx.write(...args);
        if (interrupt && args[2] === second.id) throw Error("simulated_receipt_failure");
        return record;
      },
    };
    const call = (body?: object) => executionHttp(
      new Request("http://localhost/api/copilot/tasks/test/execution", body
        ? { method: "POST", body: JSON.stringify(body) }
        : undefined),
      f.record.id,
      async () => ctx,
    );
    const ids = [f.step.id, second.id];
    const response = await call({ action: "grant", stepIds: ids, confirmedIds: ids, mode: "ask_always" });
    assert.equal(response.status, 200);
    const partial = await response.json();
    assert.equal(partial.state, "partial_or_waiting");
    assert.equal(partial.completed.length, 1);
    assert.deepEqual(nativeWrites, ids);

    const persisted = await (await call()).json();
    assert.equal(persisted.steps.find((s: { id: string }) => s.id === f.step.id).status, "succeeded");
    const failed = persisted.steps.find((s: { id: string }) => s.id === second.id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.lastError, "simulated_receipt_failure");
    assert.deepEqual(persisted.receipts.map((r: { id: string }) => r.id), [partial.completed[0].id]);
    assert.equal(persisted.grants.find((g: { id: string }) => g.id === partial.grant.id).remainingActions, 1);
    assert.deepEqual(nativeWrites, ids);

    interrupt = false;
    const resumed = await call({ action: "execute", stepId: second.id, grantId: partial.grant.id });
    assert.equal(resumed.status, 200);
    const final = await readExecutions(ctx, f.record.id);
    assert.deepEqual(final.steps.map((s) => s.status), ["succeeded", "succeeded"]);
    assert.equal(final.receipts.length, 2);
    assert.equal(final.grants.find((g) => g.id === partial.grant.id)?.remainingActions, 0);
    assert.deepEqual(nativeWrites, [...ids, second.id]);
    const records = await f.pg.query(
      "SELECT name, criteria FROM yucer_gtm.market_segment WHERE workspace_id=$1 ORDER BY priority",
      [f.session.workspaceId],
    );
    assert.deepEqual(records.rows.map((r) => r.name), ["Receipt market", "Recovery market"]);
    assert.deepEqual(records.rows[1].criteria, {
      industries: [], regions: [], needSummary: "Optional matching dimensions are not set",
    });
  }),
);

test("editing an existing source hides obsolete content but preserves independently validated receipt recovery", {skip},()=>fixture(async f=>{
  const first=await executeStep(f.ctx,f.record.id,{stepId:f.step.id,grantId:f.grant.id});
  const result=first.result as unknown as {object:{kind:"segment";id:string};version:string};
  const task=await f.store.create(f.scope,"Refine saved market",TASK_RULE_VERSION,[{...result.object,version:result.version,role:"target"}],randomUUID());
  const form=await f.ctx.task.business!.prepare(mergeForm(null,"segment",result.object.id,{name:"Refined market"}));
  await f.store.mutate(f.scope,task.id,task.revision,{ruleVersion:TASK_RULE_VERSION,draft:{key:"refine",text:JSON.stringify(form),contractVersion:"business-form/1"}});
  const draft=(await f.store.load(f.scope,task.id,true))!.drafts[0]!;
  const step=await proposeExecution(f.ctx,task.id,{key:"refine",draftId:draft.id,operation:"save"});
  const grant=await grantExecution(f.ctx,task.id,{stepIds:[step.id],confirmedIds:[step.id],mode:"ask_always"});
  const receipt=await executeStep(f.ctx,task.id,{stepId:step.id,grantId:grant.id});
  const state=await readExecutions(f.ctx,task.id);
  assert.equal(state.receipts.length,1);
  assert.equal(state.steps[0]!.form,undefined);
  assert.equal(state.steps[0]!.status,"succeeded");
  const phase=await continueExecution(f.ctx,task.id,receipt.id);
  assert.notEqual(phase.taskId,task.id);
  const blocked={...f.ctx,task:{...f.ctx.task,refresh:async()=>({...f.ctx.task,source:async()=>null})}};
  assert.equal((await readExecutions(blocked,task.id)).receipts.length,0);
  assert.equal((await readExecutions(blocked,task.id)).steps[0]!.status,"result_unavailable");
  await assert.rejects(continueExecution(blocked,task.id,receipt.id),/receipt_source_changed/);
}));

test("grant boundaries refuse malformed scope, changed identity, missing permission and stale rules", {skip},()=>fixture(async f=>{
  for(const value of [null,[],{sql:"select 1"},{stepIds:[]},{stepIds:[f.step.id,f.step.id],mode:"ask_always"},{stepIds:[f.step.id],confirmedIds:[randomUUID()],mode:"ask_always"},{stepIds:[f.step.id],mode:"unknown"},{stepIds:[f.step.id],mode:"ask_always",seconds:3601},{stepIds:[f.step.id],mode:"ask_always",maxActions:2}])
    await assert.rejects(grantExecution(f.ctx,f.record.id,value),/invalid_execution_request/);
  for(const value of [{key:"market",draftId:"bad",operation:"save"},{key:"market",draftId:f.draft.id,operation:"publish"},{key:"missing",draftId:f.draft.id,operation:"save"}])
    await assert.rejects(proposeExecution(f.ctx,f.record.id,value));
  const noPermission={...f.ctx.task,holder:{permissions:new Set<never>()}};
  const changed={...f.ctx.task,sub:"other"};
  for(const live of [null,noPermission,changed])
    await assert.rejects(readExecutions({...f.ctx,task:{...f.ctx.task,refresh:async()=>live}},f.record.id));
  await assert.rejects(revokeExecution(f.ctx,f.record.id,randomUUID()),/grant_unavailable/);
  await assert.rejects(continueExecution(f.ctx,f.record.id,randomUUID()),/not_found/);
  await f.pg.query("UPDATE yucer_agent.agent_task SET rule_version='obsolete' WHERE id=$1",[f.record.id]);
  await assert.rejects(proposeExecution(f.ctx,f.record.id,{key:"market",draftId:f.draft.id,operation:"save"}),/rule_changed/);
  assert.equal((await readExecutions(f.ctx,f.record.id)).steps[0]!.form,undefined);
}));

test("ten customers share one exact-snapshot grant; retries recover original UUIDs and partial failure does not repeat successful registrations",{skip},()=>fixture(async f=>{
 const steps=[];
 for(let i=0;i<10;i++){
  const current=(await f.store.load(f.scope,f.record.id,true))!;
  const key=`customer_${i}`,form=await f.ctx.task.business!.prepare(mergeForm(null,"account",null,{name:`XC acceptance ${i}`,tier:"standard"}));
  assert.equal(await f.store.mutate(f.scope,f.record.id,current.task.revision,{ruleVersion:TASK_RULE_VERSION,draft:{key,contractVersion:"business-form/1",text:JSON.stringify(form)}}),true);
  const draft=(await f.store.load(f.scope,f.record.id,true))!.drafts.find(d=>d.key===key)!;
  steps.push(await proposeExecution(f.ctx,f.record.id,{key,draftId:draft.id,operation:"save"}));
 }
 const ids=steps.map(s=>s.id),grant=await grantExecution(f.ctx,f.record.id,{stepIds:ids,confirmedIds:ids,mode:"ask_always"});
 const receipts=[];
 for(let i=0;i<steps.length;i++){
  const input={stepId:steps[i]!.id,grantId:grant.id};
  if(i===4){await assert.rejects(executeStep({...f.ctx,write:async()=>{throw Error("temporary_failure");}},f.record.id,input));continue;}
  receipts.push(await executeStep(f.ctx,f.record.id,input));
 }
 assert.equal((await f.pg.query("SELECT count(*) FROM yucer_core.account WHERE workspace_id=$1",[f.session.workspaceId])).rows[0].count,"9");
 const failed=await executeStep(f.ctx,f.record.id,{stepId:steps[4]!.id,grantId:grant.id});receipts.push(failed);
 const replayed=await executeStep(f.ctx,f.record.id,{stepId:steps[0]!.id,grantId:grant.id});assert.equal(replayed.id,receipts[0]!.id);
 assert.equal(new Set(receipts.map(r=>r.id)).size,10);
 assert.equal((await f.pg.query("SELECT count(*) FROM yucer_core.account WHERE workspace_id=$1",[f.session.workspaceId])).rows[0].count,"10");
 const results=await readExecutions(f.ctx,f.record.id);assert.equal(results.receipts.length,10);assert.ok(results.receipts.every(r=>(r.result as {object:{kind:string}}).object.kind==="account"));
}));
