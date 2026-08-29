import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// The Prisma TRANSLATION layer, against a real database.
//
// The in-memory stores mirror the Prisma ones, and the mirror tests prove the
// two agree with each other - which is not the same as either being right.
// Two mirrors agreeing says nothing about whether either is true (the same
// lesson column-locks.test.ts learned on 2026-08-26). What has never been
// proven anywhere:
//
//   - that the Prisma predicates actually scope by workspace on a real
//     database, rather than only in the in-memory filter that imitates them
//   - that upsert-by-anchor really lands on ONE row under a real unique index
//   - that the column locks REVOKE actually stops a write when the connection
//     is yucer_svc rather than the superuser every other test runs as
//
// The last one matters most: the whole column-lock design ("adding a writable
// column REQUIRES updating 98_column_locks.sql, or the service-role write
// fails") rests on a grant nobody has ever fired live. A guard that has never
// failed says nothing about whether it can.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts. In CI the
// db-contract job applies the full DDL (00 -> 97 -> 98 -> incr) first, so the
// yucer_svc role and the locks are real here.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

// A workspace no other test writes: rows are cleaned up per-test, and the id
// keeps any leftovers identifiable.
const WS = "99999999-9999-4999-8999-999999999999";

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
    await c.query(`DELETE FROM local_usage.raw WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM local_usage.checkpoint WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_gtm.campaign_execution WHERE campaign_id IN (SELECT id FROM yucer_gtm.campaign WHERE workspace_id = $1)`, [WS]);
    await c.query(`DELETE FROM yucer_gtm.campaign WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_gtm.market_segment WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_agent.agent_action WHERE workspace_id = $1`, [WS]);
  });
}

test("upsertSegment lands on ONE row by its code, and the code never moves", { skip }, async () => {
  const { PrismaStrategyStore } = await import("../strategy/prisma-store");
  const store = new PrismaStrategyStore();
  try {
    const first = await store.upsertSegment(WS, {
      segmentCode: "DBT-ENT",
      name: "first name",
      planId: null,
      priority: 1,
      status: "active",
      criteria: { industries: ["制造"], regions: ["华东"] },
    });
    const second = await store.upsertSegment(WS, {
      segmentCode: "DBT-ENT",
      name: "second name",
      planId: null,
      priority: 9,
      status: "paused",
      criteria: { industries: [], regions: [] },
    });
    assert.equal(second.id, first.id, "the anchor must find the row, not add a second");
    const rows = await store.listSegments(WS);
    assert.equal(rows.filter((r) => r.segmentCode === "DBT-ENT").length, 1);
    assert.equal(rows[0].name, "second name");
    // JSONB round trip: what was written is what comes back, typed.
    assert.deepEqual(first.criteria, { industries: ["制造"], regions: ["华东"] });
    assert.deepEqual(rows[0].criteria, { industries: [], regions: [] });
  } finally {
    await cleanup();
  }
});

test("an execution id from another workspace updates nothing on a real database", { skip }, async () => {
  const { PrismaStrategyStore } = await import("../strategy/prisma-store");
  const store = new PrismaStrategyStore();
  const OTHER = "88888888-8888-4888-8888-888888888888";
  try {
    // A campaign and one execution in WS, via raw SQL so the fixture does not
    // depend on the code under test.
    const camp = await withPg((c) =>
      c.query(
        `INSERT INTO yucer_gtm.campaign (workspace_id, campaign_no, name) VALUES ($1, 'DBT-CAMP-1', 'probe') RETURNING id`,
        [WS],
      ),
    );
    const campaignId = camp.rows[0].id as string;
    const ex = await withPg((c) =>
      c.query(
        `INSERT INTO yucer_gtm.campaign_execution (workspace_id, campaign_id, title, action_type) VALUES ($1, $2, 'probe item', 'outreach') RETURNING id`,
        [WS, campaignId],
      ),
    );
    const executionId = ex.rows[0].id as string;

    // The attack the predicate must stop: the right id, the wrong tenant.
    const stolen = await store.upsertExecution(OTHER, campaignId, {
      id: executionId,
      title: "hijacked",
      actionType: "outreach",
      assigneeSub: null,
      dueAt: null,
      status: "done",
    });
    assert.equal(stolen, null, "a foreign workspace must see not-found, not an update");

    const after = await withPg((c) =>
      c.query(`SELECT title, status FROM yucer_gtm.campaign_execution WHERE id = $1`, [executionId]),
    );
    assert.equal(after.rows[0].title, "probe item", "the row must be untouched");
    assert.equal(after.rows[0].status, "pending");
  } finally {
    await cleanup();
  }
});

test("createProposals absorbs the race at the store, on the real index", { skip }, async () => {
  const { PrismaCopilotStore } = await import("../copilot/prisma-store");
  const store = new PrismaCopilotStore();
  const mk = () => ({
    sessionId: null,
    actionType: "chase_overdue_commitment",
    subjectType: "account" as const,
    subjectId: "77777777-7777-4777-8777-777777777777",
    payload: { commitmentId: "cm_dbt_race" },
    rationale: "db-level race probe",
    confidence: null,
  });
  try {
    const first = await store.createProposals(WS, [mk()]);
    assert.equal(first.length, 1);
    const second = await store.createProposals(WS, [mk()]);
    assert.equal(second.length, 0, "P2002 must be absorbed, not thrown and not doubled");
    const rows = await withPg((c) =>
      c.query(
        `SELECT count(*)::int AS n FROM yucer_agent.agent_action WHERE workspace_id = $1 AND payload->>'commitmentId' = 'cm_dbt_race'`,
        [WS],
      ),
    );
    assert.equal(rows.rows[0].n, 1);
  } finally {
    await cleanup();
  }
});

test("the column locks fire live: yucer_svc cannot move a segment's anchor", { skip }, async () => {
  // The first live shot ever fired at 98_column_locks.sql. Every other test
  // connects as the superuser, which bypasses grants entirely.
  try {
    await withPg(async (c) => {
      await c.query(
        `INSERT INTO yucer_gtm.market_segment (workspace_id, segment_code, name) VALUES ($1, 'DBT-LOCK', 'lock probe')`,
        [WS],
      );
      await c.query(`SET ROLE yucer_svc`);
      // The whitelist: name is granted, so this succeeds.
      await c.query(
        `UPDATE yucer_gtm.market_segment SET name = 'renamed by svc' WHERE workspace_id = $1 AND segment_code = 'DBT-LOCK'`,
        [WS],
      );
      // The anchor: segment_code carries no UPDATE grant. This is the design
      // failing closed, live.
      await assert.rejects(
        c.query(
          `UPDATE yucer_gtm.market_segment SET segment_code = 'DBT-MOVED' WHERE workspace_id = $1`,
          [WS],
        ),
        /permission denied/,
      );
      await c.query(`RESET ROLE`);
    });
  } finally {
    await cleanup();
  }
});

test("an append-only table has no UPDATE for the service role at all", { skip }, async () => {
  // agent_message is one of the four append-only tables: corrections are new
  // rows. The REVOKE with no re-grant is the whole rule; prove it holds.
  await withPg(async (c) => {
    await c.query(`SET ROLE yucer_svc`);
    await assert.rejects(
      c.query(`UPDATE yucer_agent.agent_message SET content = 'rewritten history' WHERE false`),
      /permission denied/,
    );
    await c.query(`RESET ROLE`);
  });
});

test("markFlushed advances the real checkpoint watermark", { skip }, async () => {
  // The other half of the connectivity fix: prove the upsert really lands on
  // local_usage.checkpoint's (workspace_id, metric) unique row, twice.
  const { PrismaUsageStore } = await import("../../usage/lib/prisma-store");
  const store = new PrismaUsageStore();
  try {
    await store.record({ workspaceId: WS, metric: "copilot.turns", amount: 1, idempotencyKey: "dbt_u1" });
    await store.markFlushed([{ idempotencyKey: "dbt_u1", workspaceId: WS, metric: "copilot.turns" }]);
    const first = await withPg((c) =>
      c.query(`SELECT flushed_at FROM local_usage.checkpoint WHERE workspace_id = $1 AND metric = 'copilot.turns'`, [WS]),
    );
    assert.equal(first.rows.length, 1, "the watermark row must exist after a flush");

    // A second flush UPDATES the same row rather than violating the unique.
    await store.record({ workspaceId: WS, metric: "copilot.turns", amount: 2, idempotencyKey: "dbt_u2" });
    await store.markFlushed([{ idempotencyKey: "dbt_u2", workspaceId: WS, metric: "copilot.turns" }]);
    const second = await withPg((c) =>
      c.query(`SELECT count(*)::int AS n FROM local_usage.checkpoint WHERE workspace_id = $1`, [WS]),
    );
    assert.equal(second.rows[0].n, 1, "one watermark per (workspace, metric)");
  } finally {
    await cleanup();
  }
});
