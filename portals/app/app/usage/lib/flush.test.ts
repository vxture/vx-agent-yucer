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

test("200 with gated:true is reported and done - counted as gated, and evicts C2", async () => {
  const store = await seeded();
  const evicted: string[] = [];
  const summary = await flushUsage({
    store,
    consume: async () => ({ status: 200, gated: true }),
    onGated: (ws) => evicted.push(ws),
  });
  assert.equal(summary.gated, 2);
  assert.equal(summary.flushed, 0);
  assert.equal((await store.unflushed(10)).length, 0); // the platform recorded it; nothing to retry
  assert.deepEqual(evicted, ["ws", "ws"]);
});

test("409 is not a terminal answer any more - it stays buffered like any other non-200", async () => {
  // The contract converged on "always 200, gated in the body"; the 409 branch
  // this loop carried from the template is gone, and this test is what keeps
  // it gone.
  const store = await seeded();
  const evicted: string[] = [];
  const summary = await flushUsage({ store, consume: async () => ({ status: 409 }), onGated: (ws) => evicted.push(ws) });
  assert.equal(summary.gated, 0);
  assert.equal(summary.retried, 2);
  assert.equal((await store.unflushed(10)).length, 2);
  assert.deepEqual(evicted, []);
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

// incr/0070: /usage/consume's 200 body's event_id, captured and handed to
// markFlushed - this is what makes reconciling a local row against the
// platform's own ledger possible at all, instead of only inside a manual probe.

test("event_id from the 200 body is passed to markFlushed for each row", async () => {
  const store = await seeded();
  const marked: unknown[] = [];
  const realMarkFlushed = store.markFlushed.bind(store);
  store.markFlushed = async (rows) => {
    marked.push(...rows);
    return realMarkFlushed(rows);
  };
  let n = 0;
  await flushUsage({
    store,
    consume: async () => {
      n += 1;
      return { status: 200, body: { event_id: `evt_${n}` } };
    },
  });
  assert.deepEqual(
    marked.map((r) => (r as { platformEventId: string | null }).platformEventId).sort(),
    ["evt_1", "evt_2"],
  );
});

test("a 200 with no event_id in the body stores null, not the string \"undefined\"", async () => {
  const store = new InMemoryUsageStore();
  await store.record({ workspaceId: "ws", metric: "ai.credit", amount: 1, idempotencyKey: "k1" });
  const marked: unknown[] = [];
  const realMarkFlushed = store.markFlushed.bind(store);
  store.markFlushed = async (rows) => {
    marked.push(...rows);
    return realMarkFlushed(rows);
  };
  await flushUsage({ store, consume: async () => ({ status: 200 }) }); // no body at all
  assert.equal((marked[0] as { platformEventId: string | null }).platformEventId, null);
});
