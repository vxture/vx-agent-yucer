import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaAuditStore, against a real Postgres (TD-018 / L1 X-3).
//
// local_audit.event has never had a db test at all - neither the DDL
// constraints (append-only, the outcome CHECK, the cost-pair CHECK) nor
// PrismaAuditStore.record() itself, which every write in admin.ts,
// turn-service.ts and streaming-turn.ts goes through in production.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000002";

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
  await withPg((c) => c.query(`DELETE FROM local_audit.event WHERE workspace_id = $1`, [WS]));
}

async function store() {
  const { PrismaAuditStore } = await import("./prisma-store");
  return new PrismaAuditStore();
}

test("record() writes every field, including the nullable consumer-plane ones", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.record({
      workspaceId: WS,
      actorId: "usr_rep",
      actorConsole: "yucer",
      objectType: "copilot_turn",
      objectId: "sess_1",
      action: "copilot.ask",
      outcome: "success",
      taskId: "sess_1:1",
      costAmount: 240,
      costUnit: "tokens",
    });

    const row = await withPg((c) => c.query(`SELECT * FROM local_audit.event WHERE workspace_id = $1`, [WS]));
    assert.equal(row.rows.length, 1);
    const r = row.rows[0];
    assert.equal(r.actor_id, "usr_rep");
    assert.equal(r.actor_console, "yucer");
    assert.equal(r.object_type, "copilot_turn");
    assert.equal(r.object_id, "sess_1");
    assert.equal(r.action, "copilot.ask");
    assert.equal(r.outcome, "success");
    assert.equal(r.task_id, "sess_1:1");
    assert.equal(Number(r.cost_amount), 240);
    assert.equal(r.cost_unit, "tokens");
    assert.ok(r.id, "the row names its own eventId");
    assert.ok(r.occurred_at, "occurred_at defaults rather than being left null");
  } finally {
    await cleanup();
  }
});

test("record() writes null for the management-plane fields that do not apply", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.record({
      workspaceId: WS,
      actorId: "usr_admin",
      actorConsole: "yucer",
      objectType: "member",
      objectId: "usr_target",
      action: "admin.member.role.assign",
      outcome: "denied",
      taskId: null,
      costAmount: null,
      costUnit: null,
    });
    const row = await withPg((c) => c.query(`SELECT task_id, cost_amount, cost_unit FROM local_audit.event WHERE workspace_id = $1`, [WS]));
    assert.equal(row.rows[0].task_id, null);
    assert.equal(row.rows[0].cost_amount, null);
    assert.equal(row.rows[0].cost_unit, null);
  } finally {
    await cleanup();
  }
});

test("actorConsole can be null - a backend channel that belongs to no console", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.record({
      workspaceId: WS,
      actorId: "job:commitment-sweep",
      actorConsole: null,
      objectType: "commitment",
      objectId: "cmt_1",
      action: "sweep.propose",
      outcome: "success",
      taskId: null,
      costAmount: null,
      costUnit: null,
    });
    const row = await withPg((c) => c.query(`SELECT actor_console FROM local_audit.event WHERE workspace_id = $1`, [WS]));
    assert.equal(row.rows[0].actor_console, null);
  } finally {
    await cleanup();
  }
});

test("an unrecognised outcome is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO local_audit.event (workspace_id, actor_id, object_type, object_id, action, outcome)
             VALUES ($1, 'usr_x', 'member', 'usr_y', 'admin.member.role.assign', 'bogus')`,
            [WS],
          ),
        ),
      /chk_event_outcome/,
    );
  } finally {
    await cleanup();
  }
});

test("a cost with no unit, or a unit with no cost, is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO local_audit.event (workspace_id, actor_id, object_type, object_id, action, outcome, cost_amount)
             VALUES ($1, 'usr_x', 'copilot_turn', 'sess_1', 'copilot.ask', 'success', 100)`,
            [WS],
          ),
        ),
      /chk_event_cost_pair/,
    );
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO local_audit.event (workspace_id, actor_id, object_type, object_id, action, outcome, cost_unit)
             VALUES ($1, 'usr_x', 'copilot_turn', 'sess_1', 'copilot.ask', 'success', 'tokens')`,
            [WS],
          ),
        ),
      /chk_event_cost_pair/,
    );
  } finally {
    await cleanup();
  }
});

test("the event table is append-only - no UPDATE, no DELETE for the service role", { skip }, async () => {
  await withPg(async (c) => {
    const upd = await c.query(
      `SELECT 1 FROM information_schema.column_privileges
       WHERE grantee = 'yucer_svc' AND privilege_type = 'UPDATE' AND table_schema = 'local_audit' AND table_name = 'event'`,
    );
    assert.equal(upd.rows.length, 0, "the audit trail must not be editable");
    const del = await c.query(
      `SELECT 1 FROM information_schema.table_privileges
       WHERE grantee = 'yucer_svc' AND privilege_type = 'DELETE' AND table_schema = 'local_audit' AND table_name = 'event'`,
    );
    assert.equal(del.rows.length, 0, "the audit trail must not be erasable");
  });
});

test("record() itself never UPDATEs or DELETEs - it is insert-only end to end", { skip }, async () => {
  // The strongest version of the append-only claim: not just that the grant
  // is missing, but that calling the actual method twice produces two rows,
  // never one row mutated in place.
  await cleanup();
  try {
    const s = await store();
    const input = {
      workspaceId: WS,
      actorId: "usr_rep",
      actorConsole: "yucer",
      objectType: "copilot_turn",
      objectId: "sess_1",
      action: "copilot.ask",
      outcome: "success" as const,
      taskId: "sess_1:1",
      costAmount: 10,
      costUnit: "tokens",
    };
    await s.record(input);
    await s.record({ ...input, outcome: "error" as const, costAmount: 20 });
    const rows = await withPg((c) => c.query(`SELECT outcome, cost_amount FROM local_audit.event WHERE workspace_id = $1 ORDER BY occurred_at`, [WS]));
    assert.equal(rows.rows.length, 2, "a correction is a new row, not an edit of the first one");
  } finally {
    await cleanup();
  }
});
