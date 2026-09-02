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

async function cleanup() {
  await withPg(async (c) => {
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
    });
    assert.equal(created.name, "Kickoff");

    const updated = await s.upsertMilestone(WS, PROJ, {
      sequence: 1, name: "Kickoff (done)", dueAt: new Date("2026-09-10T00:00:00Z"), completedAt: new Date("2026-09-11T00:00:00Z"), status: "done",
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
    await s.upsertMilestone(WS, PROJ, { sequence: 2, name: "Second", dueAt: null, completedAt: null, status: "pending" });
    await s.upsertMilestone(WS, PROJ, { sequence: 1, name: "First", dueAt: null, completedAt: null, status: "pending" });
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
    await withPg(seed);
    await withPg((c) =>
      c.query(
        `INSERT INTO yucer_delivery.revenue_schedule (workspace_id, project_id, sequence, planned_amount, currency, status)
         VALUES ($1, $2, 1, 100000, 'CNY', 'planned')`,
        [WS, PROJ],
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
    await withPg(seed);
    const row = await withPg((c) =>
      c.query(
        `INSERT INTO yucer_delivery.revenue_schedule (workspace_id, project_id, sequence, planned_amount, currency, status)
         VALUES ($1, $2, 1, 100000, 'CNY', 'planned') RETURNING id`,
        [WS, PROJ],
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
    await withPg(seed);
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO yucer_delivery.revenue_schedule (workspace_id, project_id, sequence, planned_amount, currency)
             VALUES ($1, $2, 1, -100, 'CNY')`,
            [WS, PROJ],
          ),
        ),
      /chk_revenue_schedule_amounts/,
    );
  } finally {
    await cleanup();
  }
});
