import { test } from "node:test";
import assert from "node:assert/strict";
import { ADVISOR_RUN_METRIC, admitAdvisorRun, advisorRunKey, meterAdvisorRun } from "./advisor-runs";
import { COPILOT_TURN_METRIC } from "./copilot-turns";
import { InMemoryUsageStore } from "./store";
import { makeEntitlement } from "../../entitlement/resolver";

const WS = "ws_1";

test("the metric is its own literal, keyed by the run", () => {
  assert.equal(ADVISOR_RUN_METRIC, "yucer.advisor.runs");
  assert.equal(advisorRunKey("run_1"), "yucer.advisor.runs:run_1");
});

test("admission reads this metric's pool only - the turn pool says nothing about runs", () => {
  const pool = (metric: string, remaining: number) => ({ metric, limit: 10, remaining, priority: 0 });
  assert.deepEqual(admitAdvisorRun(makeEntitlement(WS, "yucer", { tier: "free" })), { ok: true });
  assert.deepEqual(
    admitAdvisorRun(makeEntitlement(WS, "yucer", { tier: "free", quota_pools: [pool(COPILOT_TURN_METRIC, 0)] })),
    { ok: true },
  );
  assert.deepEqual(
    admitAdvisorRun(makeEntitlement(WS, "yucer", { tier: "free", quota_pools: [pool(ADVISOR_RUN_METRIC, 0)] })),
    { ok: false, remaining: 0 },
  );
});

test("one run is one buffered row under its key", async () => {
  const store = new InMemoryUsageStore();
  const key = await meterAdvisorRun(WS, "run_1", store);
  assert.equal(key, "yucer.advisor.runs:run_1");
  const rows = await store.unflushed(10);
  assert.deepEqual(rows.map((r) => [r.metric, r.amount, r.idempotencyKey]), [["yucer.advisor.runs", 1, key]]);
});
