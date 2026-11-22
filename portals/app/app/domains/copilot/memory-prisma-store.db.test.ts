import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import { PrismaMemoryStore } from "./memory-prisma-store";
import { PrismaTaskStore } from "./task-prisma-store";
import type { TaskScope } from "./lib/task-contract";
const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL";
async function fixture(
  fn: (
    memory: PrismaMemoryStore,
    tasks: PrismaTaskStore,
    s: TaskScope,
    c: Client,
  ) => Promise<void>,
) {
  const c = new Client({ connectionString: process.env.DATABASE_URL }),
    s = { workspaceId: randomUUID(), actorSub: "memory-owner" };
  await c.connect();
  try {
    await fn(new PrismaMemoryStore(), new PrismaTaskStore(), s, c);
  } finally {
    await c.query("RESET ROLE");
    for (const table of [
      "agent_task_memory",
      "agent_private_memory_revision",
      "agent_private_memory",
      "agent_task_turn",
      "agent_task_checkpoint",
      "agent_task_draft",
      "agent_task_session",
      "agent_task_reference",
      "agent_task",
      "agent_message",
      "agent_session",
    ])
      await c.query(`DELETE FROM yucer_agent.${table} WHERE workspace_id=$1`, [
        s.workspaceId,
      ]);
    await c.end();
  }
}
const data = (s: TaskScope) => ({
  ...s,
  requestId: randomUUID(),
  text: "private subscription decision",
  kind: "decision" as const,
  origin: "user" as const,
  taskId: null,
  messageIds: [],
  sources: [],
  parents: [],
});
test(
  "memory persistence is idempotent and atomic across replicas; revisions retain corrections",
  { skip },
  async () =>
    fixture(async (m, _t, s, c) => {
      const input = data(s),
        rows = await Promise.all(
          Array.from({ length: 4 }, () =>
            new PrismaMemoryStore().create(input),
          ),
        );
      assert.equal(new Set(rows.map((r) => r.id)).size, 1);
      const id = rows[0].id,
        changes = await Promise.all(
          ["a", "b"].map((text) =>
            new PrismaMemoryStore().change(s, id, 1, { text }),
          ),
        );
      assert.equal(changes.filter(Boolean).length, 1);
      assert.equal((await m.get(s, id))?.revision, 2);
      assert.equal(
        (
          await c.query(
            "SELECT count(*) FROM yucer_agent.agent_private_memory_revision WHERE memory_id=$1",
            [id],
          )
        ).rows[0].count,
        "2",
      );
      assert.equal(await m.get({ ...s, actorSub: "administrator" }, id), null);
      assert.equal(
        await m.change({ ...s, workspaceId: randomUUID() }, id, 2, {
          text: "overwrite",
        }),
        null,
      );
    }),
);
test(
  "task memory closure cannot replace a used revision or cross owner and workspace",
  { skip },
  async () =>
    fixture(async (m, t, s, c) => {
      const r = await m.create(data(s)),
        task = await t.create(s, "goal", "xiaoyu/1", [], randomUUID());
      assert.equal(await m.bind(s, task.id, [{ id: r.id, revision: 1 }]), true);
      await m.change(s, r.id, 1, { text: "corrected" });
      assert.equal(
        await new PrismaMemoryStore().bind(s, task.id, [
          { id: r.id, revision: 2 },
        ]),
        false,
      );
      assert.deepEqual(await m.dependencies(s, task.id), [
        { id: r.id, revision: 1 },
      ]);
      assert.deepEqual(
        await m.dependencies({ ...s, actorSub: "administrator" }, task.id),
        [],
      );
      const other = await m.create(data({ ...s, actorSub: "other" }));
      await assert.rejects(
        () =>
          c.query(
            "INSERT INTO yucer_agent.agent_task_memory(workspace_id,actor_sub,task_id,memory_id,memory_revision) VALUES($1,$2,$3,$4,1)",
            [s.workspaceId, s.actorSub, task.id, other.id],
          ),
        /foreign key/,
      );
      await assert.rejects(
        () =>
          c.query(
            "INSERT INTO yucer_agent.agent_private_memory(workspace_id,actor_sub,request_id,text,kind,origin,task_id) VALUES($1,'other',$2,'x','decision','user',$3)",
            [s.workspaceId, randomUUID(), task.id],
          ),
        /foreign key/,
      );
    }),
);
test(
  "service grants freeze provenance, revisions and task dependencies",
  { skip },
  async () =>
    fixture(async (m, t, s, c) => {
      const r = await m.create(data(s)),
        task = await t.create(s, "goal", "xiaoyu/1", [], randomUUID());
      await m.bind(s, task.id, [{ id: r.id, revision: 1 }]);
      await c.query("SET ROLE yucer_svc");
      for (const sql of [
        "UPDATE yucer_agent.agent_private_memory SET actor_sub='other' WHERE id=$1",
        "UPDATE yucer_agent.agent_private_memory SET sources='[]' WHERE id=$1",
        "DELETE FROM yucer_agent.agent_private_memory WHERE id=$1",
        "UPDATE yucer_agent.agent_private_memory_revision SET text='fake' WHERE memory_id=$1",
        "DELETE FROM yucer_agent.agent_task_memory WHERE memory_id=$1",
      ])
        await assert.rejects(() => c.query(sql, [r.id]), /permission denied/);
      await assert.rejects(
        () =>
          c.query(
            "UPDATE yucer_agent.agent_private_memory SET text='without revision' WHERE id=$1",
            [r.id],
          ),
        /memory_revision_required/,
      );
      await c.query(
        "UPDATE yucer_agent.agent_private_memory SET state='stopped',revision=revision+1,updated_at=now() WHERE id=$1",
        [r.id],
      );
      assert.equal((await m.get(s, r.id))?.state, "stopped");
    }),
);
test(
  "old private history remains searchable beyond recent task navigation window",
  { skip },
  async () =>
    fixture(async (_m, t, s) => {
      const old = await t.create(s, "old", "xiaoyu/1", [], randomUUID());
      const turn = await t.beginTurn(
        s,
        old.id,
        1,
        randomUUID(),
        "needle-from-last-year",
        "q",
        "xiaoyu/1",
      );
      assert.ok(turn);
      await t.finishTurn(s, old.id, turn.id, {
        answer: "original evidence",
        tokens: 1,
      });
      for (let i = 0; i < 51; i++)
        await t.create(s, `recent ${i}`, "xiaoyu/1", [], randomUUID());
      assert.equal(
        (await t.list(s)).some((r) => r.id === old.id),
        false,
      );
      assert.deepEqual(
        (await t.search(s, "needle-from-last-year")).map((r) => r.id),
        [old.id],
      );
      assert.deepEqual(
        await t.search(
          { ...s, actorSub: "administrator" },
          "needle-from-last-year",
        ),
        [],
      );
    }),
);
