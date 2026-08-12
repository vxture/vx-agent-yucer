import { test } from "node:test";
import assert from "node:assert/strict";
import { flushUsage } from "./flush";
import { InMemoryUsageStore } from "./store";

async function seeded(): Promise<InMemoryUsageStore> {
  const s = new InMemoryUsageStore();
  await s.record({ workspaceId: "ws", metric: "ai.credit", amount: 1, idempotencyKey: "k1" });
  await s.record({ workspaceId: "ws", metric: "ai.credit", amount: 2, idempotencyKey: "k2" });
  return s;
}

test("200 marks rows flushed", async () => {
  const store = await seeded();
  const summary = await flushUsage({ store, consume: async () => ({ status: 200 }) });
  assert.equal(summary.flushed, 2);
  assert.equal((await store.unflushed(10)).length, 0);
});

test("409 (gated) is terminal - flushed, not retried, and evicts C2", async () => {
  const store = await seeded();
  const evicted: string[] = [];
  const summary = await flushUsage({
    store,
    consume: async () => ({ status: 409 }),
    onGated: (ws) => evicted.push(ws),
  });
  assert.equal(summary.gated, 2);
  assert.equal((await store.unflushed(10)).length, 0); // terminal, not left for retry
  assert.deepEqual(evicted, ["ws", "ws"]);
});

test("5xx / 404 leaves rows buffered for retry", async () => {
  const store = await seeded();
  const summary = await flushUsage({ store, consume: async () => ({ status: 500 }) });
  assert.equal(summary.retried, 2);
  assert.equal((await store.unflushed(10)).length, 2); // still buffered
});

test("a thrown consume error leaves rows buffered", async () => {
  const store = await seeded();
  const summary = await flushUsage({
    store,
    consume: async () => {
      throw new Error("network");
    },
  });
  assert.equal(summary.retried, 2);
  assert.equal((await store.unflushed(10)).length, 2);
});
