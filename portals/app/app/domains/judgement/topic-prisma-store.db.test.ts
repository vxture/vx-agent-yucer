import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import { PrismaTopicStore } from "./topic-prisma-store";
const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL";
test(
  "topic replicas deduplicate, CAS and isolate owner; service role cannot alter attribution",
  { skip },
  async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const owner = { workspaceId: randomUUID(), actorSub: "topic-test" };
    try {
      const input = {
        ...owner,
        judgementId: "sample-rule",
        scope: "mine" as const,
        basisVersion: "v1",
        accessVersion: "acl1",
      };
      const store = new PrismaTopicStore(),
        [a, b] = await Promise.all([
          store.ensure(input),
          new PrismaTopicStore().ensure(input),
        ]);
      assert.equal(a.id, b.id);
      assert.equal(
        await store.get({ ...owner, actorSub: "other" }, a.id),
        null,
      );
      const patch = {
        basisVersion: "v1",
        accessVersion: "acl1",
        status: "processing" as const,
        taskId: null,
        verifiedAt: null,
      };
      const changes = await Promise.all([
        store.change(owner, a.id, 1, patch),
        new PrismaTopicStore().change(owner, a.id, 1, patch),
      ]);
      assert.equal(changes.filter(Boolean).length, 1);
      await c.query("SET ROLE yucer_svc");
      await assert.rejects(
        () =>
          c.query(
            "UPDATE yucer_agent.agent_judgement_topic SET actor_sub='foreign' WHERE id=$1",
            [a.id],
          ),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          c.query("DELETE FROM yucer_agent.agent_judgement_topic WHERE id=$1", [
            a.id,
          ]),
        /permission denied/,
      );
    } finally {
      await c.query("RESET ROLE");
      await c.query(
        "DELETE FROM yucer_agent.agent_judgement_topic WHERE workspace_id=$1",
        [owner.workspaceId],
      );
      await c.end();
    }
  },
);
