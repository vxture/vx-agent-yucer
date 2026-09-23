import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAccountStore, type AccountRecord } from "./store";
import { setAccountStore } from "../shared/registry";
import { runHealthSweep } from "./health-sweep";

// The health sweep (incr/0079): the same recompute a person runs, under a
// service identity, recording a reading only when a score moved.

const NOW = new Date("2026-09-24T00:00:00Z");
const WS = "ws_1";

function account(id: string): AccountRecord {
  return { id, workspaceId: WS, accountNo: id, name: id, healthScore: null } as unknown as AccountRecord;
}

function setup() {
  const store = new InMemoryAccountStore();
  store.seed({ accounts: [account("a1"), account("a2")] });
  setAccountStore(store);
  return store;
}

test("an entitled workspace: every customer is scored, persisted and recorded once", async () => {
  const store = setup();
  process.env.MOCK_TIER = "free";
  const ledger = await runHealthSweep({ workspaces: [{ workspaceId: WS }], now: NOW });
  assert.deepEqual(ledger, { accountsScored: 2, skipped: 0, failed: 0 });
  assert.equal(typeof (await store.getAccount(WS, "a1"))?.healthScore, "number", "the stored score is current");
  const rows = await store.listHealthSnapshots(WS, "a1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.source, "sweep");

  // The next night, nothing moved: no second row.
  await runHealthSweep({ workspaces: [{ workspaceId: WS }], now: new Date(NOW.getTime() + 86_400_000) });
  assert.equal((await store.listHealthSnapshots(WS, "a1")).length, 1);
});

test("a workspace without the customer feature is counted as skipped, never scored", async () => {
  const store = setup();
  delete process.env.MOCK_TIER;
  const ledger = await runHealthSweep({ workspaces: [{ workspaceId: WS }], now: NOW });
  assert.deepEqual(ledger, { accountsScored: 0, skipped: 1, failed: 0 });
  assert.equal((await store.listHealthSnapshots(WS, "a1")).length, 0);
});
