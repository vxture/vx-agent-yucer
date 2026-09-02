import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaProvisioningStore, against a real Postgres.
//
// Nothing in this file has ever run against the real vx_provision schema -
// only against InMemoryProvisioningStore. The interesting behaviour is all in
// the SQL semantics, not in this repo's own logic: isDelivered/markDelivered
// is an idempotency ledger that only works if the unique constraint on
// delivery_id actually fires (the caller checks isDelivered first; the store
// itself does not dedupe), and setSeq/upsertInstance both rely on the real
// (workspace_id, product_code) unique index to upsert rather than duplicate.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000001";
const PRODUCT = "yucer";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM vx_provision.webhook_delivery WHERE delivery_id LIKE 'test-prov-%'`);
    await c.query(`DELETE FROM vx_provision.provision_seq WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM vx_provision.app_instance WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaProvisioningStore } = await import("./prisma-store");
  return new PrismaProvisioningStore();
}

test("isDelivered is false for an id never marked, true once it is", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    assert.equal(await s.isDelivered("test-prov-1"), false);
    await s.markDelivered("test-prov-1", { type: "provision.activated", result: "processed" });
    assert.equal(await s.isDelivered("test-prov-1"), true);
  } finally {
    await cleanup();
  }
});

test("markDelivered persists the meta, not just the id", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.markDelivered("test-prov-2", { type: "provision.deactivated", result: "duplicate" });
    const row = await withPg((c) =>
      c.query(`SELECT type, result FROM vx_provision.webhook_delivery WHERE delivery_id = $1`, ["test-prov-2"]),
    );
    assert.equal(row.rows[0].type, "provision.deactivated");
    assert.equal(row.rows[0].result, "duplicate");
  } finally {
    await cleanup();
  }
});

test("markDelivered with no meta falls back to unknown/processed", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.markDelivered("test-prov-3");
    const row = await withPg((c) =>
      c.query(`SELECT type, result FROM vx_provision.webhook_delivery WHERE delivery_id = $1`, ["test-prov-3"]),
    );
    assert.equal(row.rows[0].type, "unknown");
    assert.equal(row.rows[0].result, "processed");
  } finally {
    await cleanup();
  }
});

test("marking the same delivery id twice collides on the real unique index", { skip }, async () => {
  // The ledger's idempotency guarantee lives in this constraint, not in any
  // application check - markDelivered() itself issues a plain INSERT. A
  // caller who forgot to check isDelivered() first must see this fail loudly,
  // not silently succeed twice.
  await cleanup();
  try {
    const s = await store();
    await s.markDelivered("test-prov-4");
    await assert.rejects(() => s.markDelivered("test-prov-4"), /uidx_webhook_delivery_delivery_id|Unique constraint/);
  } finally {
    await cleanup();
  }
});

test("getLastSeq is -1 before anything is set, and reads back what setSeq wrote", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    assert.equal(await s.getLastSeq(WS, PRODUCT), -1);
    await s.setSeq(WS, PRODUCT, 7);
    assert.equal(await s.getLastSeq(WS, PRODUCT), 7);
  } finally {
    await cleanup();
  }
});

test("setSeq upserts on the real (workspace, product) unique index rather than duplicating", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.setSeq(WS, PRODUCT, 3);
    await s.setSeq(WS, PRODUCT, 9);
    assert.equal(await s.getLastSeq(WS, PRODUCT), 9, "the later seq wins");

    const count = await withPg((c) =>
      c.query(`SELECT count(*)::int AS n FROM vx_provision.provision_seq WHERE workspace_id = $1 AND product_code = $2`, [WS, PRODUCT]),
    );
    assert.equal(count.rows[0].n, 1, "one row per (workspace, product), not one per call");
  } finally {
    await cleanup();
  }
});

test("a lower seq overwrites too - the store does not defend against out-of-order writes", { skip }, async () => {
  // Documenting real behaviour, not a contract: setSeq() is a plain upsert
  // with no MAX() guard. Ordering (dropping stale/reordered webhook deliveries)
  // is the caller's job, per the DDL's own comment on this table.
  await cleanup();
  try {
    const s = await store();
    await s.setSeq(WS, PRODUCT, 9);
    await s.setSeq(WS, PRODUCT, 2);
    assert.equal(await s.getLastSeq(WS, PRODUCT), 2);
  } finally {
    await cleanup();
  }
});

test("upsertInstance creates on first call and updates status on the second, not a duplicate row", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.upsertInstance(WS, PRODUCT, "pending");
    let row = await withPg((c) =>
      c.query(`SELECT status FROM vx_provision.app_instance WHERE workspace_id = $1 AND product_code = $2`, [WS, PRODUCT]),
    );
    assert.equal(row.rows[0].status, "pending");

    await s.upsertInstance(WS, PRODUCT, "provisioned");
    row = await withPg((c) =>
      c.query(`SELECT status FROM vx_provision.app_instance WHERE workspace_id = $1 AND product_code = $2`, [WS, PRODUCT]),
    );
    assert.equal(row.rows.length, 1, "one row per (workspace, product)");
    assert.equal(row.rows[0].status, "provisioned");
  } finally {
    await cleanup();
  }
});

test("an unrecognised status is refused by the real CHECK, not silently accepted", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(
      () => s.upsertInstance(WS, PRODUCT, "not_a_real_status"),
      /chk_app_instance_status/,
    );
  } finally {
    await cleanup();
  }
});
