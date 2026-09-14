import { test } from "node:test";
import assert from "node:assert/strict";
import { admitTurn, COPILOT_TURN_METRIC, meterTurn } from "./copilot-turns";
import { InMemoryUsageStore } from "./store";
import { makeEntitlement } from "../../entitlement/resolver";

// Admission reads the C2 envelope's pool for the metric; the charge is one
// buffered row per admitted turn with a key of its own.

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

test("meterTurn buffers one row for the metric with a fresh idempotency key each time", async () => {
  const store = new InMemoryUsageStore();
  const k1 = await meterTurn(WS, store);
  const k2 = await meterTurn(WS, store);
  assert.notEqual(k1, k2);
  const rows = await store.unflushed(10);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.metric === COPILOT_TURN_METRIC && r.amount === 1 && r.workspaceId === WS));
  assert.deepEqual(new Set(rows.map((r) => r.idempotencyKey)), new Set([k1, k2]));
});
