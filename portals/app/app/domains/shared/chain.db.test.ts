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
        // milestone_id is NOT NULL since incr/0032, so it is named here -
        // otherwise this row is refused for a reason that has nothing to do
        // with the uniqueness being tested, and the test passes on the wrong
        // constraint.
        `INSERT INTO yucer_delivery.revenue_schedule
           (workspace_id, project_id, milestone_id, sequence, planned_amount)
         VALUES ($1, $2, $3, 1, 400000)`,
        [CHAIN_WS, CHAIN.project, CHAIN.milestone],
      ),
      /uidx_revenue_schedule_seq/,
    );
  });
});

test("deleting a project takes its milestones and instalments with it", { skip }, async () => {
  // ON DELETE CASCADE on both. The revenue -> milestone link is RESTRICT since
  // incr/0032 (a gate with money on it cannot be deleted), which does NOT block
  // this: the cascade from the project removes the instalments in the same
  // statement, and RESTRICT only refuses a milestone deleted out from under
  // money that survives it. Asserted because an instalment orphaned from its
  // project is a payment nobody can attribute.
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


// --- Data scope, incr/0022 ---------------------------------------------------

test("member scope accepts only the three values, live", { skip }, async () => {
  // The CHECK is what stops a value that is not a scope from becoming one. A
  // member row carrying an unrecognised scope would be a person whose
  // visibility nothing can describe.
  await withDb(async (c) => {
    const ws = "55555555-5555-5555-5555-555555555555";
    await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [ws]);
    try {
      await c.query(
        `INSERT INTO local_authz.member (workspace_id, sub, scope) VALUES ($1, 'usr_scope', 'region')`,
        [ws],
      );
      assert.fail("an unknown scope should not have been accepted");
    } catch (e) {
      assert.match(String(e), /chk_member_scope/);
    }

    for (const scope of ["workspace", "territory", "own"]) {
      await c.query(
        `INSERT INTO local_authz.member (workspace_id, sub, scope) VALUES ($1, $2, $3)`,
        [ws, `usr_${scope}`, scope],
      );
    }
    const { rows } = await c.query<{ n: string }>(
      `SELECT count(*)::text n FROM local_authz.member WHERE workspace_id = $1`,
      [ws],
    );
    assert.equal(rows[0].n, "3");
    await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [ws]);
  });
});

test("a new member is unscoped, because narrowing is the administrator's act", { skip }, async () => {
  // The DEFAULT is the part worth pinning against a real database. Shipping
  // this increment must not narrow anybody: every existing workspace would
  // silently lose rows on the morning it applies, and nobody asked for that.
  await withDb(async (c) => {
    const ws = "55555555-5555-5555-5555-555555555556";
    await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [ws]);
    await c.query(`INSERT INTO local_authz.member (workspace_id, sub) VALUES ($1, 'usr_fresh')`, [ws]);
    const { rows } = await c.query<{ scope: string }>(
      `SELECT scope FROM local_authz.member WHERE workspace_id = $1`,
      [ws],
    );
    assert.equal(rows[0].scope, "workspace");
    await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [ws]);
  });
});

test("a territory assignment is a pair, and cannot be edited into a different one", { skip }, async () => {
  // No UPDATE grant at all: moving somebody from one territory to another is a
  // delete and an insert. Fired live as yucer_svc, which is the only way to
  // reach the grant - every other test connects as the superuser.
  await withDb(async (c) => {
    const ws = "55555555-5555-5555-5555-555555555557";
    await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [ws]);
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO local_authz.member (workspace_id, sub, scope)
       VALUES ($1, 'usr_terr', 'territory') RETURNING id`,
      [ws],
    );
    const memberId = rows[0].id;
    await c.query(
      `INSERT INTO local_authz.member_territory (member_id, territory_id) VALUES ($1, $2)`,
      [memberId, CHAIN.territory],
    );

    await c.query(`SET ROLE yucer_svc`);
    try {
      // The scope column IS writable - an administrator changes it.
      await c.query(`UPDATE local_authz.member SET scope = 'own' WHERE id = $1`, [memberId]);
      await assert.rejects(
        c.query(`UPDATE local_authz.member_territory SET territory_id = $1 WHERE member_id = $2`, [
          CHAIN.project,
          memberId,
        ]),
        /permission denied/,
      );
    } finally {
      await c.query(`RESET ROLE`);
    }

    // The member cascade takes the assignment with it.
    await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [ws]);
    const left = await c.query<{ n: string }>(
      `SELECT count(*)::text n FROM local_authz.member_territory WHERE member_id = $1`,
      [memberId],
    );
    assert.equal(left.rows[0].n, "0");
  });
});

// --- incr/0033: why anything left the funnel ---------------------------------
//
// SUBJECT_ID IS A LITERAL HERE, not a row from the chain, and that is not
// laziness - it is the trade being tested. The column is polymorphic and
// carries no foreign key, so the database accepts an id that resolves to
// nothing. Writing it out makes the cost visible in the one place somebody
// would look for it.
const EXIT_SUBJECT = "eeeeeeee-0000-0000-0000-00000000f001";
//
// THE CHECKS ARE THE WHOLE POINT OF THE TABLE. subject_id is polymorphic and
// carries no foreign key, so the only thing standing between this table and
// rows that describe a stage they never belonged to is a pair of CHECK
// constraints - and a CHECK is a property of Postgres and of nothing else.

test("a lead cannot claim an ending that belongs to another stage", { skip }, async () => {
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_pipeline.funnel_exit
           (workspace_id, stage, subject_id, outcome, reason_code, decided_by_sub)
         VALUES ($1, 'lead', $2, 'written_off', 'no_budget', 'usr_db')`,
        [CHAIN_WS, EXIT_SUBJECT],
      ),
      /chk_funnel_exit_outcome/,
      "a lead counted under revenue is what a cross-stage table must not allow",
    );
  });
});

test("each stage accepts its own outcomes", { skip }, async () => {
  await onChain(async (c) => {
    for (const [stage, outcome] of [
      ["signal", "dismissed"],
      ["lead", "disqualified"],
      ["opportunity", "abandoned"],
      ["project", "cancelled"],
      ["revenue", "written_off"],
    ]) {
      await c.query(
        `INSERT INTO yucer_pipeline.funnel_exit
           (workspace_id, stage, subject_id, outcome, reason_code, decided_by_sub)
         VALUES ($1, $2, $3, $4, 'timing', 'usr_db')`,
        [CHAIN_WS, stage, EXIT_SUBJECT, outcome],
      );
    }
  });
});

test("'other' with no note is refused by the database, not only by the rule", { skip }, async () => {
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_pipeline.funnel_exit
           (workspace_id, stage, subject_id, outcome, reason_code, decided_by_sub)
         VALUES ($1, 'lead', $2, 'disqualified', 'other', 'usr_db')`,
        [CHAIN_WS, EXIT_SUBJECT],
      ),
      /chk_funnel_exit_other_note/,
      "a catch-all with no sentence becomes the whole vocabulary within a quarter",
    );
    // Whitespace is not a sentence either.
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_pipeline.funnel_exit
           (workspace_id, stage, subject_id, outcome, reason_code, note, decided_by_sub)
         VALUES ($1, 'lead', $2, 'disqualified', 'other', '   ', 'usr_db')`,
        [CHAIN_WS, EXIT_SUBJECT],
      ),
      /chk_funnel_exit_other_note/,
    );
  });
});

test("an exit record cannot be edited afterwards", { skip }, async () => {
  await onChain(async (c) => {
    await c.query(
      `INSERT INTO yucer_pipeline.funnel_exit
         (workspace_id, stage, subject_id, outcome, reason_code, decided_by_sub)
       VALUES ($1, 'lead', $2, 'disqualified', 'no_budget', 'usr_db')`,
      [CHAIN_WS, EXIT_SUBJECT],
    );
    await c.query(`SET ROLE yucer_svc`);
    await assert.rejects(
      c.query(
        `UPDATE yucer_pipeline.funnel_exit SET reason_code = 'timing' WHERE workspace_id = $1`,
        [CHAIN_WS],
      ),
      /permission denied/,
      "append-only: somebody's account of why a deal died is a record, not a field",
    );
    // DELETE stays granted, for the one case that needs it: a hard-deleted
    // lead takes its exit rows with it.
    await c.query(`DELETE FROM yucer_pipeline.funnel_exit WHERE workspace_id = $1`, [CHAIN_WS]);
    await c.query(`RESET ROLE`);
  });
});

test("an abandoned deal can finally have a review written for it", { skip }, async () => {
  // opportunity.status has allowed 'abandoned' since the baseline; the review
  // table's CHECK allowed only won and lost, so the row was refused by the
  // database rather than merely never written.
  await onChain(async (c) => {
    await c.query(`DELETE FROM yucer_pipeline.win_loss_review WHERE workspace_id = $1`, [CHAIN_WS]);
    await c.query(
      `INSERT INTO yucer_pipeline.win_loss_review
         (workspace_id, opportunity_id, outcome, primary_reason_id, reviewer_sub)
       VALUES ($1, $2, 'abandoned', $3, 'usr_db')`,
      [CHAIN_WS, CHAIN.opportunity, CHAIN.winLossReason],
    );
  });
});

// --- incr/0034: a deal has an owner and says what the customer wants ---------

test("a deal cannot be written without an owner", { skip }, async () => {
  // owner_sub was nullable and one function happened to fill it. Three paths
  // create opportunities in this product and one reaches the store directly,
  // so the habit was never a rule until this column said so.
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_pipeline.opportunity
           (workspace_id, opportunity_no, name, account_id, requirement)
         VALUES ($1, 'OPP-NOOWNER', 'No owner', $2, 'wants a thing')`,
        [CHAIN_WS, CHAIN.account],
      ),
      /owner_sub/,
    );
  });
});

test("a deal cannot be written without a requirement, blank included", { skip }, async () => {
  await onChain(async (c) => {
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_pipeline.opportunity
           (workspace_id, opportunity_no, name, account_id, owner_sub)
         VALUES ($1, 'OPP-NOREQ', 'No requirement', $2, 'usr_db')`,
        [CHAIN_WS, CHAIN.account],
      ),
      /requirement/,
      "NOT NULL",
    );
    // AND NOT NULL IS NOT ENOUGH ON TEXT. An empty string passes it and says
    // nothing - which is exactly the placeholder the migration refuses to
    // write for anybody.
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_pipeline.opportunity
           (workspace_id, opportunity_no, name, account_id, owner_sub, requirement)
         VALUES ($1, 'OPP-BLANKREQ', 'Blank', $2, 'usr_db', '   ')`,
        [CHAIN_WS, CHAIN.account],
      ),
      /chk_opportunity_requirement/,
    );
  });
});

test("the requirement is writable - it is understood better as a deal runs", { skip }, async () => {
  // Not an attribution key and not an anchor: a first sentence written at
  // qualify time should be improved, not preserved as a monument.
  await onChain(async (c) => {
    await c.query(`SET ROLE yucer_svc`);
    await c.query(
      `UPDATE yucer_pipeline.opportunity SET requirement = 'sharper wording' WHERE id = $1`,
      [CHAIN.opportunity],
    );
    await c.query(`RESET ROLE`);
  });
});
