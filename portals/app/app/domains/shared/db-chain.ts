import type { Client } from "pg";

// One complete business chain, in a real database.
//
// WHY A FIXTURE RATHER THAN PER-TEST INSERTS. The measurement that produced this
// file: 34 product tables, and only 20 had ever been touched by a test running
// against Postgres. The untouched 14 were not a random sample - they were the
// whole pricing/approval chain, the whole delivery-to-revenue end, the planning
// head, and the agent's own newest tables. Every one of them was reachable only
// through a foreign key from something else, which is precisely why nobody
// tested them: setting one up meant setting up six.
//
// So this seeds the chain ONCE, end to end, and the tests read and probe it:
//
//   strategy_plan -> market_segment -> territory -> sales_target
//   campaign -> account -> account_plan -> opportunity
//   product -> price_book_entry -> solution -> solution_item
//   opportunity_line -> line_discount_approval
//   project -> project_milestone -> revenue_schedule -> renewal opportunity
//   agent_session -> agent_playbook -> agent_autonomy -> judgement_snooze
//
// `signal` and `lead` are deliberately absent: they already have real-database
// coverage (adapters.db.test.ts probes the signal dedup index), and a fixture
// that re-seeds what is already tested adds rows nobody reads. This one covers
// what nothing covered.
//
// FIXED UUIDS, not generated. A test that fails should name the row it failed
// on, and `opp_line` reading back as a literal this file also contains is worth
// more than a uuid nobody can grep for. They live in one place so a cascade
// delete can clear the whole chain by workspace.
//
// THE BASELINE IS NOT THE SCHEMA. Every column shape here was read from
// 00_baseline.sql AND from the increments that alter the table - `deploy/
// database/ddl/incr/*.sql` carries ten ALTER TABLE files, and one of them
// (0013) drops a DEFAULT the baseline still shows. Reading only the baseline is
// reading a document about the schema rather than the schema.
//
// SUPERUSER INSERTS. CI connects as `postgres`, which bypasses grants - so
// seeding here proves nothing about privileges. That is deliberate: the grant
// tests do their own `SET ROLE yucer_svc` against these rows, which is the only
// way to fire live at 98_column_locks.sql. Seeding as the service role instead
// would make the fixture itself fail on the frozen columns it exists to test.

/** The one workspace this fixture owns. Everything cleans up by it. */
export const CHAIN_WS = "22222222-2222-2222-2222-222222222222";

/** A second workspace, for the isolation probes. Never populated. */
export const OTHER_WS = "33333333-3333-3333-3333-333333333333";

const id = (n: string) => `44444444-4444-4444-4444-4444444444${n}`;

export const CHAIN = {
  plan: id("01"),
  segment: id("02"),
  territory: id("03"),
  target: id("04"),
  campaign: id("05"),
  account: id("06"),
  accountPlan: id("07"),
  opportunity: id("08"),
  product: id("09"),
  productStatus: id("22"),
  priceEntry: id("10"),
  solution: id("11"),
  solutionItem: id("12"),
  line: id("13"),
  approval: id("14"),
  project: id("15"),
  milestone: id("16"),
  revenue: id("17"),
  renewal: id("18"),
  session: id("19"),
  playbook: id("20"),
  snooze: id("21"),
} as const;

/**
 * Wipe anything this fixture may have left, in FK order.
 *
 * Runs before seeding as well as after, because a killed test run leaves rows
 * behind and the next run's INSERT would then trip a unique index rather than
 * the constraint it meant to test - a failure that names the wrong cause.
 */
export async function clearChain(c: Client): Promise<void> {
  for (const sql of [
    `DELETE FROM yucer_agent.judgement_snooze WHERE workspace_id = $1`,
    `DELETE FROM yucer_agent.agent_playbook WHERE workspace_id = $1`,
    `DELETE FROM yucer_agent.agent_autonomy WHERE workspace_id = $1`,
    `DELETE FROM yucer_agent.agent_message WHERE workspace_id = $1`,
    `DELETE FROM yucer_agent.agent_session WHERE workspace_id = $1`,
    `DELETE FROM yucer_delivery.revenue_schedule WHERE workspace_id = $1`,
    `DELETE FROM yucer_delivery.project_milestone WHERE workspace_id = $1`,
    `DELETE FROM yucer_delivery.project WHERE workspace_id = $1`,
    `DELETE FROM yucer_pipeline.line_discount_approval WHERE workspace_id = $1`,
    `DELETE FROM yucer_pipeline.opportunity_line WHERE workspace_id = $1`,
    `DELETE FROM yucer_catalog.solution_item WHERE workspace_id = $1`,
    `DELETE FROM yucer_catalog.solution WHERE workspace_id = $1`,
    `DELETE FROM yucer_catalog.price_book_entry WHERE workspace_id = $1`,
    `DELETE FROM yucer_catalog.product WHERE workspace_id = $1`,
    `DELETE FROM yucer_catalog.product_status WHERE workspace_id = $1`,
    `DELETE FROM yucer_catalog.product_type WHERE workspace_id = $1`,
    `DELETE FROM yucer_pipeline.opportunity WHERE workspace_id = $1`,
    `DELETE FROM yucer_core.account_plan WHERE workspace_id = $1`,
    `DELETE FROM yucer_core.account WHERE workspace_id = $1`,
    `DELETE FROM yucer_gtm.sales_target WHERE workspace_id = $1`,
    `DELETE FROM yucer_gtm.campaign WHERE workspace_id = $1`,
    `DELETE FROM yucer_gtm.territory WHERE workspace_id = $1`,
    `DELETE FROM yucer_gtm.market_segment WHERE workspace_id = $1`,
    `DELETE FROM yucer_gtm.strategy_plan WHERE workspace_id = $1`,
  ]) {
    for (const ws of [CHAIN_WS, OTHER_WS]) await c.query(sql, [ws]);
  }
}

/**
 * Seed the whole chain. Idempotent by way of clearChain.
 *
 * THE AMOUNTS AGREE WITH EACH OTHER on purpose. One line of 4 x 250,000 makes
 * 1,000,000, which is the opportunity's amount, the project's contract amount,
 * and the two revenue instalments summed. ADR-014's rule is that the lines are
 * authoritative and the header equals their sum; a fixture whose numbers do not
 * add up cannot be used to test it, and would quietly teach the wrong shape to
 * whoever reads it next.
 */
export async function seedChain(c: Client): Promise<void> {
  await clearChain(c);

  await c.query(
    `INSERT INTO yucer_gtm.strategy_plan (id, workspace_id, plan_no, name, period, status)
     VALUES ($1, $2, 'PLAN-DB-1', 'chain fixture plan', '2026Q3', 'active')`,
    [CHAIN.plan, CHAIN_WS],
  );
  await c.query(
    `INSERT INTO yucer_gtm.market_segment (id, workspace_id, segment_code, name)
     VALUES ($1, $2, 'SEG-DB-1', 'chain fixture segment')`,
    [CHAIN.segment, CHAIN_WS],
  );
  await c.query(
    `INSERT INTO yucer_gtm.territory (id, workspace_id, territory_code, name)
     VALUES ($1, $2, 'TERR-DB-1', 'chain fixture territory')`,
    [CHAIN.territory, CHAIN_WS],
  );
  await c.query(
    // CURRENCY IS EXPLICIT, and it has to be. The baseline declares
    // `currency VARCHAR(8) NOT NULL DEFAULT 'CNY'`, but incr/0013 DROPPED that
    // default and added chk_sales_target_currency_matches_metric: a money
    // metric needs a currency, a `new_logo` count must have none. Omitting it
    // here inserted NULL against metric 'revenue' and the constraint refused
    // the row - which is exactly the class of defect this lane exists to catch,
    // and it caught it on the first run.
    `INSERT INTO yucer_gtm.sales_target
       (id, workspace_id, plan_id, period, scope_type, territory_id, metric, target_amount, currency)
     VALUES ($1, $2, $3, '2026Q3', 'territory', $4, 'revenue', 5000000, 'CNY')`,
    [CHAIN.target, CHAIN_WS, CHAIN.plan, CHAIN.territory],
  );
  await c.query(
    `INSERT INTO yucer_gtm.campaign (id, workspace_id, campaign_no, name, plan_id, segment_id, status)
     VALUES ($1, $2, 'CAMP-DB-1', 'chain fixture campaign', $3, $4, 'running')`,
    [CHAIN.campaign, CHAIN_WS, CHAIN.plan, CHAIN.segment],
  );

  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-DB-1', 'chain fixture account', 'active')`,
    [CHAIN.account, CHAIN_WS],
  );
  await c.query(
    `INSERT INTO yucer_core.account_plan (id, workspace_id, account_id, period, target_amount)
     VALUES ($1, $2, $3, '2026Q3', 2000000)`,
    [CHAIN.accountPlan, CHAIN_WS, CHAIN.account],
  );

  await c.query(
    `INSERT INTO yucer_pipeline.opportunity
       (id, workspace_id, opportunity_no, name, account_id, campaign_id, territory_id,
        stage, forecast_category, amount, currency, status)
     VALUES ($1, $2, 'OPP-DB-1', 'chain fixture deal', $3, $4, $5,
             'propose', 'commit', 1000000, 'CNY', 'open')`,
    [CHAIN.opportunity, CHAIN_WS, CHAIN.account, CHAIN.campaign, CHAIN.territory],
  );

  // 0029: products join the status vocabulary by uuid, so the row must exist
  // before any product does - same order the service's lazy seeding enforces.
  await c.query(
    `INSERT INTO yucer_catalog.product_status (id, workspace_id, status_code, name, description)
     VALUES ($1, $2, 'active', '在售', 'chain fixture status')`,
    [CHAIN.productStatus, CHAIN_WS],
  );
  await c.query(
    `INSERT INTO yucer_catalog.product (id, workspace_id, product_code, name, unit, status_id)
     VALUES ($1, $2, 'PROD-DB-1', 'chain fixture product', 'seat', $3)`,
    [CHAIN.product, CHAIN_WS, CHAIN.productStatus],
  );
  await c.query(
    `INSERT INTO yucer_catalog.price_book_entry
       (id, workspace_id, product_id, currency, list_price, floor_price)
     VALUES ($1, $2, $3, 'CNY', 300000, 200000)`,
    [CHAIN.priceEntry, CHAIN_WS, CHAIN.product],
  );
  await c.query(
    `INSERT INTO yucer_catalog.solution (id, workspace_id, solution_code, name, status)
     VALUES ($1, $2, 'SOL-DB-1', 'chain fixture solution', 'active')`,
    [CHAIN.solution, CHAIN_WS],
  );
  await c.query(
    `INSERT INTO yucer_catalog.solution_item (id, workspace_id, solution_id, product_id, quantity)
     VALUES ($1, $2, $3, $4, 4)`,
    [CHAIN.solutionItem, CHAIN_WS, CHAIN.solution, CHAIN.product],
  );

  // 4 x 250,000 = 1,000,000: the deal's amount, by ADR-014's rule.
  // 250,000 is above the 200,000 floor, so this line needs no approval - the
  // approval row below is for a SECOND, discounted price, which is the state
  // the discount flow actually produces.
  await c.query(
    `INSERT INTO yucer_pipeline.opportunity_line
       (id, workspace_id, opportunity_id, product_id, solution_id,
        quantity, unit_price, amount, currency, needs_approval)
     VALUES ($1, $2, $3, $4, $5, 4, 250000, 1000000, 'CNY', false)`,
    [CHAIN.line, CHAIN_WS, CHAIN.opportunity, CHAIN.product, CHAIN.solution],
  );
  await c.query(
    `INSERT INTO yucer_pipeline.line_discount_approval
       (id, workspace_id, opportunity_id, product_id, unit_price, currency, floor_price,
        reason, approved_by_sub)
     VALUES ($1, $2, $3, $4, 180000, 'CNY', 200000,
             'strategic logo, signed off below floor', 'usr_db_leader')`,
    [CHAIN.approval, CHAIN_WS, CHAIN.opportunity, CHAIN.product],
  );

  await c.query(
    `INSERT INTO yucer_delivery.project
       (id, workspace_id, project_no, name, opportunity_id, account_id,
        contract_amount, currency, health, status)
     VALUES ($1, $2, 'PRJ-DB-1', 'chain fixture project', $3, $4,
             1000000, 'CNY', 'green', 'delivered')`,
    [CHAIN.project, CHAIN_WS, CHAIN.opportunity, CHAIN.account],
  );
  await c.query(
    `INSERT INTO yucer_delivery.project_milestone
       (id, workspace_id, project_id, name, sequence, status)
     VALUES ($1, $2, $3, 'go live', 1, 'done')`,
    [CHAIN.milestone, CHAIN_WS, CHAIN.project],
  );
  await c.query(
    `INSERT INTO yucer_delivery.revenue_schedule
       (id, workspace_id, project_id, milestone_id, sequence, planned_amount, actual_amount,
        currency, status)
     VALUES ($1, $2, $3, $4, 1, 600000, 600000, 'CNY', 'settled')`,
    [CHAIN.revenue, CHAIN_WS, CHAIN.project, CHAIN.milestone],
  );

  // The renewal, and the reason incr/0019 exists: a deal that knows which
  // delivered project it renews, on a column with no UPDATE grant.
  await c.query(
    `INSERT INTO yucer_pipeline.opportunity
       (id, workspace_id, opportunity_no, name, account_id, source_project_id,
        stage, forecast_category, amount, currency, status)
     VALUES ($1, $2, 'OPP-DB-2', 'chain fixture renewal', $3, $4,
             'qualify', 'pipeline', 400000, 'CNY', 'open')`,
    [CHAIN.renewal, CHAIN_WS, CHAIN.account, CHAIN.project],
  );

  await c.query(
    `INSERT INTO yucer_agent.agent_session
       (id, workspace_id, actor_sub, subject_type, subject_id, title, status)
     VALUES ($1, $2, 'usr_db_rep', 'opportunity', $3, 'chain fixture session', 'open')`,
    [CHAIN.session, CHAIN_WS, CHAIN.opportunity],
  );
  await c.query(
    `INSERT INTO yucer_agent.agent_playbook
       (id, workspace_id, playbook_code, name, scope_domain, content, version, status)
     VALUES ($1, $2, 'PB-DB-1', 'chain fixture play', 'pipeline', 'confirm the floor first', 1, 'active')`,
    [CHAIN.playbook, CHAIN_WS],
  );
  await c.query(
    `INSERT INTO yucer_agent.agent_autonomy (workspace_id, mode, decided_by_sub)
     VALUES ($1, 'ask_high_risk', 'usr_db_leader')`,
    [CHAIN_WS],
  );
  await c.query(
    `INSERT INTO yucer_agent.judgement_snooze
       (id, workspace_id, sub, judgement_id, urgency_at_snooze, snoozed_until)
     VALUES ($1, $2, 'usr_db_rep', 'stalled:chain', 'today', now() + interval '3 days')`,
    [CHAIN.snooze, CHAIN_WS],
  );
}
