import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaStrategyStore, against a real Postgres.
//
// The last adapter with no db coverage. Two things here are worth a real
// database rather than the in-memory mirror:
//
//   - createPlan()'s findFirst-before-create, which is the store's way of
//     saying "that number is taken" without guessing which constraint fired.
//     Only a real uidx proves the check is actually load-bearing.
//   - attributedOpportunities(), the cross-schema read the product's whole
//     thesis rests on: it answers "what did this campaign produce" from
//     opportunity.campaign_id, frozen at conversion. It is a join over two
//     schemas and cannot exist in an in-memory mirror at all.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-00000000000a";
const ACC = "eeeeeeee-0000-0000-0000-00000000ab01";
const CAMPAIGN = "eeeeeeee-0000-0000-0000-00000000ab02";
const OTHER_CAMPAIGN = "eeeeeeee-0000-0000-0000-00000000ab03";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function seedCampaigns(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_gtm.campaign (id, workspace_id, campaign_no, name, budget_amount, currency, status)
     VALUES ($1, $2, 'CMP-1', 'Spring push', 50000, 'CNY', 'running') ON CONFLICT DO NOTHING`,
    [CAMPAIGN, WS],
  );
  await c.query(
    `INSERT INTO yucer_gtm.campaign (id, workspace_id, campaign_no, name, status)
     VALUES ($1, $2, 'CMP-2', 'Quiet one', 'draft') ON CONFLICT DO NOTHING`,
    [OTHER_CAMPAIGN, WS],
  );
}

async function seedAccount(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-STRAT', 'Strategy Test', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM yucer_pipeline.opportunity WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_gtm.campaign_execution WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_gtm.campaign WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_gtm.market_segment WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_gtm.strategy_plan WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaStrategyStore } = await import("./prisma-store");
  return new PrismaStrategyStore();
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    planNo: "PLAN-1",
    name: "FY26 land and expand",
    period: "2026H1",
    objective: "double the mid-market",
    ownerSub: "usr_lead",
    ...overrides,
  };
}

// --- plans ------------------------------------------------------------------------

test("createPlan always starts a plan in draft, whatever the caller had in mind", { skip }, async () => {
  // The status is not a parameter: every move after draft belongs to the
  // transition verb, which is what stamps approved_at.
  await cleanup();
  try {
    const s = await store();
    const created = await s.createPlan(WS, plan());
    assert.equal(created?.status, "draft");
    assert.equal(created?.approvedAt, null);
    assert.equal(created?.objective, "double the mid-market");
  } finally {
    await cleanup();
  }
});

test("a second plan on a taken plan_no returns null rather than raising", { skip }, async () => {
  // findFirst-before-create, and the real uidx behind it. The service turns
  // this null into "that number is taken"; a caught error would have to guess
  // which constraint fired to say the same thing.
  await cleanup();
  try {
    const s = await store();
    assert.ok(await s.createPlan(WS, plan()));
    assert.equal(await s.createPlan(WS, plan({ name: "different name, same number" })), null);

    const count = await withPg((c) =>
      c.query(`SELECT count(*)::int AS n FROM yucer_gtm.strategy_plan WHERE workspace_id = $1`, [WS]),
    );
    assert.equal(count.rows[0].n, 1);
  } finally {
    await cleanup();
  }
});

test("the same plan_no in another workspace is not taken", { skip }, async () => {
  await cleanup();
  const OTHER = "eeeeeeee-0000-0000-0000-0000000000fe";
  try {
    const s = await store();
    assert.ok(await s.createPlan(WS, plan()));
    assert.ok(await s.createPlan(OTHER, plan()), "plan numbers are per workspace");
  } finally {
    await cleanup();
    await withPg((c) => c.query(`DELETE FROM yucer_gtm.strategy_plan WHERE workspace_id = $1`, [OTHER]));
  }
});

test("getPlan is workspace-scoped, and listPlans filters by period and status", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const a = await s.createPlan(WS, plan({ planNo: "PLAN-1", period: "2026H1" }));
    const b = await s.createPlan(WS, plan({ planNo: "PLAN-2", period: "2026H2" }));
    assert.ok(a && b);
    await s.updatePlan(WS, b!.id, { status: "approved", approvedAt: new Date() });

    assert.equal(await s.getPlan("eeeeeeee-0000-0000-0000-0000000000ff", a!.id), null);
    assert.deepEqual((await s.listPlans(WS, { period: "2026H1" })).map((r) => r.id), [a!.id]);
    assert.deepEqual((await s.listPlans(WS, { status: "approved" })).map((r) => r.id), [b!.id]);
    assert.equal((await s.listPlans(WS)).length, 2);
  } finally {
    await cleanup();
  }
});

test("updatePlan moves the lifecycle and returns false when nothing matched", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.createPlan(WS, plan());
    const at = new Date("2026-09-01T00:00:00Z");
    assert.equal(await s.updatePlan(WS, created!.id, { status: "approved", approvedAt: at }), true);

    const after = await s.getPlan(WS, created!.id);
    assert.equal(after?.status, "approved");
    assert.equal(after?.approvedAt?.toISOString(), at.toISOString());
    assert.equal(after?.planNo, "PLAN-1", "the anchor never moves");

    assert.equal(await s.updatePlan(WS, "eeeeeeee-0000-0000-0000-0000000000ff", { status: "closed" }), false);
  } finally {
    await cleanup();
  }
});

test("updatePlan refuses to write the plan anchor", { skip }, async () => {
  // Unlike applyDecision's fixed whitelist, this patch is spread wholesale into
  // `data`, so the column-lock guard is the thing actually standing in the way.
  await cleanup();
  try {
    const s = await store();
    const created = await s.createPlan(WS, plan());
    await assert.rejects(
      () => s.updatePlan(WS, created!.id, { planNo: "PLAN-RENAMED" } as never),
      /refusing to write locked columns/,
    );
  } finally {
    await cleanup();
  }
});

test("an unrecognised plan status is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const created = await s.createPlan(WS, plan());
    await assert.rejects(
      () => s.updatePlan(WS, created!.id, { status: "bogus" as never }),
      /chk_strategy_plan_status/,
    );
  } finally {
    await cleanup();
  }
});

// --- campaigns ---------------------------------------------------------------------

test("getCampaign reconstructs the budget as Money, and a null budget stays null", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedCampaigns);
    const s = await store();
    const funded = await s.getCampaign(WS, CAMPAIGN);
    assert.equal(funded?.budgetAmount?.amount, 50_000);
    assert.equal(funded?.budgetAmount?.currency, "CNY");
    assert.equal((await s.getCampaign(WS, OTHER_CAMPAIGN))?.budgetAmount, null);
  } finally {
    await cleanup();
  }
});

test("listCampaigns puts dated campaigns first and undated last, never first", { skip }, async () => {
  // `nulls: "last"` on a DESC sort, explicitly: Postgres puts NULLs FIRST on a
  // bare DESC, which would float every undated campaign above the live ones.
  await cleanup();
  try {
    await withPg(async (c) => {
      await seedCampaigns(c);
      await c.query(`UPDATE yucer_gtm.campaign SET starts_at = now() WHERE id = $1`, [CAMPAIGN]);
    });
    const s = await store();
    const all = await s.listCampaigns(WS);
    assert.deepEqual(all.map((r) => r.campaignNo), ["CMP-1", "CMP-2"]);
  } finally {
    await cleanup();
  }
});

test("listCampaigns filters by plan and status", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const p = await s.createPlan(WS, plan());
    await withPg(async (c) => {
      await seedCampaigns(c);
      await c.query(`UPDATE yucer_gtm.campaign SET plan_id = $1 WHERE id = $2`, [p!.id, CAMPAIGN]);
    });
    assert.deepEqual((await s.listCampaigns(WS, { planId: p!.id })).map((r) => r.id), [CAMPAIGN]);
    assert.deepEqual((await s.listCampaigns(WS, { status: "draft" })).map((r) => r.id), [OTHER_CAMPAIGN]);
  } finally {
    await cleanup();
  }
});

test("updateCampaign moves the lifecycle but refuses the campaign anchor", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedCampaigns);
    const s = await store();
    assert.equal(await s.updateCampaign(WS, CAMPAIGN, { status: "completed", name: "Spring push (done)" }), true);
    const after = await s.getCampaign(WS, CAMPAIGN);
    assert.equal(after?.status, "completed");
    assert.equal(after?.campaignNo, "CMP-1");

    await assert.rejects(
      () => s.updateCampaign(WS, CAMPAIGN, { campaignNo: "CMP-RENAMED" } as never),
      /refusing to write locked columns/,
    );
    assert.equal(await s.updateCampaign(WS, "eeeeeeee-0000-0000-0000-0000000000ff", { status: "paused" }), false);
  } finally {
    await cleanup();
  }
});

test("a campaign window that ends before it starts is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedCampaigns);
    const s = await store();
    await assert.rejects(
      () =>
        s.updateCampaign(WS, CAMPAIGN, {
          startsAt: new Date("2026-10-01T00:00:00Z"),
          endsAt: new Date("2026-09-01T00:00:00Z"),
        }),
      /chk_campaign_window/,
    );
  } finally {
    await cleanup();
  }
});

// --- executions ---------------------------------------------------------------------

function execution(overrides: Record<string, unknown> = {}) {
  return {
    title: "Call the top 20",
    actionType: "outreach" as const,
    assigneeSub: "usr_rep",
    dueAt: new Date("2026-09-20T00:00:00Z"),
    status: "pending" as const,
    ...overrides,
  };
}

test("upsertExecution creates without an id and edits in place with one", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedCampaigns);
    const s = await store();
    const created = await s.upsertExecution(WS, CAMPAIGN, execution());
    assert.ok(created);
    assert.equal(created!.status, "pending");

    const edited = await s.upsertExecution(WS, CAMPAIGN, execution({ id: created!.id, status: "done" }));
    assert.equal(edited!.id, created!.id, "an id edits that row rather than adding one");
    assert.equal(edited!.status, "done");
    assert.equal((await s.listExecutions(WS, CAMPAIGN)).length, 1);
  } finally {
    await cleanup();
  }
});

test("an execution id from another campaign updates nothing and returns null", { skip }, async () => {
  // The campaign is in the predicate as well as the workspace: the completion
  // rule counts what is on ITS campaign, so an item must not be able to move
  // between campaigns by way of an id.
  await cleanup();
  try {
    await withPg(seedCampaigns);
    const s = await store();
    const mine = await s.upsertExecution(WS, CAMPAIGN, execution());
    const moved = await s.upsertExecution(WS, OTHER_CAMPAIGN, execution({ id: mine!.id, title: "stolen" }));
    assert.equal(moved, null);

    const still = await s.listExecutions(WS, CAMPAIGN);
    assert.equal(still.length, 1);
    assert.equal(still[0].title, "Call the top 20", "the original must be untouched");
    assert.deepEqual(await s.listExecutions(WS, OTHER_CAMPAIGN), []);
  } finally {
    await cleanup();
  }
});

test("listExecutions orders by due date", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedCampaigns);
    const s = await store();
    await s.upsertExecution(WS, CAMPAIGN, execution({ title: "Later", dueAt: new Date("2026-10-01T00:00:00Z") }));
    await s.upsertExecution(WS, CAMPAIGN, execution({ title: "Sooner", dueAt: new Date("2026-09-01T00:00:00Z") }));
    assert.deepEqual((await s.listExecutions(WS, CAMPAIGN)).map((r) => r.title), ["Sooner", "Later"]);
  } finally {
    await cleanup();
  }
});

test("an unrecognised execution action type is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedCampaigns);
    const s = await store();
    await assert.rejects(
      () => s.upsertExecution(WS, CAMPAIGN, execution({ actionType: "telepathy" as never })),
      /chk_campaign_execution_action/,
    );
  } finally {
    await cleanup();
  }
});

// --- segments -------------------------------------------------------------------------

test("upsertSegment upserts on the segment code and round-trips its criteria", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const first = await s.upsertSegment(WS, {
      segmentCode: "SEG-MM",
      name: "Mid-market",
      planId: null,
      priority: 1,
      status: "active",
      criteria: { industries: ["manufacturing"], regions: ["East"] },
    });
    const second = await s.upsertSegment(WS, {
      segmentCode: "SEG-MM",
      name: "Mid-market (revised)",
      planId: null,
      priority: 2,
      status: "active",
      criteria: { industries: ["manufacturing", "logistics"], regions: [] },
    });
    assert.equal(second.id, first.id, "the anchor upserts, it does not duplicate");
    assert.deepEqual(second.criteria.industries, ["manufacturing", "logistics"]);
    assert.deepEqual(second.criteria.regions, [], "the old regions are replaced, not merged");
  } finally {
    await cleanup();
  }
});

test("a segment row with no criteria at all reads as no filters, not a crash", { skip }, async () => {
  // Tolerant of pre-criteria rows: `{}` means the segment filters on nothing.
  await cleanup();
  try {
    await withPg((c) =>
      c.query(
        `INSERT INTO yucer_gtm.market_segment (workspace_id, segment_code, name, priority, status)
         VALUES ($1, 'SEG-OLD', 'Legacy', 0, 'active')`,
        [WS],
      ),
    );
    const s = await store();
    const [seg] = await s.listSegments(WS);
    assert.deepEqual(seg.criteria, { industries: [], regions: [] });
  } finally {
    await cleanup();
  }
});

test("listSegments orders by priority, then by code", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const base = { planId: null, status: "active" as const, criteria: { industries: [], regions: [] } };
    await s.upsertSegment(WS, { ...base, segmentCode: "SEG-B", name: "B", priority: 2 });
    await s.upsertSegment(WS, { ...base, segmentCode: "SEG-A", name: "A", priority: 1 });
    assert.deepEqual((await s.listSegments(WS)).map((r) => r.segmentCode), ["SEG-A", "SEG-B"]);
  } finally {
    await cleanup();
  }
});

test("an unrecognised segment status is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(
      () =>
        s.upsertSegment(WS, {
          segmentCode: "SEG-BAD",
          name: "Bad",
          planId: null,
          priority: 0,
          status: "bogus" as never,
          criteria: { industries: [], regions: [] },
        }),
      /chk_market_segment_status/,
    );
  } finally {
    await cleanup();
  }
});

// --- attribution ------------------------------------------------------------------------

async function seedOpportunity(c: Client, no: string, fields: Record<string, unknown> = {}) {
  const f = { campaign: CAMPAIGN, amount: 100000, status: "open", deleted: false, ...fields };
  await c.query(
    `INSERT INTO yucer_pipeline.opportunity
       (workspace_id, opportunity_no, name, account_id, campaign_id, amount, currency, status, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'CNY', $7, ${f.deleted ? "now()" : "NULL"})`,
    [WS, no, `Deal ${no}`, ACC, f.campaign, f.amount, f.status],
  );
}

test("attributedOpportunities reads the campaign link frozen on the deal", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seedAccount(c);
      await seedCampaigns(c);
      await seedOpportunity(c, "OPP-1");
      await seedOpportunity(c, "OPP-2", { amount: null });
      await seedOpportunity(c, "OPP-OTHER", { campaign: OTHER_CAMPAIGN });
    });
    const s = await store();
    const attributed = await s.attributedOpportunities(WS, CAMPAIGN);
    assert.equal(attributed.length, 2, "only the deals carrying THIS campaign");
    const amounts = attributed.map((o) => o.amount?.amount ?? null).sort();
    assert.deepEqual(amounts, [100_000, null]);
  } finally {
    await cleanup();
  }
});

test("a soft-deleted deal does not count towards what a campaign produced", { skip }, async () => {
  // A deleted deal did not happen, and counting it would inflate the return.
  await cleanup();
  try {
    await withPg(async (c) => {
      await seedAccount(c);
      await seedCampaigns(c);
      await seedOpportunity(c, "OPP-LIVE");
      await seedOpportunity(c, "OPP-GONE", { deleted: true });
    });
    const s = await store();
    const attributed = await s.attributedOpportunities(WS, CAMPAIGN);
    assert.equal(attributed.length, 1);
  } finally {
    await cleanup();
  }
});

test("attributedOpportunities returns nothing for a campaign that produced nothing", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seedCampaigns);
    const s = await store();
    assert.deepEqual(await s.attributedOpportunities(WS, OTHER_CAMPAIGN), []);
  } finally {
    await cleanup();
  }
});
