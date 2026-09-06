import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaDeliveryStore, against a real Postgres.
//
// Nothing here has ever run against yucer_delivery - DeliveryStore has no
// createProject() (a project's row is created elsewhere, outside this port),
// so every project used below is seeded with raw SQL, matching how a real
// row gets there. What's actually under test is the translation layer:
// updateProject()'s money/currency pairing, upsertMilestone()'s upsert-by-
// (project, sequence), and listInstalments()'s Money reconstruction from a
// nullable NUMERIC column.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000005";
const ACC = "eeeeeeee-0000-0000-0000-0000000000a1";
const PROJ = "eeeeeeee-0000-0000-0000-0000000000b1";
const PROJ2 = "eeeeeeee-0000-0000-0000-0000000000b2";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

// incr/0032 - every instalment names a gate, so the seed writes one. Before
// that increment these tests inserted money with milestone_id NULL; the column
// is NOT NULL now and the failures were the constraint working.
const SEED_GATE = "eeeeeeee-0000-0000-0000-0000000000cf";

async function seed(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-DELIV', 'Delivery Test', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
  await c.query(
    `INSERT INTO yucer_delivery.project (id, workspace_id, project_no, name, account_id, contract_amount, currency, status)
     VALUES ($1, $2, 'PRJ-1', 'Rollout', $3, 500000, 'CNY', 'active') ON CONFLICT DO NOTHING`,
    [PROJ, WS, ACC],
  );
  await c.query(
    `INSERT INTO yucer_delivery.project (id, workspace_id, project_no, name, account_id, status)
     VALUES ($1, $2, 'PRJ-2', 'Pilot', $3, 'planning') ON CONFLICT DO NOTHING`,
    [PROJ2, WS, ACC],
  );
}

/**
 * A project WITH a gate to hang money off.
 *
 * Separate from `seed` on purpose: adding this to the shared seed put a
 * milestone into every listMilestones assertion in the file, which is how a
 * fixture starts quietly answering the questions the tests are asking.
 */
async function seedWithGate(c: Client): Promise<void> {
  await seed(c);
  await c.query(
    `INSERT INTO yucer_delivery.project_milestone
       (id, workspace_id, project_id, name, sequence, status, due_at, baseline_due_at)
     VALUES ($1, $2, $3, 'Seeded gate', 9, 'pending', now(), now()) ON CONFLICT DO NOTHING`,
    [SEED_GATE, WS, PROJ],
  );
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM yucer_delivery.milestone_change WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_delivery.revenue_schedule WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_delivery.project_milestone WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_delivery.project WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaDeliveryStore } = await import("./prisma-store");
  return new PrismaDeliveryStore();
}

// --- Projects ------------------------------------------------------------------

test("listProjects filters by status and account, newest first", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const active = await s.listProjects(WS, { status: "active" });
    assert.deepEqual(active.map((p) => p.id), [PROJ]);

    const onAccount = await s.listProjects(WS, { accountId: ACC });
    assert.equal(onAccount.length, 2);
  } finally {
    await cleanup();
  }
});

test("getProject reconstructs the contract amount as Money, and null stays null", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const withAmount = await s.getProject(WS, PROJ);
    assert.equal(withAmount?.contractAmount?.amount, 500_000);
    assert.equal(withAmount?.contractAmount?.currency, "CNY");

    const withoutAmount = await s.getProject(WS, PROJ2);
    assert.equal(withoutAmount?.contractAmount, null);
  } finally {
    await cleanup();
  }
});

test("getProject defaults engagementType to one_off for a row written before it existed", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const p = await s.getProject(WS, PROJ);
    assert.equal(p?.engagementType, "one_off");
  } finally {
    await cleanup();
  }
});

test("updateProject writes the contract amount and currency together, and getProject reads them back", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const ok = await s.updateProject(WS, PROJ2, {
      contractAmount: { amount: 250_000, currency: "USD" },
      health: "amber",
    });
    assert.equal(ok, true);
    const after = await s.getProject(WS, PROJ2);
    assert.equal(after?.contractAmount?.amount, 250_000);
    assert.equal(after?.contractAmount?.currency, "USD");
    assert.equal(after?.health, "amber");
  } finally {
    await cleanup();
  }
});

test("updateProject returns false when nothing matched", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ok = await s.updateProject(WS, "eeeeeeee-0000-0000-0000-0000000000ff", { health: "red" });
    assert.equal(ok, false);
  } finally {
    await cleanup();
  }
});

test("an unrecognised health value is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    await assert.rejects(() => s.updateProject(WS, PROJ, { health: "bogus" as never }), /chk_project_health/);
  } finally {
    await cleanup();
  }
});

// --- Milestones ------------------------------------------------------------------

test("upsertMilestone creates at a fresh sequence and updates in place at an existing one", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.upsertMilestone(WS, PROJ, {
      sequence: 1, name: "Kickoff", dueAt: new Date("2026-09-10T00:00:00Z"), completedAt: null, status: "pending",
      baselineDueAt: new Date("2026-09-10T00:00:00Z"), acceptance: null,
    });
    assert.equal(created.name, "Kickoff");

    const updated = await s.upsertMilestone(WS, PROJ, {
      sequence: 1, name: "Kickoff (done)", dueAt: new Date("2026-09-10T00:00:00Z"), completedAt: new Date("2026-09-11T00:00:00Z"), status: "done",
      // The store writes what it is given; refusing a restated baseline is the
      // rule layer's job, and the missing UPDATE grant is the database's.
      baselineDueAt: new Date("2026-09-10T00:00:00Z"), acceptance: null,
    });
    assert.equal(updated.id, created.id, "same (project, sequence) must upsert, not duplicate");
    assert.equal(updated.status, "done");

    const list = await s.listMilestones(WS, PROJ);
    assert.equal(list.length, 1);
  } finally {
    await cleanup();
  }
});

test("listMilestones orders by sequence, not by creation order", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    await s.upsertMilestone(WS, PROJ, { sequence: 2, name: "Second", dueAt: null, completedAt: null, status: "pending", baselineDueAt: null, acceptance: null });
    await s.upsertMilestone(WS, PROJ, { sequence: 1, name: "First", dueAt: null, completedAt: null, status: "pending", baselineDueAt: null, acceptance: null });
    const list = await s.listMilestones(WS, PROJ);
    assert.deepEqual(list.map((m) => m.name), ["First", "Second"]);
  } finally {
    await cleanup();
  }
});

// --- Instalments -------------------------------------------------------------

test("listInstalments reconstructs planned and actual Money, actual staying null until settled", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedWithGate);
    await withPg((c) =>
      c.query(
        `INSERT INTO yucer_delivery.revenue_schedule (workspace_id, project_id, milestone_id, sequence, planned_amount, currency, status)
         VALUES ($1, $2, $3, 1, 100000, 'CNY', 'planned')`,
        [WS, PROJ, SEED_GATE],
      ),
    );
    const s = await store();
    const list = await s.listInstalments(WS, PROJ);
    assert.equal(list.length, 1);
    assert.equal(list[0].plannedAmount.amount, 100_000);
    assert.equal(list[0].actualAmount, null);
  } finally {
    await cleanup();
  }
});

test("updateInstalment writes actualAmount and currency together", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedWithGate);
    const row = await withPg((c) =>
      c.query(
        `INSERT INTO yucer_delivery.revenue_schedule (workspace_id, project_id, milestone_id, sequence, planned_amount, currency, status)
         VALUES ($1, $2, $3, 1, 100000, 'CNY', 'planned') RETURNING id`,
        [WS, PROJ, SEED_GATE],
      ),
    );
    const id = row.rows[0].id;
    const s = await store();
    const ok = await s.updateInstalment(WS, id, {
      status: "settled",
      actualAmount: { amount: 98_000, currency: "CNY" },
      settledAt: new Date("2026-09-15T00:00:00Z"),
    });
    assert.equal(ok, true);

    const list = await s.listInstalments(WS, PROJ);
    assert.equal(list[0].status, "settled");
    assert.equal(list[0].actualAmount?.amount, 98_000);
  } finally {
    await cleanup();
  }
});

test("planned_amount and actual_amount cannot go negative - the real CHECK, not application logic", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedWithGate);
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO yucer_delivery.revenue_schedule (workspace_id, project_id, milestone_id, sequence, planned_amount, currency)
             VALUES ($1, $2, $3, 1, -100, 'CNY')`,
            [WS, PROJ, SEED_GATE],
          ),
        ),
      /chk_revenue_schedule_amounts/,
    );
  } finally {
    await cleanup();
  }
});

// --- incr/0032: a milestone is a commercial gate -----------------------------
//
// EVERY GUARANTEE BELOW IS POSTGRES'S, NOT TYPESCRIPT'S. A NOT NULL, a
// composite foreign key, a CHECK and a missing GRANT are properties of the
// database and of nothing else - a fully green TS suite says nothing about any
// of them, which is why db-contract exists as its own required check.

const MS = "eeeeeeee-0000-0000-0000-0000000000c1";
const MS2 = "eeeeeeee-0000-0000-0000-0000000000c2";

/** A gate on PROJ, written with raw SQL so the constraints are what is tested. */
async function gate(c: Client, id: string, project: string, seq: number, status = "pending") {
  await c.query(
    `INSERT INTO yucer_delivery.project_milestone
       (id, workspace_id, project_id, name, sequence, status, due_at, baseline_due_at)
     VALUES ($1, $2, $3, 'Gate', $4, $5, now(), now())`,
    [id, WS, project, seq, status],
  );
}

test("an instalment cannot exist without a gate to release it", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    await withPg(async (c) => {
      await assert.rejects(
        () =>
          c.query(
            `INSERT INTO yucer_delivery.revenue_schedule
               (workspace_id, project_id, sequence, planned_amount) VALUES ($1, $2, 1, 100)`,
            [WS, PROJ],
          ),
        /milestone_id/,
        "回款不是凭空来的 - the column is NOT NULL, not merely conventionally filled",
      );
    });
  } finally {
    await cleanup();
  }
});

test("money cannot be released by a gate in someone else's contract", { skip }, async () => {
  // The single-column FK would have passed this: MS2 is a real milestone and
  // PROJ is a real project. Only the COMPOSITE key notices they are not the
  // same project.
  await cleanup();
  try {
    await withPg(seed);
    await withPg(async (c) => {
      await gate(c, MS2, PROJ2, 1);
      await assert.rejects(
        () =>
          c.query(
            `INSERT INTO yucer_delivery.revenue_schedule
               (workspace_id, project_id, milestone_id, sequence, planned_amount)
             VALUES ($1, $2, $3, 1, 100)`,
            [WS, PROJ, MS2],
          ),
        /fk_revenue_schedule_milestone/,
      );
    });
  } finally {
    await cleanup();
  }
});

test("a gate with money hanging off it cannot be deleted", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    await withPg(async (c) => {
      await gate(c, MS, PROJ, 1);
      await c.query(
        `INSERT INTO yucer_delivery.revenue_schedule
           (workspace_id, project_id, milestone_id, sequence, planned_amount)
         VALUES ($1, $2, $3, 1, 100)`,
        [WS, PROJ, MS],
      );
      await assert.rejects(
        () => c.query(`DELETE FROM yucer_delivery.project_milestone WHERE id = $1`, [MS]),
        /fk_revenue_schedule_milestone/,
        "ON DELETE RESTRICT - the old SET NULL would have orphaned the money silently",
      );
    });
  } finally {
    await cleanup();
  }
});

test("an acceptance is all three columns or none, and only on a done gate", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    await withPg(async (c) => {
      await gate(c, MS, PROJ, 1, "done");
      // A signature with no signatory.
      await assert.rejects(
        () =>
          c.query(
            `UPDATE yucer_delivery.project_milestone SET accepted_at = now() WHERE id = $1`,
            [MS],
          ),
        /chk_project_milestone_acceptance/,
      );
      // Signed off on work that is not finished.
      await gate(c, MS2, PROJ, 2, "in_progress");
      await assert.rejects(
        () =>
          c.query(
            `UPDATE yucer_delivery.project_milestone
                SET accepted_at = now(), accepted_by = 'Wang', acceptance_recorded_by_sub = 'usr'
              WHERE id = $1`,
            [MS2],
          ),
        /chk_project_milestone_accepted_is_done/,
      );
      // The whole trio on a done gate is fine.
      await c.query(
        `UPDATE yucer_delivery.project_milestone
            SET accepted_at = now(), accepted_by = 'Wang', acceptance_recorded_by_sub = 'usr'
          WHERE id = $1`,
        [MS],
      );
    });
  } finally {
    await cleanup();
  }
});

test("what was committed cannot be rewritten by the service role", { skip }, async () => {
  // THE MECHANISM IS A MISSING GRANT, not a trigger and not a convention.
  // Postgres reports it per COLUMN, so the test has to be the service role to
  // see it at all - as the owner, the same UPDATE succeeds.
  await cleanup();
  try {
    await withPg(seed);
    await withPg(async (c) => {
      await gate(c, MS, PROJ, 1);
      await c.query(`SET ROLE yucer_svc`);
      await assert.rejects(
        () =>
          c.query(
            `UPDATE yucer_delivery.project_milestone SET baseline_due_at = now() WHERE id = $1`,
            [MS],
          ),
        /permission denied for (column|table)/,
        "slippage is subtraction only while the left-hand side cannot move",
      );
      // The date it is measured AGAINST is writable - that is the whole point.
      await c.query(`UPDATE yucer_delivery.project_milestone SET due_at = now() WHERE id = $1`, [MS]);
      await c.query(`RESET ROLE`);
    });
  } finally {
    await cleanup();
  }
});

test("a change record cannot be edited away, and carries a reason", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    await withPg(async (c) => {
      await gate(c, MS, PROJ, 1);
      await assert.rejects(
        () =>
          c.query(
            `INSERT INTO yucer_delivery.milestone_change
               (workspace_id, milestone_id, changed_by_sub, field, reason)
             VALUES ($1, $2, 'usr', 'due_at', '   ')`,
            [WS, MS],
          ),
        /chk_milestone_change_reason/,
        "a blank reason records that something moved and loses the only part anyone reads",
      );
      await c.query(
        `INSERT INTO yucer_delivery.milestone_change
           (workspace_id, milestone_id, changed_by_sub, field, from_value, to_value, reason)
         VALUES ($1, $2, 'usr', 'due_at', 'a', 'b', 'customer site works ran late')`,
        [WS, MS],
      );

      await c.query(`SET ROLE yucer_svc`);
      for (const sql of [
        `UPDATE yucer_delivery.milestone_change SET reason = 'nicer' WHERE workspace_id = $1`,
        `DELETE FROM yucer_delivery.milestone_change WHERE workspace_id = $1`,
      ]) {
        await assert.rejects(
          () => c.query(sql, [WS]),
          /permission denied/,
          "append-only: a correction is a new row",
        );
      }
      await c.query(`RESET ROLE`);
    });
  } finally {
    await cleanup();
  }
});
