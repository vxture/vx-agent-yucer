import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import { PrismaKnowledgeStore } from "./knowledge-prisma-store";
import { PrismaTaskStore } from "./task-prisma-store";
import type { TaskScope } from "./lib/task-contract";
const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL";
async function fixture(
  fn: (
    k: PrismaKnowledgeStore,
    t: PrismaTaskStore,
    s: TaskScope,
    c: Client,
  ) => Promise<void>,
) {
  const c = new Client({ connectionString: process.env.DATABASE_URL }),
    s = { workspaceId: randomUUID(), actorSub: "knowledge-owner" };
  await c.connect();
  try {
    await fn(new PrismaKnowledgeStore(), new PrismaTaskStore(), s, c);
  } finally {
    await c.query("RESET ROLE");
    for (const table of [
      "agent_task_knowledge",
      "agent_business_knowledge_revision",
      "agent_business_knowledge",
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
  title: "GIS subscription knowledge",
  text: "Reviewed business content",
  kind: "decision" as const,
  audience: "workspace" as const,
  memberSubs: [],
  sources: [],
  reviewedDigest: "a".repeat(64),
});
test(
  "shared knowledge persists across replicas with idempotency, atomic revisions and immutable snapshots",
  { skip },
  async () =>
    fixture(async (k, _t, s, c) => {
      const input = data(s),
        rows = await Promise.all(
          Array.from({ length: 4 }, () =>
            new PrismaKnowledgeStore().create(input),
          ),
        );
      assert.equal(new Set(rows.map((r) => r.id)).size, 1);
      const r = rows[0];
      const changed = await Promise.all(
        ["first", "second"].map((text) =>
          new PrismaKnowledgeStore().change(s.workspaceId, r.id, 1, { text }),
        ),
      );
      assert.equal(changed.filter(Boolean).length, 1);
      assert.equal((await k.get(s.workspaceId, r.id))?.revision, 2);
      assert.equal(await k.get(randomUUID(), r.id), null);
      assert.equal(
        (
          await c.query(
            "SELECT count(*) FROM yucer_agent.agent_business_knowledge_revision WHERE knowledge_id=$1",
            [r.id],
          )
        ).rows[0].count,
        "2",
      );
    }),
);
test(
  "shared task dependencies bind business UUID, workspace and immutable revision without changing old history",
  { skip },
  async () =>
    fixture(async (k, t, s, c) => {
      const task = await t.create(s, "GIS", "xiaoyu/1", [], randomUUID()),
        r = await k.create(data(s));
      assert.equal(await k.bind(s, task.id, [{ id: r.id, revision: 1 }]), true);
      assert.equal(
        await k.bind({ ...s, actorSub: "other" }, task.id, [
          { id: r.id, revision: 1 },
        ]),
        false,
      );
      assert.equal(
        await k.bind({ ...s, workspaceId: randomUUID() }, task.id, [
          { id: r.id, revision: 1 },
        ]),
        false,
      );
      await k.change(s.workspaceId, r.id, 1, { text: "current content" });
      assert.equal(
        await k.bind(s, task.id, [{ id: r.id, revision: 2 }]),
        false,
      );
      assert.deepEqual(await k.dependencies(s, task.id), [
        { id: r.id, revision: 1 },
      ]);
      await assert.rejects(
        c.query(
          "INSERT INTO yucer_agent.agent_task_knowledge(workspace_id,actor_sub,task_id,knowledge_id,knowledge_revision) VALUES ($1,$2,$3,$4,1)",
          [s.workspaceId, "other", task.id, r.id],
        ),
      );
      await assert.rejects(
        c.query(
          "INSERT INTO yucer_agent.agent_business_knowledge_revision(workspace_id,knowledge_id,revision,title,text,kind,state,audience,member_subs) VALUES ($1,$2,9,'bad','bad','fact','active','workspace','{}')",
          [randomUUID(), r.id],
        ),
      );
    }),
);
test(
  "service role cannot alter knowledge provenance, snapshot history or personal knowledge dependency closure",
  { skip },
  async () =>
    fixture(async (k, _t, s, c) => {
      const r = await k.create(data(s));
      await c.query("SET ROLE yucer_svc");
      for (const sql of [
        "UPDATE yucer_agent.agent_business_knowledge SET actor_sub='other' WHERE id=$1",
        "UPDATE yucer_agent.agent_business_knowledge SET sources='[]',revision=2 WHERE id=$1",
        "UPDATE yucer_agent.agent_business_knowledge_revision SET text='tampered' WHERE knowledge_id=$1",
        "DELETE FROM yucer_agent.agent_business_knowledge WHERE id=$1",
        "UPDATE yucer_agent.agent_private_memory SET knowledge_sources='[]' WHERE id=$1",
      ])
        await assert.rejects(c.query(sql, [r.id]), /permission denied/);
      await assert.rejects(
        c.query(
          "UPDATE yucer_agent.agent_business_knowledge SET text='missing revision' WHERE id=$1",
          [r.id],
        ),
        /memory_revision_required/,
      );
      await assert.rejects(
        c.query(
          "UPDATE yucer_agent.agent_business_knowledge SET audience='members',member_subs='{}',revision=2 WHERE id=$1",
          [r.id],
        ),
        /agent_business_knowledge_audience/,
      );
      await c.query(
        "UPDATE yucer_agent.agent_business_knowledge SET state='stopped',revision=2 WHERE id=$1",
        [r.id],
      );
    }),
);
