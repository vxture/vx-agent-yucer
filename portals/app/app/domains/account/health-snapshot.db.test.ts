import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// incr/0079 account_health_snapshot against real Postgres. The properties
// that matter here - the CHECKs, the append-only grant, the CASCADE, and that
// the JSONB breakdown reads back as it was written - are the database's, and
// nothing in the TypeScript suite can see them.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000079";
const ACC = "eeeeeeee-0000-0000-0000-0000000079a1";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function seed(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-HS', 'Health Snapshot Test', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM yucer_core.account_health_snapshot WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

const insert = (c: Client, score: number, source: string, contributions: string) =>
  c.query(
    `INSERT INTO yucer_core.account_health_snapshot (workspace_id, account_id, score, contributions, source)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [WS, ACC, score, contributions, source],
  );

test("account_health_snapshot: score range, source vocabulary and an array breakdown are enforced", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await assert.rejects(insert(c, 101, "sweep", "[]"), /chk_account_health_snapshot_score/);
      await assert.rejects(insert(c, -1, "sweep", "[]"), /chk_account_health_snapshot_score/);
      await assert.rejects(insert(c, 50, "manual", "[]"), /chk_account_health_snapshot_source/);
      await assert.rejects(insert(c, 50, "sweep", "{}"), /chk_account_health_snapshot_contributions/);
      await insert(c, 50, "sweep", "[]");
      await insert(c, 58, "recompute", "[]");
    });
  } finally {
    await cleanup();
  }
});

test("account_health_snapshot: append-only for the service role - INSERT yes, UPDATE and DELETE no", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await c.query(`SET ROLE yucer_svc`);
      try {
        await insert(c, 58, "sweep", "[]");
        const r = await c.query(`SELECT count(*)::int AS n FROM yucer_core.account_health_snapshot WHERE account_id = $1`, [ACC]);
        assert.equal(r.rows[0].n, 1);
        await assert.rejects(
          c.query(`UPDATE yucer_core.account_health_snapshot SET score = 99 WHERE account_id = $1`, [ACC]),
          /permission denied/,
        );
        await assert.rejects(
          c.query(`DELETE FROM yucer_core.account_health_snapshot WHERE account_id = $1`, [ACC]),
          /permission denied/,
        );
      } finally {
        await c.query(`RESET ROLE`);
      }
    });
  } finally {
    await cleanup();
  }
});

test("account_health_snapshot: the history goes with its account (CASCADE)", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await insert(c, 58, "sweep", "[]");
      await c.query(`DELETE FROM yucer_core.account WHERE id = $1`, [ACC]);
      const r = await c.query(`SELECT count(*)::int AS n FROM yucer_core.account_health_snapshot WHERE account_id = $1`, [ACC]);
      assert.equal(r.rows[0].n, 0);
    });
  } finally {
    await cleanup();
  }
});

test("the adapter: a reading appends only when it moved, and the breakdown reads back as written", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const { PrismaAccountStore } = await import("./prisma-store");
    const { recordHealthReading } = await import("./health-record");
    const store = new PrismaAccountStore();
    const reading = (score: number, recency: number) => ({
      score,
      contributions: [
        { factor: "pipeline" as const, points: 10, reason: { code: "open_pipeline", count: 2 } },
        { factor: "recency" as const, points: recency, reason: { code: "stale", days: 40 } },
      ] as never,
    });
    const t0 = new Date("2026-09-01T00:00:00Z");
    assert.equal(await recordHealthReading(store, WS, ACC, reading(58, -2), "sweep", t0), true, "the first reading");
    assert.equal(
      await recordHealthReading(store, WS, ACC, reading(58, -2), "sweep", new Date("2026-09-02T00:00:00Z")),
      false,
      "nothing moved - no row",
    );
    assert.equal(
      await recordHealthReading(store, WS, ACC, reading(50, -10), "recompute", new Date("2026-09-03T00:00:00Z")),
      true,
    );
    const rows = await store.listHealthSnapshots(WS, ACC);
    assert.deepEqual(rows.map((r) => [r.score, r.source]), [[50, "recompute"], [58, "sweep"]], "newest first");
    assert.deepEqual(rows[1]!.contributions, reading(58, -2).contributions, "JSONB round-trips exactly");
  } finally {
    await cleanup();
  }
});
