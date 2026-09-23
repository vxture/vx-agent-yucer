import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// incr/0076 contract + contract_line, against a real Postgres.
//
// The four things only a database can prove (L4 batch one acceptance):
//   UNIQUENESS  - a contract is renewed once; a number is unique per workspace.
//   CHECKS      - term order, quantity, price, no self-renewal.
//   GRANTS      - the frozen keys refuse the service role; the writable ones
//                 do not. `permission denied` is the design, not a fault.
//   NULLS       - many first-generation contracts share a NULL
//                 renewed_from_contract_id without colliding. The easiest one
//                 to get wrong: were NULLs not distinct, the second contract
//                 ever signed would be refused.
// Then the adapter itself: two queries for any number of contracts, lines
// attached, NUMERIC read back as numbers.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000076";
const ACC = "eeeeeeee-0000-0000-0000-0000000076a1";
const UNIT = "eeeeeeee-0000-0000-0000-0000000076c1";
const STATUS = "eeeeeeee-0000-0000-0000-0000000076c2";
const PROD = "eeeeeeee-0000-0000-0000-0000000076c3";
const CT1 = "eeeeeeee-0000-0000-0000-0000000076d1";
const CT2 = "eeeeeeee-0000-0000-0000-0000000076d2";
const CT3 = "eeeeeeee-0000-0000-0000-0000000076d3";

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
     VALUES ($1, $2, 'ACC-CT', 'Contract Test', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
  await c.query(
    `INSERT INTO yucer_catalog.product_status (id, workspace_id, status_code, name, description)
     VALUES ($1, $2, 'active', 'ct status', 'ct') ON CONFLICT DO NOTHING`,
    [STATUS, WS],
  );
  await c.query(
    `INSERT INTO yucer_catalog.product_unit (id, workspace_id, unit_code, name)
     VALUES ($1, $2, 'set', 'set') ON CONFLICT DO NOTHING`,
    [UNIT, WS],
  );
  await c.query(
    `INSERT INTO yucer_catalog.product (id, workspace_id, product_code, name, unit_id, status_id)
     VALUES ($1, $2, 'PROD-CT', 'ct product', $3, $4) ON CONFLICT DO NOTHING`,
    [PROD, WS, UNIT, STATUS],
  );
}

async function insertContract(c: Client, id: string, no: string, renewedFrom: string | null = null) {
  await c.query(
    `INSERT INTO yucer_delivery.contract
       (id, workspace_id, contract_no, name, account_id, status, term_start, term_end, renewed_from_contract_id)
     VALUES ($1, $2, $3, 'ct', $4, 'active', '2026-01-01', '2026-12-31', $5)`,
    [id, WS, no, ACC, renewedFrom],
  );
}

async function cleanup() {
  await withPg(async (c) => {
    // incr/0078: superuser cleanup - yucer_svc could not delete these.
    await c.query(`DELETE FROM yucer_delivery.renewal_event WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_delivery.renewal_policy WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_delivery.contract_line WHERE workspace_id = $1`, [WS]);
    // Children before parents: renewed_from is ON DELETE RESTRICT.
    await c.query(
      `DELETE FROM yucer_delivery.contract WHERE workspace_id = $1 AND renewed_from_contract_id IS NOT NULL`,
      [WS],
    );
    await c.query(`DELETE FROM yucer_delivery.contract WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_catalog.product WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_catalog.product_unit WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_catalog.product_status WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaDeliveryStore } = await import("./prisma-store");
  return new PrismaDeliveryStore();
}

test("uniqueness: a contract is renewed once, and a number once per workspace", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await insertContract(c, CT1, "HT-1");
      await insertContract(c, CT2, "HT-2", CT1);
      await assert.rejects(insertContract(c, CT3, "HT-3", CT1), /uidx_contract_renewed_from/);
      await assert.rejects(insertContract(c, CT3, "HT-1"), /uidx_contract_ws_no/);
    });
  } finally {
    await cleanup();
  }
});

test("nulls: many first-generation contracts share a NULL lineage without colliding", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await insertContract(c, CT1, "HT-1");
      await insertContract(c, CT2, "HT-2");
      await insertContract(c, CT3, "HT-3");
      const { rows } = await c.query(
        `SELECT count(*)::int AS n FROM yucer_delivery.contract
          WHERE workspace_id = $1 AND renewed_from_contract_id IS NULL`,
        [WS],
      );
      assert.equal(rows[0].n, 3);
    });
  } finally {
    await cleanup();
  }
});

test("checks: inverted term, self-renewal, zero quantity and negative price are refused", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await assert.rejects(
        c.query(
          `INSERT INTO yucer_delivery.contract (workspace_id, contract_no, name, account_id, term_start, term_end)
           VALUES ($1, 'HT-X', 'x', $2, '2026-12-31', '2026-01-01')`,
          [WS, ACC],
        ),
        /chk_contract_window/,
      );
      await insertContract(c, CT1, "HT-1");
      await assert.rejects(
        c.query(`UPDATE yucer_delivery.contract SET renewed_from_contract_id = id WHERE id = $1`, [CT1]),
        /chk_contract_not_self_renewal/,
      );
      await assert.rejects(
        c.query(
          `INSERT INTO yucer_delivery.contract_line (workspace_id, contract_id, product_id, quantity, unit_price, amount)
           VALUES ($1, $2, $3, 0, 10, 0)`,
          [WS, CT1, PROD],
        ),
        /chk_contract_line_qty/,
      );
      await assert.rejects(
        c.query(
          `INSERT INTO yucer_delivery.contract_line (workspace_id, contract_id, product_id, quantity, unit_price, amount)
           VALUES ($1, $2, $3, 1, -1, 0)`,
          [WS, CT1, PROD],
        ),
        /chk_contract_line_price/,
      );
      // A product still on a contract line cannot leave the catalogue.
      await c.query(
        `INSERT INTO yucer_delivery.contract_line (workspace_id, contract_id, product_id, quantity, unit_price, amount)
         VALUES ($1, $2, $3, 1, 10, 10)`,
        [WS, CT1, PROD],
      );
      await assert.rejects(
        c.query(`DELETE FROM yucer_catalog.product WHERE id = $1`, [PROD]),
        /fk_contract_line_product/,
      );
    });
  } finally {
    await cleanup();
  }
});

test("grants: the service role edits the writable columns and is refused the frozen keys", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await insertContract(c, CT1, "HT-1");
      await c.query(
        `INSERT INTO yucer_delivery.contract_line (workspace_id, contract_id, product_id, quantity, unit_price, amount)
         VALUES ($1, $2, $3, 1, 10, 10)`,
        [WS, CT1, PROD],
      );
      await c.query(`SET ROLE yucer_svc`);
      try {
        await c.query(`UPDATE yucer_delivery.contract SET name = 'renamed', notice_days = 60 WHERE id = $1`, [CT1]);
        await c.query(`UPDATE yucer_delivery.contract_line SET quantity = 2, amount = 20 WHERE contract_id = $1`, [CT1]);
        for (const col of ["contract_no = 'HT-MOVED'", `account_id = '${ACC}'`, "opportunity_id = NULL", "renewed_from_contract_id = NULL"]) {
          await assert.rejects(
            c.query(`UPDATE yucer_delivery.contract SET ${col} WHERE id = $1`, [CT1]),
            /permission denied/,
            col,
          );
        }
        for (const col of [`contract_id = '${CT1}'`, `product_id = '${PROD}'`]) {
          await assert.rejects(
            c.query(`UPDATE yucer_delivery.contract_line SET ${col} WHERE contract_id = $1`, [CT1]),
            /permission denied/,
            col,
          );
        }
        // And it can read, insert and delete at all - a new table with no
        // grant would fail here first, not at deploy.
        await c.query(`SELECT count(*) FROM yucer_delivery.contract_line WHERE contract_id = $1`, [CT1]);
        await c.query(`DELETE FROM yucer_delivery.contract_line WHERE contract_id = $1`, [CT1]);
      } finally {
        await c.query(`RESET ROLE`);
      }
    });
  } finally {
    await cleanup();
  }
});

test("the adapter: create, lines attached in one read, NUMERIC back as numbers, edits guarded", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const created = await s.createContract(WS, {
      contractNo: "HT-ADP",
      name: "adapter",
      accountId: ACC,
      opportunityId: null,
      totalAmount: 1234.5,
      currency: "CNY",
      termStart: new Date("2026-01-01T00:00:00Z"),
      termEnd: new Date("2026-12-31T00:00:00Z"),
      noticeDays: 30,
      status: "active",
      signedAt: null,
    });
    assert.equal(await s.contractNoTaken(WS, "HT-ADP"), true);
    assert.equal(await s.contractNoTaken(WS, "HT-NONE"), false);

    const line = await s.addContractLine(WS, created.id, {
      productId: PROD, quantity: 3, unitPrice: 33.33, amount: 99.99, currency: "CNY", termEnd: null,
    });
    assert.equal(line.amount, 99.99);

    assert.equal(await s.updateContract(WS, created.id, { name: "renamed", status: "terminated" }), true);
    assert.equal(await s.updateContractLine(WS, line.id, { quantity: 1, amount: 33.33 }), true);

    const [listed] = await s.listContracts(WS, { accountId: ACC });
    assert.equal(listed.name, "renamed");
    assert.equal(listed.status, "terminated");
    assert.equal(listed.totalAmount, 1234.5);
    assert.deepEqual(listed.lines.map((l) => [l.productId, l.quantity, l.amount]), [[PROD, 1, 33.33]]);

    assert.equal(await s.removeContractLine(WS, line.id), true);
    assert.equal((await s.getContract(WS, created.id))?.lines.length, 0);
    // Another workspace sees nothing.
    assert.equal(await s.getContract("eeeeeeee-0000-0000-0000-000000000999", created.id), null);
  } finally {
    await cleanup();
  }
});

// --- incr/0078 renewal_event (L4 batch two) ---------------------------------

test("renewal_event: the type vocabulary and the successor rule are enforced", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await insertContract(c, CT1, "HT-1");
      await insertContract(c, CT2, "HT-2", CT1);
      const ins = (type: string, successor: string | null) =>
        c.query(
          `INSERT INTO yucer_delivery.renewal_event (workspace_id, contract_id, event_type, successor_contract_id)
           VALUES ($1, $2, $3, $4)`,
          [WS, CT1, type, successor],
        );
      // expired was dropped on purpose (owner, 2026-09-22).
      await assert.rejects(ins("expired", null), /chk_renewal_event_type/);
      await assert.rejects(ins("renewed", null), /chk_renewal_event_successor/);
      await assert.rejects(ins("lost", CT2), /chk_renewal_event_successor/);
      await ins("renewed", CT2);
      await ins("lost", null);
      // RESTRICT: a contract with a renewal history cannot be deleted.
      await assert.rejects(c.query(`DELETE FROM yucer_delivery.contract WHERE id = $1`, [CT2]), /fk_renewal_event_successor|fk_contract_renewed_from/);
    });
  } finally {
    await cleanup();
  }
});

test("renewal_event: append-only for the service role - INSERT yes, UPDATE and DELETE no", { skip }, async () => {
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await insertContract(c, CT1, "HT-1");
      await c.query(`SET ROLE yucer_svc`);
      try {
        await c.query(
          `INSERT INTO yucer_delivery.renewal_event (workspace_id, contract_id, event_type, reason)
           VALUES ($1, $2, 'lost', 'budget')`,
          [WS, CT1],
        );
        await c.query(`SELECT count(*) FROM yucer_delivery.renewal_event WHERE contract_id = $1`, [CT1]);
        await assert.rejects(c.query(`UPDATE yucer_delivery.renewal_event SET reason = 'rewritten' WHERE contract_id = $1`, [CT1]), /permission denied/);
        await assert.rejects(c.query(`DELETE FROM yucer_delivery.renewal_event WHERE contract_id = $1`, [CT1]), /permission denied/);
      } finally {
        await c.query(`RESET ROLE`);
      }
    });
  } finally {
    await cleanup();
  }
});

test("the adapter: renew writes the lineage, events and renewedBy read back, a second renewal hits the index", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const draft = (no: string) => ({
      contractNo: no, name: "adapter", accountId: ACC, opportunityId: null, totalAmount: 10, currency: "CNY",
      termStart: new Date("2026-01-01T00:00:00Z"), termEnd: new Date("2026-12-31T00:00:00Z"),
      noticeDays: 30, status: "active" as const, signedAt: null,
    });
    const first = await s.createContract(WS, draft("HT-R1"));
    const second = await s.createContract(WS, draft("HT-R2"), first.id);
    assert.equal(second.renewedFromContractId, first.id);
    await s.appendRenewalEvent(WS, {
      contractId: first.id, eventType: "renewed", successorContractId: second.id, reason: null, actorSub: "usr_x",
    });
    // By CODE: Prisma's P2002 message does not name the index, which is why
    // the service matches the code and re-reads rather than parsing text.
    await assert.rejects(s.createContract(WS, draft("HT-R3"), first.id), (e: unknown) => (e as { code?: string }).code === "P2002");

    const held = await s.getContract(WS, first.id);
    assert.equal(held?.renewedBy, second.id);
    assert.deepEqual(held?.events.map((e) => [e.eventType, e.successorContractId, e.actorSub]), [["renewed", second.id, "usr_x"]]);
    assert.equal((await s.getContract(WS, second.id))?.renewedBy, null);
  } finally {
    await cleanup();
  }
});

// --- L4 batch three: the health score's renewal sources, read for real -------

test("account healthInputs reads contracts, lineage, outcomes and the window from the real schema", { skip }, async () => {
  // The fake-client test proves the assembly; this proves the QUERIES - field
  // names, the `in` filter on event_type, the renewal_policy lookup - are ones
  // Postgres and the generated client actually accept.
  await cleanup();
  try {
    await withPg(async (c) => {
      await seed(c);
      await insertContract(c, CT1, "HT-1");
      await insertContract(c, CT2, "HT-2", CT1);
      await c.query(
        `INSERT INTO yucer_delivery.renewal_event (workspace_id, contract_id, event_type, successor_contract_id)
         VALUES ($1, $2, 'renewed', $3)`,
        [WS, CT1, CT2],
      );
      await c.query(
        `INSERT INTO yucer_delivery.renewal_event (workspace_id, contract_id, event_type, reason)
         VALUES ($1, $2, 'downgraded', 'fewer seats')`,
        [WS, CT2],
      );
      await c.query(
        `INSERT INTO yucer_delivery.renewal_policy (workspace_id, window_days) VALUES ($1, 45)
         ON CONFLICT (workspace_id) DO UPDATE SET window_days = 45`,
        [WS],
      );
    });
    const { PrismaAccountStore } = await import("../account/prisma-store");
    const out = await new PrismaAccountStore().healthInputs(WS, ACC);
    assert.equal(out.renewal.windowDays, 45);
    assert.equal(out.renewal.hasOpenRenewalDeal, false);
    const byRenewed = out.renewal.contracts.map((x) => x.renewed).sort();
    assert.deepEqual(byRenewed, [false, true]);
    assert.deepEqual(out.renewal.events.map((e) => e.eventType), ["downgraded"]);
  } finally {
    await cleanup();
  }
});
