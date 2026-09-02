import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaPipelineStore, against a real Postgres.
//
// The two things worth a database that no in-memory mirror can get wrong the
// same way: createOpportunity()'s advisory-lock opportunity_no allocation
// (concurrent creates must never collide on uidx_opportunity_ws_no), and
// applyStageChange()'s single transaction across the opportunity row and its
// append-only journal entry.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000006";
const ACC = "eeeeeeee-0000-0000-0000-0000000000c1";

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
     VALUES ($1, $2, 'ACC-PIPE', 'Pipeline Test', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
}

async function seedProject(c: Client, id: string): Promise<void> {
  await c.query(
    `INSERT INTO yucer_delivery.project (id, workspace_id, project_no, name, account_id, status)
     VALUES ($1, $2, 'PRJ-PIPE', 'Renewal Source', $3, 'active') ON CONFLICT DO NOTHING`,
    [id, WS, ACC],
  );
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM yucer_pipeline.win_loss_review WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_pipeline.opportunity_stage_event WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_pipeline.forecast_snapshot WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_pipeline.opportunity WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_delivery.project WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaPipelineStore } = await import("./prisma-store");
  return new PrismaPipelineStore();
}

function newOpp(overrides: Record<string, unknown> = {}) {
  return {
    name: "Deal",
    accountId: ACC,
    campaignId: null,
    planId: null,
    territoryId: null,
    ownerSub: null,
    amount: { amount: 100_000, currency: "CNY" },
    currency: "CNY",
    expectedCloseAt: null,
    ...overrides,
  };
}

// --- createOpportunity -----------------------------------------------------------

test("createOpportunity allocates a sequential opportunity_no under the advisory lock", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const first = await s.createOpportunity(WS, newOpp());
    const second = await s.createOpportunity(WS, newOpp({ name: "Deal 2" }));
    assert.equal(first.opportunityNo, "OPP-00001");
    assert.equal(second.opportunityNo, "OPP-00002");
    assert.equal(first.stage, "qualify");
    assert.ok(first.probability !== null);
  } finally {
    await cleanup();
  }
});

test("createOpportunity with no amount leaves amount null, not zero", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createOpportunity(WS, newOpp({ amount: null }));
    assert.equal(created.amount, null);
  } finally {
    await cleanup();
  }
});

test("an unrecognised stage is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO yucer_pipeline.opportunity (workspace_id, opportunity_no, name, account_id, stage)
             VALUES ($1, 'OPP-BAD', 'Bad', $2, 'bogus')`,
            [WS, ACC],
          ),
        ),
      /chk_opportunity_stage/,
    );
  } finally {
    await cleanup();
  }
});

// --- listOpportunities / getOpportunity -------------------------------------------

test("listOpportunities excludes closed deals by default and includes them on request", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const open = await s.createOpportunity(WS, newOpp({ name: "Open" }));
    const closed = await s.createOpportunity(WS, newOpp({ name: "Closed" }));
    await withPg((c) => c.query(`UPDATE yucer_pipeline.opportunity SET status = 'won' WHERE id = $1`, [closed.id]));

    const defaultList = await s.listOpportunities(WS);
    assert.deepEqual(defaultList.map((o) => o.id), [open.id]);

    const withClosed = await s.listOpportunities(WS, { includeClosed: true });
    assert.equal(withClosed.length, 2);
  } finally {
    await cleanup();
  }
});

test("listOpportunities never returns a soft-deleted row, even with includeClosed", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createOpportunity(WS, newOpp());
    await withPg((c) => c.query(`UPDATE yucer_pipeline.opportunity SET deleted_at = now() WHERE id = $1`, [created.id]));
    const list = await s.listOpportunities(WS, { includeClosed: true });
    assert.deepEqual(list, []);
  } finally {
    await cleanup();
  }
});

test("getOpportunity scopes by workspace in the query, not after the fetch", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createOpportunity(WS, newOpp());
    assert.equal(await s.getOpportunity("eeeeeeee-0000-0000-0000-0000000000ff", created.id), null);
    assert.ok(await s.getOpportunity(WS, created.id));
  } finally {
    await cleanup();
  }
});

// --- applyStageChange --------------------------------------------------------------

test("applyStageChange writes the column patch and the journal row in the same transaction", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createOpportunity(WS, newOpp());
    const ok = await s.applyStageChange(WS, created.id, {
      event: { fromStage: "qualify", toStage: "discover", reason: "qualified", actorSub: "usr_rep", occurredAt: new Date() },
      patch: { stage: "discover", status: "open", closedAt: null, probability: 30 },
      requiresWinLossReview: false,
    });
    assert.equal(ok, true);

    const after = await s.getOpportunity(WS, created.id);
    assert.equal(after?.stage, "discover");
    assert.equal(after?.probability, 30);

    const events = await s.listStageEvents(WS, created.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].toStage, "discover");
  } finally {
    await cleanup();
  }
});

test("applyStageChange returns false and writes no journal row when the opportunity does not match", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ok = await s.applyStageChange(WS, "eeeeeeee-0000-0000-0000-0000000000ff", {
      event: { fromStage: "qualify", toStage: "discover", reason: null, actorSub: null, occurredAt: new Date() },
      patch: { stage: "discover", status: "open", closedAt: null },
      requiresWinLossReview: false,
    });
    assert.equal(ok, false);
    const count = await withPg((c) => c.query(`SELECT count(*)::int AS n FROM yucer_pipeline.opportunity_stage_event WHERE workspace_id = $1`, [WS]));
    assert.equal(count.rows[0].n, 0);
  } finally {
    await cleanup();
  }
});

test("a stage_event whose from_stage equals to_stage is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createOpportunity(WS, newOpp());
    await assert.rejects(
      () =>
        withPg((c) =>
          c.query(
            `INSERT INTO yucer_pipeline.opportunity_stage_event (workspace_id, opportunity_id, from_stage, to_stage)
             VALUES ($1, $2, 'qualify', 'qualify')`,
            [WS, created.id],
          ),
        ),
      /chk_opportunity_stage_event_move/,
    );
  } finally {
    await cleanup();
  }
});

// --- updateCommercialTerms -----------------------------------------------------------

test("updateCommercialTerms writes amount and currency together, and null amount is legal", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createOpportunity(WS, newOpp());
    const ok = await s.updateCommercialTerms(WS, created.id, { amount: { amount: 250_000, currency: "USD" } });
    assert.equal(ok, true);
    let after = await s.getOpportunity(WS, created.id);
    assert.equal(after?.amount?.amount, 250_000);
    assert.equal(after?.amount?.currency, "USD");

    await s.updateCommercialTerms(WS, created.id, { amount: null });
    after = await s.getOpportunity(WS, created.id);
    assert.equal(after?.amount, null);
  } finally {
    await cleanup();
  }
});

test("updateCommercialTerms leaves an omitted field untouched, unlike an explicit null", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createOpportunity(WS, newOpp({ expectedCloseAt: new Date("2026-12-01T00:00:00Z") }));
    await s.updateCommercialTerms(WS, created.id, { probability: 60 });
    const after = await s.getOpportunity(WS, created.id);
    assert.equal(after?.probability, 60);
    assert.equal(after?.expectedCloseAt?.toISOString(), new Date("2026-12-01T00:00:00Z").toISOString());
  } finally {
    await cleanup();
  }
});

// --- latestStageChangeAt / listRenewalSourceProjectIds ------------------------------

test("latestStageChangeAt groups by opportunity and takes the max, in one query for the workspace", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createOpportunity(WS, newOpp());
    await s.applyStageChange(WS, created.id, {
      event: { fromStage: "qualify", toStage: "discover", reason: null, actorSub: null, occurredAt: new Date("2026-09-01T00:00:00Z") },
      patch: { stage: "discover", status: "open", closedAt: null },
      requiresWinLossReview: false,
    });
    await s.applyStageChange(WS, created.id, {
      event: { fromStage: "discover", toStage: "validate", reason: null, actorSub: null, occurredAt: new Date("2026-09-05T00:00:00Z") },
      patch: { stage: "validate", status: "open", closedAt: null },
      requiresWinLossReview: false,
    });
    const map = await s.latestStageChangeAt(WS);
    assert.equal(map.get(created.id)?.toISOString(), new Date("2026-09-05T00:00:00Z").toISOString());
  } finally {
    await cleanup();
  }
});

test("listRenewalSourceProjectIds returns a renewal even if it was lost, and distincts by project", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const proj = "eeeeeeee-0000-0000-0000-0000000000d1";
    await withPg((c) => seedProject(c, proj));
    const created = await s.createOpportunity(WS, newOpp({ sourceProjectId: proj }));
    await withPg((c) => c.query(`UPDATE yucer_pipeline.opportunity SET status = 'lost' WHERE id = $1`, [created.id]));
    const ids = await s.listRenewalSourceProjectIds(WS);
    assert.deepEqual([...ids], [proj]);
  } finally {
    await cleanup();
  }
});

// --- forecast snapshots -----------------------------------------------------------

test("appendForecastSnapshot always creates a new row, never updates an existing one", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const row = {
      period: "2026Q4", scopeType: "workspace" as const, territoryId: null, ownerSub: null,
      commitAmount: { amount: 100, currency: "CNY" }, bestCaseAmount: { amount: 150, currency: "CNY" },
      pipelineAmount: { amount: 300, currency: "CNY" }, closedAmount: { amount: 50, currency: "CNY" },
      newLogoCount: 2, currency: "CNY", snapshotAt: new Date("2026-09-01T00:00:00Z"),
    };
    await s.appendForecastSnapshot(WS, row);
    await s.appendForecastSnapshot(WS, { ...row, snapshotAt: new Date("2026-09-02T00:00:00Z") });
    const list = await s.listForecastSnapshots(WS, { period: "2026Q4" });
    assert.equal(list.length, 2);
  } finally {
    await cleanup();
  }
});

test("a negative snapshot amount is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(
      () =>
        s.appendForecastSnapshot(WS, {
          period: "2026Q4", scopeType: "workspace", territoryId: null, ownerSub: null,
          commitAmount: { amount: -1, currency: "CNY" }, bestCaseAmount: { amount: 0, currency: "CNY" },
          pipelineAmount: { amount: 0, currency: "CNY" }, closedAmount: { amount: 0, currency: "CNY" },
          newLogoCount: null, currency: "CNY", snapshotAt: new Date(),
        }),
      /chk_forecast_snapshot_amounts/,
    );
  } finally {
    await cleanup();
  }
});

// --- win/loss review ----------------------------------------------------------------

test("saveWinLossReview creates on the first call and revises in place on the second", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createOpportunity(WS, newOpp());
    const first = await s.saveWinLossReview(WS, created.id, {
      outcome: "lost", primaryReason: "price", reviewerSub: "usr_mgr",
    });
    assert.equal(first.outcome, "lost");

    const revised = await s.saveWinLossReview(WS, created.id, {
      outcome: "lost", primaryReason: "competitor", competitor: "Acme", reviewerSub: "usr_mgr",
    });
    assert.equal(revised.id, first.id, "one review per opportunity - the second call must revise, not duplicate");
    assert.equal(revised.primaryReason, "competitor");

    const count = await withPg((c) => c.query(`SELECT count(*)::int AS n FROM yucer_pipeline.win_loss_review WHERE opportunity_id = $1`, [created.id]));
    assert.equal(count.rows[0].n, 1);
  } finally {
    await cleanup();
  }
});

test("listUnreviewedClosed excludes a closed deal once it has a review", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const won = await s.createOpportunity(WS, newOpp({ name: "Won" }));
    const lost = await s.createOpportunity(WS, newOpp({ name: "Lost" }));
    await withPg((c) => c.query(`UPDATE yucer_pipeline.opportunity SET status = 'won', closed_at = now() WHERE id = $1`, [won.id]));
    await withPg((c) => c.query(`UPDATE yucer_pipeline.opportunity SET status = 'lost', closed_at = now() WHERE id = $1`, [lost.id]));

    let unreviewed = await s.listUnreviewedClosed(WS);
    assert.equal(unreviewed.length, 2);

    await s.saveWinLossReview(WS, won.id, { outcome: "won", primaryReason: null, reviewerSub: "usr_mgr" });
    unreviewed = await s.listUnreviewedClosed(WS);
    assert.deepEqual(unreviewed.map((o) => o.id), [lost.id]);
  } finally {
    await cleanup();
  }
});
