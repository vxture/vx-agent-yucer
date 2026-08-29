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

test("a successful flush advances the (workspace, metric) watermark", async () => {
  // local_usage.checkpoint shipped in the baseline as the flush watermark and
  // nothing ever wrote it - the first question when the platform says usage is
  // missing ("when did this metric last flush?") had no answer on any row.
  const store = new InMemoryUsageStore();
  await store.record({ workspaceId: "ws_1", metric: "copilot.turns", amount: 3, idempotencyKey: "k1" });
  await store.record({ workspaceId: "ws_1", metric: "copilot.turns", amount: 1, idempotencyKey: "k2" });
  await store.record({ workspaceId: "ws_2", metric: "signals.scored", amount: 5, idempotencyKey: "k3" });

  await flushUsage({ store, consume: async () => ({ status: 200 }) });

  assert.ok(store.checkpoints.has("ws_1|copilot.turns"), "flushed metric must carry a watermark");
  assert.ok(store.checkpoints.has("ws_2|signals.scored"));
  assert.equal(store.checkpoints.size, 2, "one watermark per (workspace, metric), not per row");
});

test("a failed flush leaves the watermark unmoved", async () => {
  const store = new InMemoryUsageStore();
  await store.record({ workspaceId: "ws_1", metric: "copilot.turns", amount: 3, idempotencyKey: "k1" });
  await flushUsage({ store, consume: async () => ({ status: 500 }) });
  assert.equal(store.checkpoints.size, 0, "a retryable failure is not a flush");
});
