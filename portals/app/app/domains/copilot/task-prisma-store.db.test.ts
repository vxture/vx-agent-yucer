import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import { PrismaTaskStore } from "./task-prisma-store";
import { PrismaCopilotStore } from "./prisma-store";
import { TASK_RULE_VERSION, type TaskScope } from "./lib/task-contract";
import {
  createPrivateTask,
  readPrivateTask,
  changePrivateTask,
  runPrivateTaskTurn,
  type TaskContext,
} from "./task-service";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { unwrap } from "../shared/result";
import type { AtlasClient } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";

const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL";
async function fixture(
  fn: (store: PrismaTaskStore, scope: TaskScope, c: Client) => Promise<void>,
) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const scope = { workspaceId: randomUUID(), actorSub: "task-owner" };
  try {
    await fn(new PrismaTaskStore(), scope, c);
  } finally {
    await c.query("RESET ROLE");
    for (const table of [
      "agent_task_turn",
      "agent_task_checkpoint",
      "agent_task_draft",
      "agent_task_session",
      "agent_task_reference",
      "agent_task",
      "agent_message",
      "agent_session",
    ]) {
      await c.query(`DELETE FROM yucer_agent.${table} WHERE workspace_id=$1`, [
        scope.workspaceId,
      ]);
    }
    await c.end();
  }
}

test(
  "task and task-session creation is atomic and idempotent across store instances",
  { skip },
  async () =>
    fixture(async (s, scope, c) => {
      const requestId = randomUUID();
      const tasks = await Promise.all(
        Array.from({ length: 4 }, () =>
          new PrismaTaskStore().create(
            scope,
            "goal",
            TASK_RULE_VERSION,
            [],
            requestId,
          ),
        ),
      );
      assert.equal(new Set(tasks.map((t) => t.id)).size, 1);
      assert.equal(new Set(tasks.map((t) => t.sessionId)).size, 1);
      assert.equal(
        (
          await c.query(
            "SELECT count(*) FROM yucer_agent.agent_session WHERE workspace_id=$1",
            [scope.workspaceId],
          )
        ).rows[0].count,
        "1",
      );
      assert.equal((await s.load(scope, tasks[0].id))?.checkpoint?.lastSeq, 0);
    }),
);

test(
  "private scope is applied in store reads, writes, drafts and turns",
  { skip },
  async () =>
    fixture(async (s, scope) => {
      const t = await s.create(
        scope,
        "private",
        TASK_RULE_VERSION,
        [],
        randomUUID(),
      );
      for (const other of [
        { ...scope, actorSub: "administrator" },
        { ...scope, workspaceId: randomUUID() },
      ]) {
        assert.equal(await s.load(other, t.id, true), null);
        assert.deepEqual(await s.list(other), []);
        assert.equal(
          await s.mutate(other, t.id, 1, {
            ruleVersion: TASK_RULE_VERSION,
            draft: { key: "n", text: "replace" },
          }),
          false,
        );
        assert.equal(
          await s.beginTurn(
            other,
            t.id,
            1,
            randomUUID(),
            "read",
            "hash",
            TASK_RULE_VERSION,
          ),
          null,
        );
      }
    }),
);

test(
  "task sessions and messages cannot be reached through legacy copilot stores",
  { skip },
  async () =>
    fixture(async (s, scope) => {
      const t = await s.create(
        scope,
        "goal",
        TASK_RULE_VERSION,
        [],
        randomUUID(),
      );
      const turn = await s.beginTurn(
        scope,
        t.id,
        1,
        randomUUID(),
        "private question",
        "hash",
        TASK_RULE_VERSION,
      );
      assert.ok(turn);
      const legacy = new PrismaCopilotStore();
      assert.equal(
        await legacy.getSession(scope.workspaceId, t.sessionId),
        null,
      );
      assert.deepEqual(
        await legacy.listSessions(scope.workspaceId, scope.actorSub),
        [],
      );
      assert.deepEqual(
        await legacy.listMessages(scope.workspaceId, t.sessionId),
        [],
      );
      await assert.rejects(() =>
        legacy.appendMessage(scope.workspaceId, {
          sessionId: t.sessionId,
          role: "assistant",
          content: "bypass",
        }),
      );
    }),
);

test(
  "draft revisions are immutable and simultaneous stale writes have one winner",
  { skip },
  async () =>
    fixture(async (s, scope, c) => {
      const t = await s.create(
        scope,
        "goal",
        TASK_RULE_VERSION,
        [],
        randomUUID(),
      );
      const outcomes = await Promise.all(
        ["one", "two"].map((text) =>
          new PrismaTaskStore().mutate(scope, t.id, 1, {
            ruleVersion: TASK_RULE_VERSION,
            draft: { key: "notes", text },
          }),
        ),
      );
      assert.equal(outcomes.filter(Boolean).length, 1);
      assert.equal(
        await s.mutate(scope, t.id, 2, {
          ruleVersion: TASK_RULE_VERSION,
          draft: { key: "notes", text: "corrected" },
        }),
        true,
      );
      assert.equal(
        (await s.load(scope, t.id, true))?.drafts[0].text,
        "corrected",
      );
      assert.equal(
        (
          await c.query(
            "SELECT count(*) FROM yucer_agent.agent_task_draft WHERE task_id=$1",
            [t.id],
          )
        ).rows[0].count,
        "2",
      );
      await c.query("SET ROLE yucer_svc");
      await assert.rejects(
        () =>
          c.query(
            "UPDATE yucer_agent.agent_task_draft SET content='{}' WHERE task_id=$1",
            [t.id],
          ),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          c.query("DELETE FROM yucer_agent.agent_task_draft WHERE task_id=$1", [
            t.id,
          ]),
        /permission denied/,
      );
    }),
);

test(
  "request admission and completion serialize across replicas and never duplicate messages",
  { skip },
  async () =>
    fixture(async (s, scope, c) => {
      const t = await s.create(
          scope,
          "goal",
          TASK_RULE_VERSION,
          [],
          randomUUID(),
        ),
        request = randomUUID();
      const attempts = await Promise.all(
        Array.from({ length: 4 }, () =>
          new PrismaTaskStore().beginTurn(
            scope,
            t.id,
            1,
            request,
            "q",
            "hash",
            TASK_RULE_VERSION,
          ),
        ),
      );
      const turn = attempts.find(Boolean)!;
      assert.equal(attempts.filter(Boolean).length, 1);
      assert.equal(
        await s.mutate(scope, t.id, 2, {
          ruleVersion: TASK_RULE_VERSION,
          page: null,
        }),
        false,
      );
      const completions = await Promise.all(
        Array.from({ length: 3 }, () =>
          new PrismaTaskStore().finishTurn(scope, t.id, turn.id, {
            answer: "answer",
            tokens: 4,
          }),
        ),
      );
      assert.equal(completions.filter(Boolean).length, 1);
      const b = await s.load(scope, t.id, true);
      assert.deepEqual(
        b?.messages.map((m) => m.seq),
        [1, 2],
      );
      assert.equal(b?.task.revision, 3);
      assert.equal(b?.checkpoint?.lastSeq, 2);
      assert.equal(b?.turns[0].status, "succeeded");
      // The service role cannot rewrite a completed receipt even if it has UPDATE.
      await c.query("SET ROLE yucer_svc");
      await assert.rejects(
        () =>
          c.query(
            "UPDATE yucer_agent.agent_task_turn SET error_key='overwrite' WHERE id=$1",
            [turn.id],
          ),
        /task_turn_finished/,
      );
    }),
);

test(
  "composite foreign keys reject cross-workspace and cross-owner references and legacy sessions",
  { skip },
  async () =>
    fixture(async (s, scope, c) => {
      const task = await s.create(
        scope,
        "goal",
        TASK_RULE_VERSION,
        [],
        randomUUID(),
      );
      for (const bad of [
        { ...scope, workspaceId: randomUUID() },
        { ...scope, actorSub: "someone-else" },
      ]) {
        await assert.rejects(
          () =>
            c.query(
              "INSERT INTO yucer_agent.agent_task_reference(workspace_id,actor_sub,task_id,object_kind,object_id,source_version,role) VALUES($1,$2,$3,'account',$4,'v1','target')",
              [bad.workspaceId, bad.actorSub, task.id, randomUUID()],
            ),
          /foreign key/,
        );
        const session = await c.query(
          "INSERT INTO yucer_agent.agent_session(workspace_id,actor_sub) VALUES($1,$2) RETURNING id",
          [scope.workspaceId, "someone-else"],
        );
        await assert.rejects(
          () =>
            c.query(
              "INSERT INTO yucer_agent.agent_task_session(workspace_id,actor_sub,task_id,session_id) VALUES($1,$2,$3,$4)",
              [scope.workspaceId, scope.actorSub, task.id, session.rows[0].id],
            ),
          /foreign key/,
        );
      }
    }),
);

test(
  "task ownership, source closure and checkpoint rule stamps are frozen for service role",
  { skip },
  async () =>
    fixture(async (s, scope, c) => {
      const task = await s.create(
        scope,
        "goal",
        TASK_RULE_VERSION,
        [{ kind: "account", id: randomUUID(), version: "v1", role: "target" }],
        randomUUID(),
      );
      await c.query("SET ROLE yucer_svc");
      for (const sql of [
        "UPDATE yucer_agent.agent_task SET actor_sub='administrator' WHERE id=$1",
        "UPDATE yucer_agent.agent_task SET session_id=gen_random_uuid() WHERE id=$1",
        "DELETE FROM yucer_agent.agent_task_reference WHERE task_id=$1",
        "UPDATE yucer_agent.agent_task_checkpoint SET rule_version='unsafe' WHERE task_id=$1",
      ]) {
        await assert.rejects(
          () => c.query(sql, [task.id]),
          /permission denied/,
        );
      }
    }),
);

test(
  "real service-role grants support task, note, checkpoint and turn persistence",
  { skip },
  async () =>
    fixture(async (s, scope, c) => {
      // Exercise real adapters on a dedicated role-scoped URL through the URL's
      // options. The application's Prisma client is shared, so use SET ROLE checks
      // here to independently prove every column used by the adapter is writable.
      const t = await s.create(
        scope,
        "goal",
        TASK_RULE_VERSION,
        [],
        randomUUID(),
      );
      await c.query("SET ROLE yucer_svc");
      await c.query(
        "UPDATE yucer_agent.agent_task SET status='paused',rule_version=$2,revision=revision+1,page=NULL,updated_at=now() WHERE id=$1",
        [t.id, TASK_RULE_VERSION],
      );
      await c.query(
        "INSERT INTO yucer_agent.agent_task_draft(workspace_id,actor_sub,task_id,draft_key,contract_version,revision,content) VALUES($1,$2,$3,'n','private-notes/1',2,'{\"text\":\"note\"}')",
        [scope.workspaceId, scope.actorSub, t.id],
      );
      await c.query(
        "INSERT INTO yucer_agent.agent_task_checkpoint(workspace_id,actor_sub,task_id,rule_version,task_revision,last_seq) VALUES($1,$2,$3,$4,2,0)",
        [scope.workspaceId, scope.actorSub, t.id, TASK_RULE_VERSION],
      );
      assert.equal(
        (
          await c.query(
            "SELECT content->>'text' AS text FROM yucer_agent.agent_task_draft WHERE task_id=$1",
            [t.id],
          )
        ).rows[0].text,
        "note",
      );
    }),
);

test(
  "legacy links preserve original actor and subject without modifying or importing messages",
  { skip },
  async () =>
    fixture(async (s, scope, c) => {
      const old = await new PrismaCopilotStore().createSession(
        scope.workspaceId,
        {
          actorSub: scope.actorSub,
          subjectType: "account",
          subjectId: randomUUID(),
        },
      );
      await new PrismaCopilotStore().appendMessage(scope.workspaceId, {
        sessionId: old.id,
        role: "user",
        content: "legacy original",
      });
      const task = await s.create(
        scope,
        "new",
        TASK_RULE_VERSION,
        [],
        randomUUID(),
      );
      assert.equal(
        await s.mutate(scope, task.id, 1, {
          ruleVersion: TASK_RULE_VERSION,
          legacySessionId: old.id,
        }),
        true,
      );
      const b = await s.load(scope, task.id, true);
      assert.equal(b?.legacy[0].historyPolicy, "excluded");
      assert.equal(b?.messages.length, 0);
      const record = (
        await c.query(
          "SELECT actor_sub,subject_id FROM yucer_agent.agent_session WHERE id=$1",
          [old.id],
        )
      ).rows[0];
      assert.equal(record.actor_sub, scope.actorSub);
      assert.equal(record.subject_id, old.subjectId);
      assert.equal(
        (
          await new PrismaCopilotStore().listMessages(scope.workspaceId, old.id)
        )[0].content,
        "legacy original",
      );
    }),
);

test(
  "persistent task resumes with one receipt and no implicit second model call",
  { skip },
  async () =>
    fixture(async (s, scope) => {
      const sessions = new PrismaCopilotStore();
      let calls = 0;
      const ctx: TaskContext = {
        workspaceId: scope.workspaceId,
        sub: scope.actorSub,
        holder: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
        entitlement: {
          ...EMPTY_ENTITLEMENT,
          workspace_id: scope.workspaceId,
          product: "yucer",
          tier: "pro",
        },
        store: s,
        sessions,
        source: async () => null,
        refresh: async () => ctx,
      };
      const task = unwrap(
        await createPrivateTask(ctx, {
          requestId: randomUUID(),
          goal: "persisted",
        }),
      );
      const deps = {
        tenantId: "tenant",
        atlasClient: {
          async chat() {
            calls++;
            return {
              id: "r",
              message: { role: "assistant", content: "persisted result" },
              usage: { totalTokens: 4, promptTokens: 2, completionTokens: 2 },
              latencyMs: 1,
            };
          },
        } as unknown as AtlasClient,
        runosClient: {} as RunosClient,
        meter: { admit: () => ({ ok: true as const }), record: async () => "" },
      };
      const input = {
        requestId: randomUUID(),
        revision: 1,
        question: "question",
      };
      unwrap(await runPrivateTaskTurn(ctx, task.id, input, deps));
      const b = unwrap(
        await readPrivateTask(
          { ...ctx, store: new PrismaTaskStore() },
          task.id,
        ),
      );
      assert.equal(b.messages.length, 2);
      assert.equal(
        unwrap(await runPrivateTaskTurn(ctx, task.id, input, deps)).replayed,
        true,
      );
      assert.equal(calls, 1);
      const changed = unwrap(
        await changePrivateTask(ctx, task.id, {
          action: "notes",
          revision: b.task.revision,
          key: "note",
          text: "private draft",
          contractVersion: "private-notes/1",
        }),
      );
      assert.equal(changed.drafts[0].text, "private draft");
    }),
);

test(
  "the Prisma task adapter completes a full round trip with actual service-role grants",
  { skip },
  async () =>
    fixture(async (_store, scope) => {
      const url = new URL(process.env.DATABASE_URL!);
      url.searchParams.set("options", "-c role=yucer_svc");
      const script = `
      import assert from 'node:assert/strict';
      import { randomUUID } from 'node:crypto';
      import { PrismaTaskStore } from './app/domains/copilot/task-prisma-store.ts';
      import { getPrismaClient } from './app/lib/db.ts';
      const store = new PrismaTaskStore(), scope = JSON.parse(process.env.TASK_TEST_SCOPE);
      const p = await getPrismaClient();
      try {
        assert.equal((await p.$queryRawUnsafe('SELECT current_user AS role'))[0].role, 'yucer_svc');
        const t = await store.create(scope, 'service-role goal', 'xiaoyu/1', [], randomUUID());
        assert.equal(await store.mutate(scope,t.id,1,{ruleVersion:'xiaoyu/1',draft:{key:'note',text:'private'}}),true);
        const turn = await store.beginTurn(scope,t.id,2,randomUUID(),'question','hash','xiaoyu/1');
        assert.ok(turn);
        assert.equal(await store.finishTurn(scope,t.id,turn.id,{answer:'answer',tokens:2}),true);
        const loaded = await store.load(scope,t.id,true);
        assert.equal(loaded.turns[0].status,'succeeded');
        assert.equal(loaded.messages.length,2);
        assert.equal(loaded.drafts[0].text,'private');
        assert.equal(loaded.checkpoint.taskRevision,4);
      } finally { await p.$disconnect(); }
    `;
      await promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: url.toString(),
            TASK_TEST_SCOPE: JSON.stringify(scope),
          },
          timeout: 20000,
        },
      );
    }),
);

test("business form snapshots and query source closure commit atomically with the assistant answer",{skip},async()=>fixture(async(store,scope,c)=>{
 const ref={kind:"access" as const,id:randomUUID(),version:"acl-v1",role:"context" as const};
 const task=await store.create(scope,"form review",TASK_RULE_VERSION,[],randomUUID());
 const turn=await store.beginTurn(scope,task.id,task.revision,randomUUID(),"prepare market","hash",TASK_RULE_VERSION);
 const text=JSON.stringify({module:"segment",targetId:null,baseVersion:null,manualFields:[],sources:[ref],fields:{name:"GIS market"}});
 assert.equal(await store.finishTurn(scope,task.id,turn!.id,{answer:"Private draft ready",tokens:2,references:[ref],forms:[{key:"market",text}]}),true);
 const saved=await new PrismaTaskStore().load(scope,task.id,true);assert.equal(saved!.drafts[0]!.contractVersion,"business-form/1");assert.equal(saved!.drafts[0]!.text,text);assert.equal(saved!.references[0]!.kind,"access");assert.equal(saved!.messages.length,2);
 const next=await store.beginTurn(scope,task.id,saved!.task.revision,randomUUID(),"next","next-hash",TASK_RULE_VERSION);
 await assert.rejects(store.finishTurn(scope,task.id,next!.id,{answer:"must roll back",tokens:2,references:[{...ref,version:"acl-v2"}],forms:[{key:"market",text:"must roll back"}]}));
 const rolled=await store.load(scope,task.id,true);assert.equal(rolled!.drafts[0]!.text,text);assert.equal(rolled!.messages.length,3);assert.equal(rolled!.task.revision,saved!.task.revision+1);
 await c.query("SET ROLE yucer_svc");await assert.rejects(c.query("UPDATE yucer_agent.agent_task_draft SET content=$1 WHERE task_id=$2",[{text:"mutated"},task.id]),/permission denied/);
}));
