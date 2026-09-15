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
  const calls = { upsert: [] as unknown[], update: [] as unknown[], findMany: [] as unknown[], checkpoint: [] as unknown[] };
  const client = {
    raw: {
      upsert: async (a: unknown) => void calls.upsert.push(a),
      update: async (a: unknown) => void calls.update.push(a),
      findMany: async (a: unknown) => {
        calls.findMany.push(a);
        return [
          {
            workspaceId: "ws_1",
            metric: "copilot.turns",
            amount: BigInt(3),
            idempotencyKey: "k1",
            flushed: false,
            platformEventId: null,
          },
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

test("unflushed maps BigInt back to number and carries platformEventId", async () => {
  const { client } = fake();
  const rows = await new PrismaUsageStore(client).unflushed(10);
  assert.deepEqual(rows, [
    { workspaceId: "ws_1", metric: "copilot.turns", amount: 3, idempotencyKey: "k1", flushed: false, platformEventId: null },
  ]);
});

test("markFlushed writes flushed and each row's OWN platformEventId, and advances ONE watermark per (workspace, metric)", async () => {
  // updateMany cannot express a per-row value, so a batch of rows with
  // different platformEventIds must go through individual update() calls.
  const { calls, client } = fake();
  await new PrismaUsageStore(client).markFlushed([
    { idempotencyKey: "k1", workspaceId: "ws_1", metric: "copilot.turns", platformEventId: "evt_1" },
    { idempotencyKey: "k2", workspaceId: "ws_1", metric: "copilot.turns", platformEventId: "evt_2" },
    { idempotencyKey: "k3", workspaceId: "ws_2", metric: "signals.scored", platformEventId: null },
  ]);
  assert.equal(calls.update.length, 3);
  const updates = calls.update as { where: { idempotencyKey: string }; data: { flushed: boolean; platformEventId: string | null } }[];
  assert.deepEqual(
    updates.map((u) => [u.where.idempotencyKey, u.data.flushed, u.data.platformEventId]),
    [
      ["k1", true, "evt_1"],
      ["k2", true, "evt_2"],
      ["k3", true, null],
    ],
  );
  assert.equal(calls.checkpoint.length, 2, "one batch, many rows, ONE watermark per pair");
  const first = calls.checkpoint[0] as { where: { workspaceId_metric: unknown } };
  assert.deepEqual(first.where.workspaceId_metric, { workspaceId: "ws_1", metric: "copilot.turns" });
});

test("an empty batch touches nothing", async () => {
  const { calls, client } = fake();
  await new PrismaUsageStore(client).markFlushed([]);
  assert.equal(calls.update.length + calls.checkpoint.length, 0);
});
