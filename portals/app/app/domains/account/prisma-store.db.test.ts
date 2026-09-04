import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaAccountStore against a real Postgres.
//
// prisma-store.test.ts already drives this class with a FAKE client, and it
// covers what a fake client can cover: the predicate that scopes an edit to a
// workspace AND an account, the column-lock guard, the mapping of a row into a
// record. What a fake client cannot cover is whether the query it builds is one
// Postgres accepts and answers the way the class assumes - so five methods sat
// with no test of any kind: listContacts, removeRelation, getAccountPlan,
// upsertAccountPlan, and toAccount.
//
// THE ONE THIS FILE EXISTS FOR is upsertAccountPlan. Its shape is the shape
// that has already produced two production bugs in this repo - a write that
// names its columns in one place and is read back somewhere else, where a field
// the object carries never reaches the row and nothing says so. createTarget()
// dropped `status`; upsertTerritory() never wrote `regions` at all. So the test
// here does not ask the adapter what it wrote. It reads the row back with raw
// SQL and checks every column the method claims to set.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts. In CI the
// db-contract job applies the full DDL first.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000001";
const WS_OTHER = "eeeeeeee-0000-0000-0000-000000000002";
const ACC = "eeeeeeee-0000-0000-0000-0000000000a1";
const ACC_OTHER_WS = "eeeeeeee-0000-0000-0000-0000000000a2";
const C_HIGH = "eeeeeeee-0000-0000-0000-0000000000c1";
const C_LOW = "eeeeeeee-0000-0000-0000-0000000000c2";
const C_NULL = "eeeeeeee-0000-0000-0000-0000000000c3";
const C_GONE = "eeeeeeee-0000-0000-0000-0000000000c4";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function store() {
  const { PrismaAccountStore } = await import("./prisma-store");
  return new PrismaAccountStore();
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM yucer_core.account_relation WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
    await c.query(`DELETE FROM yucer_core.account_plan WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
    await c.query(`DELETE FROM yucer_core.contact WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
  });
}

async function seed(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, industry, region, owner_sub, health_score, status, tier)
     VALUES ($1, $2, 'ACC-PAS-1', 'Prisma Account Store', 'logistics', 'east', 'usr_rep', 61, 'active', 'strategic')`,
    [ACC, WS],
  );
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-PAS-2', 'Another Workspace', 'active')`,
    [ACC_OTHER_WS, WS_OTHER],
  );
  // Influence descending with a NULL, which is the ordering under test.
  const contacts: [string, string, number | null, string][] = [
    [C_HIGH, "High Influence", 90, "active"],
    [C_LOW, "Low Influence", 10, "active"],
    [C_NULL, "Unscored", null, "active"],
  ];
  for (const [id, name, influence, status] of contacts) {
    await c.query(
      `INSERT INTO yucer_core.contact (id, workspace_id, account_id, name, decision_role, influence, status)
       VALUES ($1, $2, $3, $4, 'economic', $5, $6)`,
      [id, WS, ACC, name, influence, status],
    );
  }
  await c.query(
    `INSERT INTO yucer_core.contact (id, workspace_id, account_id, name, decision_role, influence, status, deleted_at)
     VALUES ($1, $2, $3, 'Soft Deleted', 'technical', 99, 'active', now())`,
    [C_GONE, WS, ACC],
  );
}

// --- listContacts ------------------------------------------------------------

test("listContacts orders by influence, and an unscored contact sorts last", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const rows = await (await store()).listContacts(WS, ACC);

    // `nulls: "last"` is a Prisma option that compiles to NULLS LAST. Postgres
    // sorts NULLs FIRST under DESC by default, so if that option ever came off
    // the unscored contact would lead the chain - which is the opposite of what
    // the column means.
    assert.deepEqual(
      rows.map((r) => r.name),
      ["High Influence", "Low Influence", "Unscored"],
    );
  } finally {
    await cleanup();
  }
});

test("listContacts hides a soft-deleted contact even though its influence is highest", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const rows = await (await store()).listContacts(WS, ACC);
    assert.equal(rows.length, 3, "the deleted contact must not be one of them");
    assert.ok(
      !rows.some((r) => r.name === "Soft Deleted"),
      "influence 99 would put it first if the deletedAt filter were missing",
    );
  } finally {
    await cleanup();
  }
});

test("listContacts answers for the account asked for, not the workspace", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const rows = await (await store()).listContacts(WS, ACC_OTHER_WS);
    assert.deepEqual(rows, [], "that account belongs to another workspace");
  } finally {
    await cleanup();
  }
});

// --- removeRelation ----------------------------------------------------------

test("removeRelation deletes the named edge and leaves its reverse alone", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await c.query(
        `INSERT INTO yucer_core.account_relation (workspace_id, from_contact_id, to_contact_id, relation_type)
         VALUES ($1, $2, $3, 'reports_to'), ($1, $3, $2, 'reports_to')`,
        [WS, C_LOW, C_HIGH],
      );
    });

    await (await store()).removeRelation(WS, {
      fromContactId: C_LOW,
      toContactId: C_HIGH,
      relationType: "reports_to",
    });

    const left = await withPg((c) =>
      c.query<{ from_contact_id: string; to_contact_id: string }>(
        `SELECT from_contact_id, to_contact_id FROM yucer_core.account_relation WHERE workspace_id = $1`,
        [WS],
      ),
    );
    // A -> B and B -> A are different facts. Deleting one must not take the
    // other: "reports to" is the relation this product models most, and it is
    // the one where direction IS the meaning.
    assert.equal(left.rowCount, 1);
    assert.equal(left.rows[0]!.from_contact_id, C_HIGH);
    assert.equal(left.rows[0]!.to_contact_id, C_LOW);
  } finally {
    await cleanup();
  }
});

test("removeRelation asked with the wrong workspace deletes nothing", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await c.query(
        `INSERT INTO yucer_core.account_relation (workspace_id, from_contact_id, to_contact_id, relation_type)
         VALUES ($1, $2, $3, 'peer_of')`,
        [WS, C_LOW, C_HIGH],
      );
    });

    // THE SCENARIO THIS IS NOT. The first version of this test put the same
    // edge under two workspaces and expected one to survive - and Postgres
    // refused the fixture, because uidx_account_relation_edge is on
    // (from_contact_id, to_contact_id, relation_type) with no workspace in it.
    // That index is right and the test was wrong: a contact row belongs to
    // exactly one workspace, so a pair of contact ids cannot repeat under
    // another one. The edge is already globally unique by construction.
    //
    // What the workspace predicate actually guards is this - a caller holding
    // a real edge and the wrong workspace id, which is what a leaked or stale
    // session looks like.
    await (await store()).removeRelation(WS_OTHER, {
      fromContactId: C_LOW,
      toContactId: C_HIGH,
      relationType: "peer_of",
    });

    const survivors = await withPg((c) =>
      c.query<{ workspace_id: string }>(
        `SELECT workspace_id FROM yucer_core.account_relation WHERE from_contact_id = $1`,
        [C_LOW],
      ),
    );
    assert.equal(survivors.rowCount, 1, "the edge belongs to WS and the call named WS_OTHER");
    assert.equal(survivors.rows[0]!.workspace_id, WS);
  } finally {
    await cleanup();
  }
});

test("removeRelation on an edge that is not there is not an error", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    // deleteMany, not delete. Removing a relation twice - two people clicking,
    // or a retry - is the same outcome as removing it once, and a throw here
    // would turn a no-op into an error page.
    await (await store()).removeRelation(WS, {
      fromContactId: C_LOW,
      toContactId: C_HIGH,
      relationType: "allied_with",
    });
  } finally {
    await cleanup();
  }
});

// --- getAccountPlan ----------------------------------------------------------

test("getAccountPlan returns null when the account has no plan", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    assert.equal(await (await store()).getAccountPlan(WS, ACC), null);
  } finally {
    await cleanup();
  }
});

test("getAccountPlan ignores a closed plan even when it is the newest", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await c.query(
        `INSERT INTO yucer_core.account_plan (workspace_id, account_id, period, status, contact_cadence_days, exec_cadence_days)
         VALUES ($1, $2, '2026Q1', 'active', 30, 90), ($1, $2, '2026Q4', 'closed', 14, 60)`,
        [WS, ACC],
      );
    });

    const plan = await (await store()).getAccountPlan(WS, ACC);
    // `period DESC` alone would pick 2026Q4. The status filter is what makes
    // this the ACTIVE plan rather than the latest one.
    assert.equal(plan?.period, "2026Q1");
    assert.equal(plan?.status, "active");
  } finally {
    await cleanup();
  }
});

test("getAccountPlan takes the latest period among the active ones", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await c.query(
        `INSERT INTO yucer_core.account_plan (workspace_id, account_id, period, status, contact_cadence_days, exec_cadence_days)
         VALUES ($1, $2, '2026Q1', 'active', 30, 90), ($1, $2, '2026Q3', 'active', 7, 30)`,
        [WS, ACC],
      );
    });

    const plan = await (await store()).getAccountPlan(WS, ACC);
    assert.equal(plan?.period, "2026Q3");
    assert.equal(plan?.contactCadenceDays, 7, "the row read must be the one ordered to, not either one");
  } finally {
    await cleanup();
  }
});

// --- upsertAccountPlan -------------------------------------------------------

const FULL_PLAN = {
  accountId: ACC,
  period: "2026Q3",
  targetAmount: 1_250_000,
  contactCadenceDays: 14,
  execCadenceDays: 45,
  ownerSub: "usr_owner",
  presalesSub: "usr_presales",
  deliverySub: "usr_delivery",
  status: "active" as const,
};

test("upsertAccountPlan writes every column it names, read back from the row", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const written = await (await store()).upsertAccountPlan(WS, FULL_PLAN);

    // NOT asserted against the returned object. The return value is built by
    // the same method under test, so it agrees with itself whether or not the
    // write happened - which is precisely how createTarget() dropped `status`
    // and upsertTerritory() dropped `regions` while their tests stayed green.
    const row = await withPg((c) =>
      c.query<Record<string, unknown>>(
        `SELECT target_amount, contact_cadence_days, exec_cadence_days,
                owner_sub, presales_sub, delivery_sub, status
           FROM yucer_core.account_plan WHERE id = $1`,
        [written.id],
      ),
    );
    assert.equal(row.rowCount, 1);
    const r = row.rows[0]!;
    assert.equal(Number(r.target_amount), 1_250_000);
    assert.equal(r.contact_cadence_days, 14);
    assert.equal(r.exec_cadence_days, 45);
    assert.equal(r.owner_sub, "usr_owner");
    assert.equal(r.presales_sub, "usr_presales");
    assert.equal(r.delivery_sub, "usr_delivery");
    assert.equal(r.status, "active");
  } finally {
    await cleanup();
  }
});

test("upsertAccountPlan re-plans the same period instead of adding a second row", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const first = await s.upsertAccountPlan(WS, FULL_PLAN);
    const second = await s.upsertAccountPlan(WS, {
      ...FULL_PLAN,
      contactCadenceDays: 7,
      ownerSub: "usr_new_owner",
      targetAmount: null,
    });

    // The unique index is (workspace_id, account_id, period); this is the test
    // that the composite key Prisma is given actually matches it.
    assert.equal(second.id, first.id, "same identity, so the same row");

    const rows = await withPg((c) =>
      c.query<Record<string, unknown>>(
        `SELECT contact_cadence_days, owner_sub, target_amount, exec_cadence_days
           FROM yucer_core.account_plan WHERE workspace_id = $1 AND account_id = $2`,
        [WS, ACC],
      ),
    );
    assert.equal(rows.rowCount, 1);
    const r = rows.rows[0]!;
    assert.equal(r.contact_cadence_days, 7);
    assert.equal(r.owner_sub, "usr_new_owner");
    assert.equal(r.target_amount, null, "a target cleared on re-plan must actually clear");
    assert.equal(r.exec_cadence_days, 45, "a field the caller did not change must survive");
  } finally {
    await cleanup();
  }
});

test("upsertAccountPlan keeps two periods for one account apart", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const q3 = await s.upsertAccountPlan(WS, FULL_PLAN);
    const q4 = await s.upsertAccountPlan(WS, { ...FULL_PLAN, period: "2026Q4" });

    assert.notEqual(q3.id, q4.id, "period is part of the identity, so this is a new plan");
    const count = await withPg((c) =>
      c.query(`SELECT 1 FROM yucer_core.account_plan WHERE workspace_id = $1 AND account_id = $2`, [WS, ACC]),
    );
    assert.equal(count.rowCount, 2);
  } finally {
    await cleanup();
  }
});

// --- toAccount, through a real row -------------------------------------------

test("toAccount maps a real row, including the columns that may be null", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      // Everything optional left unset, which is the shape a freshly created
      // account has before anyone fills it in.
      await c.query(
        `INSERT INTO yucer_core.account (workspace_id, account_no, name, status)
         VALUES ($1, 'ACC-PAS-3', 'Bare Account', 'active')`,
        [WS],
      );
    });

    const rows = await (await store()).listAccounts(WS);
    const bare = rows.find((r) => r.name === "Bare Account");
    assert.ok(bare, "the bare account must come back at all");
    assert.equal(bare.industry, null);
    assert.equal(bare.region, null);
    assert.equal(bare.segmentCode, null);
    assert.equal(bare.ownerSub, null);
    assert.equal(bare.healthScore, null);
    // `tier` defaults in the mapper, not in the column, so an absent value has
    // to arrive as "standard" rather than undefined.
    assert.equal(bare.tier, "standard");

    const full = rows.find((r) => r.name === "Prisma Account Store");
    assert.ok(full);
    assert.equal(full.industry, "logistics");
    assert.equal(full.healthScore, 61);
    assert.equal(full.tier, "strategic");
    assert.equal(typeof full.healthScore, "number", "a smallint must not arrive as a string");
  } finally {
    await cleanup();
  }
});
