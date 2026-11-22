import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import type { AtlasClient } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { unwrap } from "../shared/result";
import { InMemoryCopilotStore } from "./store";
import { InMemoryTaskStore } from "./task-store";
import { InMemoryMemoryStore } from "./memory-store";
import { InMemoryKnowledgeStore } from "./knowledge-store";
import {
  changeBusinessKnowledge,
  createBusinessKnowledge,
  listBusinessKnowledge,
  previewBusinessKnowledge,
  recallBusinessKnowledge,
  searchKnowledgeMembers,
} from "./knowledge-service";
import {
  createPrivateTask,
  readPrivateTask,
  runPrivateTaskTurn,
  type TaskContext,
} from "./task-service";
import {
  captureTaskMemories,
  createPrivateMemory,
  listPrivateMemories,
  searchPrivateHistory,
} from "./memory-service";
function fixture() {
  const workspaceId = randomUUID(),
    store = new InMemoryTaskStore(),
    sessions = new InMemoryCopilotStore(),
    memory = new InMemoryMemoryStore(),
    knowledge = new InMemoryKnowledgeStore(),
    object = { kind: "segment" as const, id: randomUUID() };
  const access = new Map([
    ["alice", true],
    ["bob", true],
    ["admin", true],
  ]);
  let version = "v1";
  function context(sub = "alice", ws = workspaceId) {
    const c: TaskContext = {
      workspaceId: ws,
      sub,
      store,
      sessions,
      memory,
      knowledge,
      holder: {
        permissions: new Set(
          permissionsForRoles([
            sub === "admin" ? "workspace_admin" : "sales_rep",
          ]),
        ),
      },
      entitlement: {
        ...EMPTY_ENTITLEMENT,
        workspace_id: ws,
        product: "yucer",
        tier: "pro",
      },
      source: async (o) =>
        access.get(sub) && o.id === object.id && ws === workspaceId
          ? { ...o, version }
          : null,
      knowledgeMembers: async () =>
        ["alice", "bob", "admin"].map((sub) => ({ sub, displayName: sub })),
      refresh: async () => c,
    };
    return c;
  }
  const alice = context(),
    bob = context("bob"),
    admin = context("admin"),
    input = {
      title: "GIS subscriptions",
      text: "GIS business positioning",
      kind: "decision",
      audience: "workspace",
      memberSubs: [],
      objects: [object],
      businessOnly: true,
    };
  const create = async (patch: Record<string, unknown> = {}) => {
    const data = { ...input, ...patch },
      p = unwrap(await previewBusinessKnowledge(alice, data));
    return unwrap(
      await createBusinessKnowledge(alice, {
        ...data,
        requestId: randomUUID(),
        reviewedDigest: p.reviewedDigest,
      }),
    );
  };
  const task = async (c = alice) =>
    unwrap(
      await createPrivateTask(c, {
        requestId: randomUUID(),
        goal: "GIS subscriptions",
      }),
    );
  return {
    alice,
    bob,
    admin,
    context,
    workspaceId,
    object,
    knowledge,
    memory,
    store,
    input,
    create,
    task,
    access,
    version: (v: string) => {
      version = v;
    },
  };
}
test("team knowledge shares only reviewed business content and never private provenance", async () => {
  const f = fixture(),
    r = await f.create();
  assert.equal(unwrap(await listBusinessKnowledge(f.bob)).items[0].id, r.id);
  assert.deepEqual(unwrap(await listPrivateMemories(f.bob)).items, []);
  for (const field of [
    "taskId",
    "messageIds",
    "parents",
    "privateMemoryId",
    "workspaceId",
    "actorSub",
    "sql",
  ])
    assert.equal(
      (
        await previewBusinessKnowledge(f.alice, {
          ...f.input,
          [field]: randomUUID(),
        })
      ).ok,
      false,
      field,
    );
  assert.equal(
    (
      await createBusinessKnowledge(f.alice, {
        ...f.input,
        requestId: randomUUID(),
        reviewedDigest: "invented",
      })
    ).ok,
    false,
  );
  const review = unwrap(await previewBusinessKnowledge(f.alice, f.input));
  assert.equal(
    (
      await createBusinessKnowledge(f.alice, {
        ...f.input,
        text: "edited after review",
        requestId: randomUUID(),
        reviewedDigest: review.reviewedDigest,
      })
    ).ok,
    false,
  );
});
test("workspace, explicit audience, live source ACL and administrators remain independent", async () => {
  const f = fixture(),
    r = await f.create({ audience: "members", memberSubs: ["bob"] });
  assert.equal(unwrap(await listBusinessKnowledge(f.bob)).items.length, 1);
  assert.deepEqual(unwrap(await listBusinessKnowledge(f.admin)).items, []);
  assert.deepEqual(
    unwrap(await listBusinessKnowledge(f.context("alice", randomUUID()))).items,
    [],
  );
  f.access.set("bob", false);
  assert.deepEqual(unwrap(await listBusinessKnowledge(f.bob)).items, []);
  // An administrator may stop a shared item without gaining its body.
  assert.equal(
    (
      await changeBusinessKnowledge(f.admin, r.id, {
        action: "stop",
        revision: 1,
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await changeBusinessKnowledge(f.bob, r.id, {
        action: "restore",
        revision: 2,
      })
    ).ok,
    false,
  );
});
test("source versions and audience changes invalidate task history, private derivatives and search", async () => {
  const f = fixture(),
    r = await f.create(),
    t = await f.task(f.bob),
    b = (await f.store.load(
      { workspaceId: f.workspaceId, actorSub: "bob" },
      t.id,
    ))!;
  assert.equal((await recallBusinessKnowledge(f.bob, b, "GIS")).length, 1);
  const m = unwrap(
    await createPrivateMemory(f.bob, {
      requestId: randomUUID(),
      taskId: t.id,
      text: "GIS decision based on team knowledge",
      kind: "decision",
    }),
  );
  assert.equal(m.knowledgeSources?.[0].id, r.id);
  unwrap(
    await changeBusinessKnowledge(f.alice, r.id, {
      action: "correct",
      revision: 1,
      title: r.title,
      text: r.text,
      kind: r.kind,
      audience: "members",
      memberSubs: ["alice"],
    }),
  );
  assert.equal((await readPrivateTask(f.bob, t.id)).ok, false);
  assert.equal(unwrap(await listPrivateMemories(f.bob)).items[0].text, null);
  assert.deepEqual(unwrap(await searchPrivateHistory(f.bob, "GIS")).items, []);
  const other = await f.create();
  f.version("v2");
  assert.deepEqual(unwrap(await listBusinessKnowledge(f.alice)).items, []);
  assert.equal(
    (
      await changeBusinessKnowledge(f.alice, other.id, {
        action: "restore",
        revision: 1,
      })
    ).ok,
    false,
  );
});
test("knowledge revoked during model generation cannot be persisted or delivered", async () => {
  const f = fixture(),
    r = await f.create(),
    t = await f.task(f.bob);
  let supplied = "";
  const deps = {
    tenantId: "tenant",
    atlasClient: {
      async chat(_a: unknown, input: { messages: { content: string }[] }) {
        supplied = JSON.stringify(input.messages);
        unwrap(
          await changeBusinessKnowledge(f.alice, r.id, {
            action: "stop",
            revision: 1,
          }),
        );
        return {
          id: "r",
          message: { role: "assistant", content: "revoked derivative" },
          usage: { totalTokens: 2 },
          latencyMs: 1,
        };
      },
    } as unknown as AtlasClient,
    runosClient: {} as RunosClient,
    meter: { admit: () => ({ ok: true as const }), record: async () => "" },
  };
  const result = await runPrivateTaskTurn(
    f.bob,
    t.id,
    { requestId: randomUUID(), revision: 1, question: "GIS" },
    deps,
  );
  assert.equal(result.ok, false);
  assert.ok(supplied.includes(r.text));
  assert.ok(
    !(
      await f.store.load(
        { workspaceId: f.workspaceId, actorSub: "bob" },
        t.id,
        true,
      )
    )?.messages.some((m) => m.content === "revoked derivative"),
  );
  assert.equal((await readPrivateTask(f.bob, t.id)).ok, false);
});
test("preview requires business-only review and validates eligible member choices and fact sources", async () => {
  const f = fixture();
  for (const patch of [
    { businessOnly: false },
    { kind: "fact", objects: [] },
    { title: "" },
    { text: "x".repeat(4001) },
    { audience: "members", memberSubs: [] },
    { audience: "members", memberSubs: ["stranger"] },
    { audience: "workspace", memberSubs: ["bob"] },
    { objects: [{ kind: "segment", id: randomUUID() }] },
  ])
    assert.equal(
      (await previewBusinessKnowledge(f.alice, { ...f.input, ...patch })).ok,
      false,
    );
  assert.equal(
    unwrap(await searchKnowledgeMembers(f.alice, "bob")).items[0].sub,
    "bob",
  );
  assert.deepEqual(unwrap(await searchKnowledgeMembers(f.alice, "")).items, []);
});
test("idempotent create, concurrent corrections, stopping and restore keep immutable dependencies", async () => {
  const f = fixture(),
    review = unwrap(await previewBusinessKnowledge(f.alice, f.input)),
    data = {
      ...f.input,
      requestId: randomUUID(),
      reviewedDigest: review.reviewedDigest,
    };
  const rows = await Promise.all([
    createBusinessKnowledge(f.alice, data),
    createBusinessKnowledge(f.alice, data),
  ]);
  const r = unwrap(rows[0]);
  assert.equal(unwrap(rows[1]).id, r.id);
  const changed = await Promise.all(
    ["first", "second"].map((text) =>
      changeBusinessKnowledge(f.alice, r.id, {
        action: "correct",
        revision: 1,
        title: r.title,
        text,
        kind: r.kind,
        audience: r.audience,
        memberSubs: r.memberSubs,
      }),
    ),
  );
  assert.equal(changed.filter((x) => x.ok).length, 1);
  unwrap(
    await changeBusinessKnowledge(f.alice, r.id, {
      action: "stop",
      revision: 2,
    }),
  );
  unwrap(
    await changeBusinessKnowledge(f.alice, r.id, {
      action: "restore",
      revision: 3,
    }),
  );
  assert.equal(unwrap(await listBusinessKnowledge(f.bob)).items[0].revision, 4);
});
test("source revocation during list validation and missing dependency adapter fail closed", async () => {
  const f = fixture(),
    r = await f.create(),
    t = await f.task(f.bob),
    b = (await f.store.load(
      { workspaceId: f.workspaceId, actorSub: "bob" },
      t.id,
    ))!;
  await recallBusinessKnowledge(f.bob, b, "GIS");
  unwrap(
    await createPrivateMemory(f.bob, {
      requestId: randomUUID(),
      taskId: t.id,
      text: "private derivative",
      kind: "decision",
    }),
  );
  const without = { ...f.bob, knowledge: undefined };
  without.refresh = async () => without;
  assert.equal(unwrap(await listPrivateMemories(without)).items[0].text, null);
  let calls = 0;
  f.bob.source = async (o) => (++calls < 2 ? { ...o, version: "v1" } : null);
  assert.deepEqual(unwrap(await listBusinessKnowledge(f.bob)).items, []);
  assert.equal(
    (
      await changeBusinessKnowledge(f.alice, r.id, {
        action: "stop",
        revision: 1,
        text: "leak",
      })
    ).ok,
    false,
  );
});
test("automatic private extraction inherits team dependencies without writing anything to the team library", async () => {
  const f = fixture(),
    r = await f.create(),
    t = await f.task(f.bob),
    scope = { workspaceId: f.workspaceId, actorSub: "bob" };
  const b = (await f.store.load(scope, t.id))!;
  await recallBusinessKnowledge(f.bob, b, "GIS");
  const turn = await f.store.beginTurn(
    scope,
    t.id,
    1,
    randomUUID(),
    "I choose annual GIS subscriptions",
    "q",
    "xiaoyu/1",
  );
  assert.ok(turn);
  await f.store.finishTurn(scope, t.id, turn.id, {
    answer: "Recorded in our private discussion",
    tokens: 2,
  });
  const message = (await f.store.load(scope, t.id, true))!.messages.find(
    (m) => m.role === "user",
  )!;
  const deps = {
    tenantId: "tenant",
    atlasClient: {
      async chat() {
        return {
          id: "r",
          message: {
            role: "assistant",
            content: JSON.stringify([
              {
                text: "Use annual GIS subscriptions",
                kind: "decision",
                messageId: message.id,
                quote: "annual GIS subscriptions",
              },
            ]),
          },
          usage: { totalTokens: 2 },
          latencyMs: 1,
        };
      },
    } as unknown as AtlasClient,
    runosClient: {} as RunosClient,
  };
  const captured = unwrap(await captureTaskMemories(f.bob, t.id, deps));
  assert.equal(captured.items[0].knowledgeSources?.[0].id, r.id);
  assert.equal(unwrap(await listBusinessKnowledge(f.alice)).items.length, 1);
  unwrap(
    await changeBusinessKnowledge(f.alice, r.id, {
      revision: 1,
      action: "stop",
    }),
  );
  assert.equal(unwrap(await listPrivateMemories(f.bob)).items[0].text, null);
  assert.equal((await captureTaskMemories(f.bob, t.id, deps)).ok, false);
});
