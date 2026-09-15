import { test } from "node:test";
import assert from "node:assert/strict";
import { admitTurn, COPILOT_TURN_METRIC, meterTurn, turnIdempotencyKey } from "./copilot-turns";
import { InMemoryUsageStore } from "./store";
import { makeEntitlement } from "../../entitlement/resolver";

// Admission reads the C2 envelope's pool for the metric; the charge is one
// buffered row per admitted turn, keyed by the question the turn was asked in.

const WS = "ws_1";

test("no pool for the metric means the platform sold no quota for it: not gated", () => {
  assert.deepEqual(admitTurn(makeEntitlement(WS, "yucer", { tier: "pro", status: "active" })), { ok: true });
});

test("a pool with turns left admits; one with nothing left refuses and reports the remainder", () => {
  const pool = (remaining: number) => ({ metric: COPILOT_TURN_METRIC, limit: 100, remaining, priority: 0 });
  assert.deepEqual(admitTurn(makeEntitlement(WS, "yucer", { tier: "pro", quota_pools: [pool(3)] })), { ok: true });
  assert.deepEqual(admitTurn(makeEntitlement(WS, "yucer", { tier: "pro", quota_pools: [pool(0)] })), { ok: false, remaining: 0 });
  // Another metric's pool says nothing about this one.
  assert.deepEqual(admitTurn(makeEntitlement(WS, "yucer", { tier: "pro", quota_pools: [{ ...pool(0), metric: "other" }] })), { ok: true });
});

test("the idempotency key is the metric and the business object, never a random id", () => {
  assert.equal(turnIdempotencyKey("msg_1"), `${COPILOT_TURN_METRIC}:msg_1`);
  // Deterministic: the same question always charges under the same key, so a
  // retried flush or a replayed request collapses on the platform.
  assert.equal(turnIdempotencyKey("msg_1"), turnIdempotencyKey("msg_1"));
  assert.notEqual(turnIdempotencyKey("msg_1"), turnIdempotencyKey("msg_2"));
});

test("meterTurn buffers one row per question, under that question's key", async () => {
  const store = new InMemoryUsageStore();
  const k1 = await meterTurn(WS, "msg_1", store);
  const k2 = await meterTurn(WS, "msg_2", store);
  assert.equal(k1, turnIdempotencyKey("msg_1"));
  assert.equal(k2, turnIdempotencyKey("msg_2"));
  const rows = await store.unflushed(10);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.metric === COPILOT_TURN_METRIC && r.amount === 1 && r.workspaceId === WS));
  assert.deepEqual(new Set(rows.map((r) => r.idempotencyKey)), new Set([k1, k2]));
});

test("charging the same question twice leaves one row - the buffer upserts by key", async () => {
  const store = new InMemoryUsageStore();
  await meterTurn(WS, "msg_1", store);
  await meterTurn(WS, "msg_1", store);
  assert.equal((await store.unflushed(10)).length, 1);
});
