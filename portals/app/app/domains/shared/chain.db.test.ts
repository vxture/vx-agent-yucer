import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { CHAIN, CHAIN_WS, OTHER_WS, clearChain, seedChain } from "./db-chain";

// The half of the schema no real-database test had ever touched.
//
// MEASURED, not guessed: 34 product tables, 20 reached by a *.db.test.ts and 14
// not. The 14 were the whole pricing and approval chain, the whole
// delivery-to-revenue end, the planning head, and the agent's own newest tables
// - including `agent_autonomy`, whose GRANT statements were hand-written two
// days before this file and had never been run by anything.
//
// WHAT THESE TESTS ARE FOR, and it is not "more coverage". Every assertion here
// is about something only Postgres can answer: a CHECK, a foreign key, a UNIQUE
// with NULLs, or a REVOKE. Anything a TypeScript test could have proved belongs
// in a TypeScript test, where it runs on every push instead of only here.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Seed, run, and clear - even when the body throws. */
async function onChain(fn: (c: Client) => Promise<void>): Promise<void> {
  await withDb(async (c) => {
    await seedChain(c);
    try {
      await fn(c);
    } finally {
      await clearChain(c);
    }
  });
}

// --- The chain holds together ------------------------------------------------

test("the whole chain seeds - every foreign key along it resolves", { skip }, async () => {
  // The cheapest possible proof, and the one nothing had: these 14 tables can
  // actually be populated together. Each was reachable only through a foreign
  // key from something else, which is exactly why none of them was tested -
  // setting one up meant setting up six.
  await onChain(async (c) => {
    const { rows } = await c.query<{ t: string; n: string }>(
      `SELECT 'strategy_plan' t, count(*)::text n FROM yucer_gtm.strategy_plan WHERE workspace_id = $1
       UNION ALL SELECT 'account_plan', count(*)::text FROM yucer_core.account_plan WHERE workspace_id = $1
       UNION ALL SELECT 'opportunity_line', count(*)::text FROM yucer_pipeline.opportunity_line WHERE workspace_id = $1
       UNION ALL SELECT 'price_book_entry', count(*)::text FROM yucer_catalog.price_book_entry WHERE workspace_id = $1
       UNION ALL SELECT 'line_discount_approval', count(*)::text FROM yucer_pipeline.line_discount_approval WHERE workspace_id = $1
       UNION ALL SELECT 'solution', count(*)::text FROM yucer_catalog.solution WHERE workspace_id = $1
       UNION ALL SELECT 'solution_item', count(*)::text FROM yucer_catalog.solution_item WHERE workspace_id = $1
       UNION ALL SELECT 'project', count(*)::text FROM yucer_delivery.project WHERE workspace_id = $1
       UNION ALL SELECT 'project_milestone', count(*)::text FROM yucer_delivery.project_milestone WHERE workspace_id = $1
       UNION ALL SELECT 'revenue_schedule', count(*)::text FROM yucer_delivery.revenue_schedule WHERE workspace_id = $1
       UNION ALL SELECT 'agent_session', count(*)::text FROM yucer_agent.agent_session WHERE workspace_id = $1
       UNION ALL SELECT 'agent_playbook', count(*)::text FROM yucer_agent.agent_playbook WHERE workspace_id = $1
       UNION ALL SELECT 'agent_autonomy', count(*)::text FROM yucer_agent.agent_autonomy WHERE workspace_id = $1
       UNION ALL SELECT 'judgement_snooze', count(*)::text FROM yucer_agent.judgement_snooze WHERE workspace_id = $1`,
      [CHAIN_WS],
    );
    const empty = rows.filter((r) => r.n === "0").map((r) => r.t);
    assert.deepEqual(empty, [], "these chain tables seeded no row");
  });
});

test("the deal's amount equals its lines - the fixture obeys ADR-014", { skip }, async () => {
  // NOT a test of the rule; the rule lives in replaceOpportunityLines and is
  // unit-tested there. This is a test of the FIXTURE, because a fixture whose
  // numbers do not add up cannot be used to probe anything about pricing and
  // would teach the wrong shape to whoever reads it next.
  await onChain(async (c) => {
    const { rows } = await c.query<{ header: string; lines: string }>(
      `SELECT o.amount::text header, sum(l.amount)::text lines
         FROM yucer_pipeline.opportunity o
         JOIN yucer_pipeline.opportunity_line l ON l.opportunity_id = o.id
        WHERE o.id = $1 GROUP BY o.amount`,
      [CHAIN.opportunity],
    );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].header), Number(rows[0].lines));
  });
});

// --- Constraints only Postgres can answer ------------------------------------

test("a price book entry cannot put the floor above list price", { skip }, async () => {
  // chk_price_floor. The floor decides which discounts need a signature, so a
  // floor above list would make every sale need approval - the rule layer says
  // so, and this proves the database says so too.
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_catalog.price_book_entry
           (workspace_id, product_id, currency, list_price, floor_price, effective_at)
         VALUES ($1, $2, 'CNY', 100, 900, now() + interval '1 day')`,
        [CHAIN_WS, CHAIN.product],
      ),
      /chk_price_floor/,
    );
  });
});

test("a discount approval must carry a reason, not just a signature", { skip }, async () => {
  // chk_approval_reason is length(btrim(reason)) > 0, so whitespace is not a
  // reason. Somebody reads this row months later asking why the floor was
  // crossed; a signature with no sentence answers nothing.
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_pipeline.line_discount_approval
           (workspace_id, opportunity_id, product_id, unit_price, floor_price, reason, approved_by_sub)
         VALUES ($1, $2, $3, 100, 200, '   ', 'usr_db_leader')`,
        [CHAIN_WS, CHAIN.opportunity, CHAIN.product],
      ),
      /chk_approval_reason/,
    );
  });
});

test("an opportunity line cannot carry a zero quantity", { skip }, async () => {
  // chk_line_qty is quantity > 0, not >= 0. A line of nothing is not a line.
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_pipeline.opportunity_line
           (workspace_id, opportunity_id, product_id, quantity, unit_price, amount)
         VALUES ($1, $2, $3, 0, 100, 0)`,
        [CHAIN_WS, CHAIN.opportunity, CHAIN.product],
      ),
      /chk_line_qty/,
    );
  });
});

test("a solution cannot list the same product twice", { skip }, async () => {
  // uidx_solution_item. Two rows for one product in one solution is a quantity
  // expressed as duplication, and every roll-up over it would double-count.
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_catalog.solution_item (workspace_id, solution_id, product_id, quantity)
         VALUES ($1, $2, $3, 1)`,
        [CHAIN_WS, CHAIN.solution, CHAIN.product],
      ),
      /uidx_solution_item/,
    );
  });
});

test("a project's delivery window cannot end before it starts", { skip }, async () => {
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_delivery.project
           (workspace_id, project_no, name, account_id, starts_at, ends_at)
         VALUES ($1, 'PRJ-DB-BAD', 'backwards', $2, now(), now() - interval '10 days')`,
        [CHAIN_WS, CHAIN.account],
      ),
      /chk_project_window/,
    );
  });
});

test("two revenue instalments cannot share a sequence on one project", { skip }, async () => {
  // uidx_revenue_schedule_seq. The sequence is the instalment's identity in the
  // contract; two rows numbered 1 is a schedule nobody can settle against.
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_delivery.revenue_schedule
           (workspace_id, project_id, sequence, planned_amount)
         VALUES ($1, $2, 1, 400000)`,
        [CHAIN_WS, CHAIN.project],
      ),
      /uidx_revenue_schedule_seq/,
    );
  });
});

test("deleting a project takes its milestones and instalments with it", { skip }, async () => {
  // ON DELETE CASCADE on both, and ON DELETE SET NULL from revenue to
  // milestone. Asserted because the three were written in one increment and
  // nothing has ever run them: an instalment orphaned from its project is a
  // payment nobody can attribute.
  await onChain(async (c) => {
    await c.query(`DELETE FROM yucer_delivery.project WHERE id = $1`, [CHAIN.project]);
    const { rows } = await c.query<{ m: string; r: string }>(
      `SELECT (SELECT count(*) FROM yucer_delivery.project_milestone WHERE project_id = $1)::text m,
              (SELECT count(*) FROM yucer_delivery.revenue_schedule WHERE project_id = $1)::text r`,
      [CHAIN.project],
    );
    assert.equal(rows[0].m, "0");
    assert.equal(rows[0].r, "0");
  });
});

test("the renewal survives its project being deleted, without pointing at a ghost", { skip }, async () => {
  // fk_opportunity_source_project is ON DELETE SET NULL, deliberately: losing
  // the project must not delete the renewal deal that came out of it. The
  // attribution goes null and the money stays.
  await onChain(async (c) => {
    await c.query(`DELETE FROM yucer_delivery.project WHERE id = $1`, [CHAIN.project]);
    const { rows } = await c.query<{ source_project_id: string | null }>(
      `SELECT source_project_id FROM yucer_pipeline.opportunity WHERE id = $1`,
      [CHAIN.renewal],
    );
    assert.equal(rows.length, 1, "the renewal deal must still exist");
    assert.equal(rows[0].source_project_id, null);
  });
});

test("agent_autonomy accepts only the three modes, live", { skip }, async () => {
  // incr/0020's CHECK. This table is two days old and its constraint had never
  // been executed by anything; a mode the product does not know would be a
  // workspace with an authorisation nobody can interpret.
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_agent.agent_autonomy (workspace_id, mode) VALUES ($1, 'autopilot')`,
        [OTHER_WS],
      ),
      /chk_agent_autonomy_mode/,
    );
    for (const mode of ["ask_high_risk", "ask_always", "autonomous"]) {
      await c.query(
        `INSERT INTO yucer_agent.agent_autonomy (workspace_id, mode) VALUES ($1, $2)
         ON CONFLICT (workspace_id) DO UPDATE SET mode = EXCLUDED.mode`,
        [OTHER_WS, mode],
      );
    }
  });
});

test("an agent session names both a subject and its type, or neither", { skip }, async () => {
  // chk_agent_session_subject_pair. A session about "an opportunity" with no id
  // is a conversation nobody can navigate back to.
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_agent.agent_session (workspace_id, actor_sub, subject_type)
         VALUES ($1, 'usr_db_rep', 'opportunity')`,
        [CHAIN_WS],
      ),
      /chk_agent_session_subject_pair/,
    );
  });
});

// --- Privileges, fired live --------------------------------------------------

test("the service role cannot move a renewal's source project", { skip }, async () => {
  // incr/0019 grants NO UPDATE on source_project_id: attribution is frozen
  // after creation, and fixing it is a data correction through db-init rather
  // than an application write. Every other test connects as the superuser,
  // which bypasses grants entirely - so this is the only shot that lands.
  await onChain(async (c) => {
    await c.query(`SET ROLE yucer_svc`);
    try {
      // The whitelist still works, so this proves the role can write the table
      // at all and the refusal below is about the COLUMN.
      await c.query(`UPDATE yucer_pipeline.opportunity SET name = 'renamed by svc' WHERE id = $1`, [
        CHAIN.renewal,
      ]);
      await assert.rejects(
        c.query(`UPDATE yucer_pipeline.opportunity SET source_project_id = NULL WHERE id = $1`, [
          CHAIN.renewal,
        ]),
        /permission denied/,
      );
    } finally {
      await c.query(`RESET ROLE`);
    }
  });
});

test("the service role can read and write the chain's new tables at all", { skip }, async () => {
  // The failure this catches is the one incr/0020's own header warns about: a
  // table created in an increment gets NO privileges from 97_service_role.sql,
  // because Postgres evaluates GRANT ON ALL TABLES at grant time. The grants
  // have to be written in the increment, and nothing had ever run them.
  await onChain(async (c) => {
    await c.query(`SET ROLE yucer_svc`);
    try {
      await c.query(`SELECT 1 FROM yucer_agent.agent_autonomy WHERE workspace_id = $1`, [CHAIN_WS]);
      await c.query(
        `UPDATE yucer_agent.agent_autonomy SET mode = 'ask_always', updated_at = now() WHERE workspace_id = $1`,
        [CHAIN_WS],
      );
      await c.query(`SELECT 1 FROM yucer_agent.judgement_snooze WHERE workspace_id = $1`, [CHAIN_WS]);
    } finally {
      await c.query(`RESET ROLE`);
    }
  });
});

test("agent_autonomy's identity column carries no UPDATE grant", { skip }, async () => {
  // workspace_id is the row's identity: a different workspace is a different
  // row, never an edit. Stated in incr/0020 and never verified.
  await onChain(async (c) => {
    await c.query(`SET ROLE yucer_svc`);
    try {
      await assert.rejects(
        c.query(`UPDATE yucer_agent.agent_autonomy SET workspace_id = $1 WHERE workspace_id = $2`, [
          OTHER_WS,
          CHAIN_WS,
        ]),
        /permission denied/,
      );
    } finally {
      await c.query(`RESET ROLE`);
    }
  });
});
