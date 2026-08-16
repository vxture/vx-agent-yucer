import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// The evidence plane, against a real Postgres (ADR-006).
//
// Everything here is a property of the DATABASE - a CHECK, a REVOKE, a foreign
// key, a partial index. None of it can be modelled by the in-memory adapters,
// and this increment is the first in the repo's life to create a table, so it
// is also the first to exercise the grant/lock ordering rules ADR-006 records.
//
// Self-skipping without DATABASE_URL; the ci.yml db-contract lane runs them.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "dddddddd-0000-0000-0000-000000000001";
const ACC = "dddddddd-0000-0000-0000-0000000000a1";

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** An account plus one interaction, inside the caller's transaction. */
async function seed(c: Client): Promise<string> {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-FIELD', 'Field', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO yucer_field.interaction
       (workspace_id, account_id, channel, occurred_at, actor_sub, raw_note)
     VALUES ($1, $2, 'meeting', now(), 'usr_rep', 'customer says the budget is not approved yet')
     RETURNING id`,
    [WS, ACC],
  );
  return rows[0].id;
}

// --- The increment applied at all ------------------------------------------

test("the field schema and its three tables exist", { skip }, async () => {
  await withDb(async (c) => {
    const { rows } = await c.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'yucer_field' AND table_type = 'BASE TABLE' ORDER BY 1`,
    );
    assert.deepEqual(
      rows.map((r) => r.table_name),
      ["commitment", "interaction", "interaction_participant"],
    );
  });
});

test("the service role can actually reach them", { skip }, async () => {
  // The trap ADR-006 exists for. 97_service_role.sql granted ON ALL TABLES
  // before these tables existed, and Postgres evaluates that at grant time - so
  // without the grants inside this increment, yucer_svc would have NOTHING here
  // and the failure would appear at runtime against a database that applied
  // cleanly.
  await withDb(async (c) => {
    for (const t of ["interaction", "interaction_participant", "commitment"]) {
      const { rows } = await c.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
         WHERE grantee = 'yucer_svc' AND table_schema = 'yucer_field' AND table_name = $1
         ORDER BY 1`,
        [t],
      );
      const got = rows.map((r) => r.privilege_type);
      assert.ok(got.includes("SELECT"), `${t} has no SELECT for the service role`);
      assert.ok(got.includes("INSERT"), `${t} has no INSERT for the service role`);
    }
  });
});

// --- Evidence is frozen, and it does not disappear -------------------------

test("evidence tables have no UPDATE at any level", { skip }, async () => {
  await withDb(async (c) => {
    for (const t of ["interaction", "interaction_participant"]) {
      const { rows } = await c.query(
        `SELECT 1 FROM information_schema.column_privileges
         WHERE grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
           AND table_schema = 'yucer_field' AND table_name = $1`,
        [t],
      );
      assert.equal(rows.length, 0, `${t} is writable but must be append-only`);
    }
  });
});

test("evidence cannot be DELETED by the service role either", { skip }, async () => {
  // "Append-only" has so far meant "no UPDATE" in this repo, while 97 hands out
  // DELETE ON ALL TABLES. A judgement citing what a customer said on 4 March is
  // worthless if that row can be removed, so this plane withholds DELETE too.
  await withDb(async (c) => {
    for (const t of ["interaction", "interaction_participant", "commitment"]) {
      const { rows } = await c.query(
        `SELECT 1 FROM information_schema.table_privileges
         WHERE grantee = 'yucer_svc' AND privilege_type = 'DELETE'
           AND table_schema = 'yucer_field' AND table_name = $1`,
        [t],
      );
      assert.equal(rows.length, 0, `${t} grants DELETE; evidence must not be erasable`);
    }
  });
});

test("a commitment's promise is frozen; only its lifecycle moves", { skip }, async () => {
  await withDb(async (c) => {
    const { rows } = await c.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.column_privileges
       WHERE grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
         AND table_schema = 'yucer_field' AND table_name = 'commitment'
       ORDER BY 1`,
    );
    assert.deepEqual(rows.map((r) => r.column_name), [
      "closure_evidence_id",
      "closure_evidence_kind",
      "met_at",
      "status",
      "updated_at",
      "waive_reason",
      "waived_by_sub",
    ]);
  });
});

// --- The rule that makes a commitment worth having -------------------------

test("a commitment cannot be marked met by simply saying so", { skip }, async () => {
  // The whole point. A "next step" its own owner can tick off is not an
  // obligation - it is a to-do list, and a to-do list has never diagnosed a
  // stalled deal.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const interactionId = await seed(c);
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO yucer_field.commitment
           (workspace_id, account_id, direction, statement, owner_sub, due_at)
         VALUES ($1, $2, 'we_owe', 'arrange the CFO introduction', 'usr_rep', now() + interval '3 days')
         RETURNING id`,
        [WS, ACC],
      );
      const id = rows[0].id;

      await c.query("SAVEPOINT p");
      await assert.rejects(
        () => c.query(`UPDATE yucer_field.commitment SET status = 'met' WHERE id = $1`, [id]),
        /chk_commitment_met_needs_evidence/,
      );
      await c.query("ROLLBACK TO SAVEPOINT p");

      // With real evidence, it closes.
      const ok = await c.query(
        `UPDATE yucer_field.commitment
         SET status = 'met', closure_evidence_kind = 'interaction',
             closure_evidence_id = $2, met_at = now()
         WHERE id = $1`,
        [id, interactionId],
      );
      assert.equal(ok.rowCount, 1);
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("waiving a commitment requires a name and a reason", { skip }, async () => {
  // Waiving is a decision. An anonymous waive is indistinguishable from the
  // promise never having existed.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      await seed(c);
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO yucer_field.commitment
           (workspace_id, account_id, direction, statement, due_at)
         VALUES ($1, $2, 'they_owe', 'return the stamped technical confirmation', now() - interval '1 day')
         RETURNING id`,
        [WS, ACC],
      );
      await c.query("SAVEPOINT p");
      await assert.rejects(
        () => c.query(`UPDATE yucer_field.commitment SET status = 'waived' WHERE id = $1`, [rows[0].id]),
        /chk_commitment_waive_needs_reason/,
      );
      await c.query("ROLLBACK TO SAVEPOINT p");
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("missed needs nothing - a promise fails by the date passing", { skip }, async () => {
  // Deliberately asymmetric with `met`. Success must be evidenced; failure is
  // what happens when nothing does.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      await seed(c);
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO yucer_field.commitment
           (workspace_id, account_id, direction, statement, due_at)
         VALUES ($1, $2, 'they_owe', 'give us the procurement timeline', now() - interval '2 days')
         RETURNING id`,
        [WS, ACC],
      );
      const r = await c.query(
        `UPDATE yucer_field.commitment SET status = 'missed' WHERE id = $1`,
        [rows[0].id],
      );
      assert.equal(r.rowCount, 1);
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

// --- Participants -----------------------------------------------------------

test("a participant must be somebody", { skip }, async () => {
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const interactionId = await seed(c);
      await assert.rejects(
        () =>
          c.query(
            `INSERT INTO yucer_field.interaction_participant (workspace_id, interaction_id)
             VALUES ($1, $2)`,
            [WS, interactionId],
          ),
        /chk_participant_identified/,
      );
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("an unknown attendee can be recorded before they are a contact", { skip }, async () => {
  // The person who walked in unannounced is exactly the one worth recording,
  // and requiring a contact row first would mean they are not.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const interactionId = await seed(c);
      const r = await c.query(
        `INSERT INTO yucer_field.interaction_participant
           (workspace_id, interaction_id, external_name, role_at_time)
         VALUES ($1, $2, 'a VP who walked in unannounced', 'economic')`,
        [WS, interactionId],
      );
      assert.equal(r.rowCount, 1);
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

// --- Correction is a new row ------------------------------------------------

test("a correction points at what it corrects, and cannot point at itself", { skip }, async () => {
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const original = await seed(c);
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO yucer_field.interaction
           (workspace_id, account_id, channel, occurred_at, actor_sub, raw_note, corrects_interaction_id)
         VALUES ($1, $2, 'meeting', now(), 'usr_rep', 'correction: next Wednesday, not this one', $3)
         RETURNING id`,
        [WS, ACC, original],
      );
      assert.ok(rows[0].id);

      await c.query("SAVEPOINT p");
      await assert.rejects(
        () =>
          c.query(
            `UPDATE yucer_field.interaction SET corrects_interaction_id = id WHERE id = $1`,
            [rows[0].id],
          ),
        // No UPDATE grant at all on this table - the write is refused before
        // the CHECK is ever consulted, which is the stronger guarantee.
        /permission denied|chk_interaction_corrects_self/,
      );
      await c.query("ROLLBACK TO SAVEPOINT p");
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("an interaction is scoped to an account that exists", { skip }, async () => {
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      await assert.rejects(
        () =>
          c.query(
            `INSERT INTO yucer_field.interaction
               (workspace_id, account_id, channel, occurred_at, actor_sub, raw_note)
             VALUES ($1, '00000000-0000-0000-0000-0000000000ff', 'call', now(), 'usr_rep', 'x')`,
            [WS],
          ),
        /fk_interaction_account/,
      );
    } finally {
      await c.query("ROLLBACK");
    }
  });
});
