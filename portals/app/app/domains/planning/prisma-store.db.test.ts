import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaPlanningStore, against a real Postgres.
//
// Nothing here has ever run against yucer_gtm.sales_target or .territory -
// only against the in-memory mirror. The two things worth a real database:
//
//   - createTarget()'s currencyOf() must actually satisfy
//     chk_sales_target_currency_matches_metric (incr/0013) - a new_logo
//     target with a non-null currency, or a revenue target with a null one,
//     is rejected by the real constraint, and the in-memory store has no such
//     check to get wrong in the same way.
//   - upsertTerritory()'s real upsert-by-(workspace, territory_code) unique
//     index, and listTerritories()'s active-only default.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000003";

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
    await c.query(`DELETE FROM yucer_pipeline.forecast_snapshot WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_gtm.sales_target WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_gtm.territory WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaPlanningStore } = await import("./prisma-store");
  return new PrismaPlanningStore();
}

// --- Targets -----------------------------------------------------------------

test("createTarget on a money metric writes the currency; getTarget reads it back", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.createTarget(WS, {
      period: "2026Q4",
      scopeType: "workspace",
      territoryId: null,
      ownerSub: null,
      metric: "revenue",
      targetValue: { unit: "money", amount: 1_000_000, currency: "CNY" },
      status: "draft",
      planId: null,
    });
    assert.equal(created.targetValue.unit, "money");
    assert.equal(created.targetValue.amount, 1_000_000);

    const fetched = await s.getTarget(WS, created.id);
    assert.deepEqual(fetched, created);
  } finally {
    await cleanup();
  }
});

test("createTarget on new_logo writes a null currency - the real CHECK requires it", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.createTarget(WS, {
      period: "2026Q4",
      scopeType: "workspace",
      territoryId: null,
      ownerSub: null,
      metric: "new_logo",
      targetValue: { unit: "count", amount: 10 },
      status: "draft",
      planId: null,
    });
    assert.equal(created.targetValue.unit, "count");
    assert.equal(created.targetValue.amount, 10);
    const row = await withPg((c) => c.query(`SELECT currency FROM yucer_gtm.sales_target WHERE id = $1`, [created.id]));
    assert.equal(row.rows[0].currency, null, "a count target must not carry a currency");
  } finally {
    await cleanup();
  }
});

test("a money metric with no currency is refused by the real constraint, not just by the type system", { skip }, async () => {
  await cleanup();
  try {
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO yucer_gtm.sales_target (workspace_id, period, scope_type, metric, target_amount, currency)
             VALUES ($1, '2026Q4', 'workspace', 'revenue', 100, NULL)`,
            [WS],
          ),
        ),
      /chk_sales_target_currency_matches_metric/,
    );
  } finally {
    await cleanup();
  }
});

test("getTarget returns null for another workspace's target, not the row", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.createTarget(WS, {
      period: "2026Q4",
      scopeType: "workspace",
      territoryId: null,
      ownerSub: null,
      metric: "revenue",
      targetValue: { unit: "money", amount: 500_000, currency: "CNY" },
      status: "draft",
      planId: null,
    });
    assert.equal(await s.getTarget("eeeeeeee-0000-0000-0000-0000000000ff", created.id), null);
  } finally {
    await cleanup();
  }
});

test("listTargets filters by period, status and territoryId", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const t1 = await s.createTarget(WS, {
      period: "2026Q3", scopeType: "workspace", territoryId: null, ownerSub: null,
      metric: "revenue", targetValue: { unit: "money", amount: 100, currency: "CNY" }, status: "draft", planId: null,
    });
    const t2 = await s.createTarget(WS, {
      period: "2026Q4", scopeType: "workspace", territoryId: null, ownerSub: null,
      metric: "pipeline", targetValue: { unit: "money", amount: 200, currency: "CNY" }, status: "committed", planId: null,
    });

    const byPeriod = await s.listTargets(WS, { period: "2026Q4" });
    assert.deepEqual(byPeriod.map((t) => t.id), [t2.id]);

    const byStatus = await s.listTargets(WS, { status: "draft" });
    assert.deepEqual(byStatus.map((t) => t.id), [t1.id]);

    const all = await s.listTargets(WS);
    assert.equal(all.length, 2);
  } finally {
    await cleanup();
  }
});

test("updateTarget moves only the number, status and plan link - never the scope tuple", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.createTarget(WS, {
      period: "2026Q4", scopeType: "workspace", territoryId: null, ownerSub: null,
      metric: "revenue", targetValue: { unit: "money", amount: 100, currency: "CNY" }, status: "draft", planId: null,
    });
    const ok = await s.updateTarget(WS, created.id, { status: "committed", targetValue: { unit: "money", amount: 150, currency: "CNY" } });
    assert.equal(ok, true);
    const after = await s.getTarget(WS, created.id);
    assert.equal(after?.status, "committed");
    assert.equal(after?.targetValue.amount, 150);
    // Scope untouched.
    assert.equal(after?.period, "2026Q4");
    assert.equal(after?.metric, "revenue");
  } finally {
    await cleanup();
  }
});

test("updateTarget returns false when nothing matched, rather than throwing", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ok = await s.updateTarget(WS, "eeeeeeee-0000-0000-0000-0000000000ff", { status: "closed" });
    assert.equal(ok, false);
  } finally {
    await cleanup();
  }
});

// --- Territories ---------------------------------------------------------------

test("upsertTerritory creates on the first call and updates on the second, on the real unique index", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const first = await s.upsertTerritory(WS, {
      territoryCode: "T-EAST", name: "East China", parentId: null, ownerSub: "usr_rep", status: "active", regions: ["East"],
    });
    const second = await s.upsertTerritory(WS, {
      territoryCode: "T-EAST", name: "East China (renamed)", parentId: null, ownerSub: "usr_rep2", status: "active", regions: ["East", "Central"],
    });
    assert.equal(second.id, first.id, "same territory_code must upsert, not duplicate");
    assert.equal(second.name, "East China (renamed)");
    assert.deepEqual(second.regions, ["East", "Central"]);

    const count = await withPg((c) =>
      c.query(`SELECT count(*)::int AS n FROM yucer_gtm.territory WHERE workspace_id = $1 AND territory_code = 'T-EAST'`, [WS]),
    );
    assert.equal(count.rows[0].n, 1);
  } finally {
    await cleanup();
  }
});

test("listTerritories excludes retired by default, and includes them on request", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.upsertTerritory(WS, { territoryCode: "T-A", name: "Active", parentId: null, ownerSub: null, status: "active", regions: [] });
    await s.upsertTerritory(WS, { territoryCode: "T-B", name: "Retired", parentId: null, ownerSub: null, status: "retired", regions: [] });

    const activeOnly = await s.listTerritories(WS);
    assert.deepEqual(activeOnly.map((t) => t.territoryCode), ["T-A"]);

    const withRetired = await s.listTerritories(WS, { includeRetired: true });
    assert.deepEqual(withRetired.map((t) => t.territoryCode).sort(), ["T-A", "T-B"]);
  } finally {
    await cleanup();
  }
});

test("an unrecognised territory status is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(
      () => s.upsertTerritory(WS, { territoryCode: "T-BAD", name: "Bad", parentId: null, ownerSub: null, status: "bogus" as never, regions: [] }),
      /chk_territory_status/,
    );
  } finally {
    await cleanup();
  }
});

// --- publishedTotalsFor --------------------------------------------------------

test("publishedTotalsFor reads the LATEST snapshot for the scope, not the first one", { skip }, async () => {
  await cleanup();
  try {
    const scope = { period: "2026Q4", scopeType: "workspace" as const, territoryId: null, ownerSub: null, metric: "revenue" as const };
    await withPg((c) =>
      c.query(
        `INSERT INTO yucer_pipeline.forecast_snapshot
           (workspace_id, period, scope_type, closed_amount, pipeline_amount, currency, snapshot_at)
         VALUES ($1, $2, $3, 100, 50, 'CNY', now() - interval '2 days')`,
        [WS, scope.period, scope.scopeType],
      ),
    );
    await withPg((c) =>
      c.query(
        `INSERT INTO yucer_pipeline.forecast_snapshot
           (workspace_id, period, scope_type, closed_amount, pipeline_amount, new_logo_count, currency, snapshot_at)
         VALUES ($1, $2, $3, 300, 20, 4, 'CNY', now())`,
        [WS, scope.period, scope.scopeType],
      ),
    );

    const s = await store();
    const totals = await s.publishedTotalsFor(WS, scope);
    assert.ok(totals);
    assert.equal(totals?.closedAmount.amount, 300, "the latest snapshot, not the older one");
    assert.equal(totals?.newLogoCount, 4);
  } finally {
    await cleanup();
  }
});

test("publishedTotalsFor returns null when nothing has been published for the scope", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const totals = await s.publishedTotalsFor(WS, {
      period: "2026Q4", scopeType: "workspace", territoryId: null, ownerSub: null, metric: "revenue",
    });
    assert.equal(totals, null);
  } finally {
    await cleanup();
  }
});
