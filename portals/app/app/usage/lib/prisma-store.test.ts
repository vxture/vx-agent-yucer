import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { PrismaUsageStore } from "./prisma-store";

// The translation layer, pinned without a database - same reasoning as
// PrismaAccountStore: what lives here is real (the replay-is-a-no-op upsert,
// the BigInt boundary, the per-(workspace,metric) watermark dedup) and none of
// it needs Postgres to pin. The live-database half runs in db-contract via
// adapters-prisma.db.test.ts.

function fake() {
  const calls = { upsert: [] as unknown[], updateMany: [] as unknown[], findMany: [] as unknown[], checkpoint: [] as unknown[] };
  const client = {
    raw: {
      upsert: async (a: unknown) => void calls.upsert.push(a),
      updateMany: async (a: unknown) => void calls.updateMany.push(a),
      findMany: async (a: unknown) => {
        calls.findMany.push(a);
        return [
          { workspaceId: "ws_1", metric: "copilot.turns", amount: BigInt(3), idempotencyKey: "k1", flushed: false },
        ];
      },
    },
    checkpoint: {
      upsert: async (a: unknown) => void calls.checkpoint.push(a),
    },
  };
  return { calls, client: async () => client as unknown as PrismaClient };
}

test("record upserts on the idempotency key with an empty update - a replay is a no-op", async () => {
  const { calls, client } = fake();
  await new PrismaUsageStore(client).record({
    workspaceId: "ws_1",
    metric: "copilot.turns",
    amount: 3,
    idempotencyKey: "k1",
  });
  assert.equal(calls.upsert.length, 1);
  const arg = calls.upsert[0] as { where: unknown; update: unknown; create: { amount: bigint } };
  assert.deepEqual(arg.where, { idempotencyKey: "k1" });
  assert.deepEqual(arg.update, {}, "a replayed key must change nothing");
  assert.equal(arg.create.amount, BigInt(3), "the amount crosses as BigInt");
});

test("unflushed maps BigInt back to number and keeps the flush flag", async () => {
  const { client } = fake();
  const rows = await new PrismaUsageStore(client).unflushed(10);
  assert.deepEqual(rows, [
    { workspaceId: "ws_1", metric: "copilot.turns", amount: 3, idempotencyKey: "k1", flushed: false },
  ]);
});

test("markFlushed flips the rows and advances ONE watermark per (workspace, metric)", async () => {
  const { calls, client } = fake();
  await new PrismaUsageStore(client).markFlushed([
    { idempotencyKey: "k1", workspaceId: "ws_1", metric: "copilot.turns" },
    { idempotencyKey: "k2", workspaceId: "ws_1", metric: "copilot.turns" },
    { idempotencyKey: "k3", workspaceId: "ws_2", metric: "signals.scored" },
  ]);
  const flip = calls.updateMany[0] as { where: { idempotencyKey: { in: string[] } } };
  assert.deepEqual(flip.where.idempotencyKey.in, ["k1", "k2", "k3"]);
  assert.equal(calls.checkpoint.length, 2, "one batch, many rows, ONE watermark per pair");
  const first = calls.checkpoint[0] as { where: { workspaceId_metric: unknown } };
  assert.deepEqual(first.where.workspaceId_metric, { workspaceId: "ws_1", metric: "copilot.turns" });
});

test("an empty batch touches nothing", async () => {
  const { calls, client } = fake();
  await new PrismaUsageStore(client).markFlushed([]);
  assert.equal(calls.updateMany.length + calls.checkpoint.length, 0);
});
