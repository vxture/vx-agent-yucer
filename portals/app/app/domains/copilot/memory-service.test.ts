import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { InMemoryCopilotStore } from "./store";
import { InMemoryTaskStore } from "./task-store";
import { InMemoryMemoryStore } from "./memory-store";
import {
  createPrivateMemory,
  changePrivateMemory,
  listPrivateMemories,
  recallPrivateMemories,
  searchPrivateHistory,
  captureTaskMemories,
  checkTaskMemory,
} from "./memory-service";
import {
  createPrivateTask,
  readPrivateTask,
  runPrivateTaskTurn,
  type TaskContext,
} from "./task-service";
import type { AtlasClient } from "../../agent/atlas/client";
import type { RunosClient } from "../../agent/runos/client";
import { unwrap } from "../shared/result";
function fixture() {
  const workspaceId = randomUUID(),
    store = new InMemoryTaskStore(),
    memory = new InMemoryMemoryStore(),
    sessions = new InMemoryCopilotStore(),
    object = { kind: "segment" as const, id: randomUUID() };
  let version: string | null = "v1";
  const c: TaskContext = {
    workspaceId,
    sub: "alice",
    store,
    memory,
    sessions,
    holder: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: workspaceId,
      product: "yucer",
      tier: "pro",
    },
    source: async (o) =>
      o.id === object.id && version ? { ...o, version } : null,
    refresh: async () => c,
  };
  const scope = { workspaceId, actorSub: c.sub };
  const create = async (
    text = "GIS market budget decision",
    objects: unknown[] = [],
  ) =>
    unwrap(
      await createPrivateMemory(c, {
        requestId: randomUUID(),
        text,
        kind: "decision",
        objects,
      }),
    );
  const task = async () =>
    unwrap(
      await createPrivateTask(c, {
        requestId: randomUUID(),
        goal: "GIS market",
      }),
    );
  const alternate = (patch: Partial<TaskContext>) => {
    const other = { ...c, ...patch };
    other.refresh = async () => other;
    return other;
  };
  return {
    c,
    scope,
    object,
    store,
    memory,
    create,
    task,
    alternate,
    version: (v: string | null) => {
      version = v;
    },
  };
}
test("memory is private even from workspace administrator and same user in another workspace", async () => {
  const f = fixture(),
    r = await f.create();
  for (const other of [
    f.alternate({
      sub: "admin",
      holder: {
        permissions: new Set([
          ...permissionsForRoles(["sales_rep"]),
          ...permissionsForRoles(["workspace_admin"]),
        ]),
      },
    }),
    f.alternate({ workspaceId: randomUUID() }),
  ]) {
    if (other.workspaceId !== f.c.workspaceId)
      other.entitlement = {
        ...other.entitlement,
        workspace_id: other.workspaceId,
      };
    assert.deepEqual(unwrap(await listPrivateMemories(other)).items, []);
    assert.equal(
      (await changePrivateMemory(other, r.id, { action: "stop", revision: 1 }))
        .ok,
      false,
    );
  }
  assert.equal(
    await f.memory.get({ ...f.scope, actorSub: "admin" }, r.id),
    null,
  );
});
test("correction, stop and restore do not legalize stale task history or checkpoints", async () => {
  const f = fixture(),
    r = await f.create(),
    t = await f.task(),
    b = unwrap(await readPrivateTask(f.c, t.id));
  assert.equal((await recallPrivateMemories(f.c, b, "budget")).length, 1);
  unwrap(await changePrivateMemory(f.c, r.id, { action: "stop", revision: 1 }));
  assert.equal((await readPrivateTask(f.c, t.id)).ok, false);
  assert.equal(unwrap(await listPrivateMemories(f.c)).items[0].text, r.text);
  unwrap(
    await changePrivateMemory(f.c, r.id, { action: "restore", revision: 2 }),
  );
  assert.equal((await readPrivateTask(f.c, t.id)).ok, false);
  const newTask = await f.task();
  const fresh = unwrap(await readPrivateTask(f.c, newTask.id));
  assert.equal(
    (await recallPrivateMemories(f.c, fresh, "budget"))[0].revision,
    3,
  );
  unwrap(
    await changePrivateMemory(f.c, r.id, {
      action: "correct",
      revision: 3,
      text: "GIS budget corrected to 80",
      kind: "decision",
    }),
  );
  assert.equal((await readPrivateTask(f.c, newTask.id)).ok, false);
  const last = await f.task();
  assert.equal(
    (
      await recallPrivateMemories(
        f.c,
        unwrap(await readPrivateTask(f.c, last.id)),
        "budget",
      )
    )[0].text,
    "GIS budget corrected to 80",
  );
});
test("source revocation and new effective versions redact management and exclude recall", async () => {
  const f = fixture(),
    r = await f.create("GIS budget 100", [f.object]),
    t = await f.task();
  await recallPrivateMemories(
    f.c,
    unwrap(await readPrivateTask(f.c, t.id)),
    "budget",
  );
  f.version("v2");
  assert.equal(unwrap(await listPrivateMemories(f.c)).items[0].text, null);
  assert.equal((await readPrivateTask(f.c, t.id)).ok, false);
  const next = await f.task();
  assert.equal(
    (
      await recallPrivateMemories(
        f.c,
        unwrap(await readPrivateTask(f.c, next.id)),
        "budget",
      )
    ).length,
    0,
  );
  assert.equal(
    (await changePrivateMemory(f.c, r.id, { action: "restore", revision: 1 }))
      .ok,
    false,
  );
  assert.equal(
    (await changePrivateMemory(f.c, r.id, { action: "stop", revision: 1 })).ok,
    true,
  );
  f.version(null);
  assert.equal(
    unwrap(await listPrivateMemories(f.c)).items[0].available,
    false,
  );
});
test("transitive private derivatives retain parent revision and stop closure", async () => {
  const f = fixture(),
    r = await f.create(),
    t = await f.task();
  await recallPrivateMemories(
    f.c,
    unwrap(await readPrivateTask(f.c, t.id)),
    "budget",
  );
  const child = unwrap(
    await createPrivateMemory(f.c, {
      requestId: randomUUID(),
      text: "GIS derived budget",
      kind: "inference",
      taskId: t.id,
    }),
  );
  assert.equal(child.parents[0].id, r.id);
  const t2 = await f.task();
  await recallPrivateMemories(
    f.c,
    unwrap(await readPrivateTask(f.c, t2.id)),
    "derived",
  );
  unwrap(await changePrivateMemory(f.c, r.id, { action: "stop", revision: 1 }));
  await assert.rejects(
    () => checkTaskMemory(f.c, t2.id),
    /memory_source_changed/,
  );
});
test("memory writes require exact CAS and cannot change sharing, owner or provenance", async () => {
  const f = fixture(),
    r = await f.create();
  assert.equal(
    (
      await changePrivateMemory(f.c, r.id, {
        action: "correct",
        revision: 1,
        text: "new",
        kind: "fact",
      })
    ).ok,
    false,
  );
  for (const extra of [
    { workspaceId: randomUUID() },
    { shared: true },
    { taskId: randomUUID() },
  ])
    assert.equal(
      (
        await changePrivateMemory(f.c, r.id, {
          action: "stop",
          revision: 1,
          ...extra,
        })
      ).ok,
      false,
    );
  const results = await Promise.all(
    ["one", "two"].map((text) =>
      changePrivateMemory(f.c, r.id, {
        action: "correct",
        revision: 1,
        text,
        kind: "decision",
      }),
    ),
  );
  // The in-memory store must match the database's atomic CAS semantics.
  assert.equal(results.filter((r) => r.ok).length, 1);
});
test("in-flight source stop blocks model persistence, replay, summaries and history search", async () => {
  const f = fixture(),
    r = await f.create(),
    t = await f.task();
  let prompt = "";
  const deps = {
    tenantId: "tenant",
    atlasClient: {
      async chat(_a: unknown, input: { messages: { content: string }[] }) {
        prompt = JSON.stringify(input.messages);
        unwrap(
          await changePrivateMemory(f.c, r.id, { action: "stop", revision: 1 }),
        );
        return {
          id: "r",
          message: { role: "assistant", content: "forbidden derivative" },
          usage: { totalTokens: 2 },
          latencyMs: 1,
        };
      },
    } as unknown as AtlasClient,
    runosClient: {} as RunosClient,
    meter: { admit: () => ({ ok: true as const }), record: async () => "" },
  };
  const response = await runPrivateTaskTurn(
    f.c,
    t.id,
    { requestId: randomUUID(), revision: 1, question: "GIS budget" },
    deps,
  );
  assert.equal(response.ok, false);
  assert.ok(prompt.includes(r.text!));
  const raw = await f.store.load(f.scope, t.id, true);
  assert.equal(
    raw?.messages.some((m) => m.content === "forbidden derivative"),
    false,
  );
  assert.equal((await readPrivateTask(f.c, t.id)).ok, false);
  assert.deepEqual(unwrap(await searchPrivateHistory(f.c, "GIS")).items, []);
});
test("automatic extraction rejects fake quotes, facts and assistant user decisions", async () => {
  const f = fixture(),
    t = await f.task();
  const turn = await f.store.beginTurn(
    f.scope,
    t.id,
    1,
    randomUUID(),
    "GIS team should use subscriptions",
    "q",
    "xiaoyu/1",
  );
  assert.ok(turn);
  await f.store.finishTurn(f.scope, t.id, turn.id, {
    answer: "My recommendation is annual",
    tokens: 1,
  });
  const b = (await f.store.load(f.scope, t.id, true))!;
  const deps = (answer: unknown) => ({
    tenantId: "tenant",
    atlasClient: {
      async chat() {
        return {
          id: "r",
          message: { role: "assistant", content: JSON.stringify(answer) },
          usage: { totalTokens: 2 },
          latencyMs: 1,
        };
      },
    } as unknown as AtlasClient,
    runosClient: {} as RunosClient,
  });
  for (const item of [
    {
      text: "GIS verified",
      kind: "fact",
      messageId: b.messages[0].id,
      quote: "GIS team",
    },
    {
      text: "GIS decision",
      kind: "decision",
      messageId: b.messages[1].id,
      quote: "recommendation",
    },
    {
      text: "GIS claim",
      kind: "inference",
      messageId: b.messages[0].id,
      quote: "nonexistent quote",
    },
  ])
    assert.equal(
      (await captureTaskMemories(f.c, t.id, deps([item]))).ok,
      false,
    );
  const result = unwrap(
    await captureTaskMemories(
      f.c,
      t.id,
      deps([
        {
          text: "GIS prefers subscriptions",
          kind: "decision",
          messageId: b.messages[0].id,
          quote: "should use subscriptions",
        },
      ]),
    ),
  );
  assert.equal(result.items[0].origin, "model");
  assert.equal(result.items[0].messageIds[0], b.messages[0].id);
});

test("stopping while an awaited source check runs cannot return the old memory", async () => {
  const f = fixture(),
    r = await f.create("GIS decision", [f.object]),
    t = await f.task();
  await recallPrivateMemories(
    f.c,
    unwrap(await readPrivateTask(f.c, t.id)),
    "GIS",
  );
  const source = f.c.source;
  let stopped = false;
  f.c.source = async (o) => {
    if (!stopped) {
      stopped = true;
      await f.memory.change(f.scope, r.id, 1, { state: "stopped" });
    }
    return source(o);
  };
  assert.equal((await readPrivateTask(f.c, t.id)).ok, false);
});

test("a stopped extraction cannot be recreated by extracting the same source message again", async () => {
  const f = fixture(),
    t = await f.task(),
    turn = await f.store.beginTurn(
      f.scope,
      t.id,
      1,
      randomUUID(),
      "GIS decision: annual subscription",
      "q",
      "xiaoyu/1",
    );
  assert.ok(turn);
  await f.store.finishTurn(f.scope, t.id, turn.id, {
    answer: "understood",
    tokens: 1,
  });
  const b = (await f.store.load(f.scope, t.id, true))!,
    deps = {
      tenantId: "tenant",
      atlasClient: {
        async chat() {
          return {
            id: "r",
            message: {
              role: "assistant",
              content: JSON.stringify([
                {
                  text: "GIS annual subscription",
                  kind: "decision",
                  messageId: b.messages[0].id,
                  quote: "annual subscription",
                },
              ]),
            },
            usage: { totalTokens: 1 },
            latencyMs: 1,
          };
        },
      } as unknown as AtlasClient,
      runosClient: {} as RunosClient,
    };
  const first = unwrap(await captureTaskMemories(f.c, t.id, deps)).items[0];
  unwrap(
    await changePrivateMemory(f.c, first.id, { action: "stop", revision: 1 }),
  );
  assert.deepEqual(
    unwrap(await captureTaskMemories(f.c, t.id, deps)).items,
    [],
  );
  assert.equal((await f.memory.list(f.scope)).length, 1);
  assert.equal((await f.memory.get(f.scope, first.id))?.state, "stopped");
});
