import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { PrismaPlanningStore } from "./prisma-store";

/* incr/0055 - a department's direct 大区 link, against a real Postgres.
 *
 * Properties of the DATABASE and nothing else: the CASCADE that takes a link
 * with either side (the unit or the 大区); the PK that refuses a duplicate
 * pair; the grant set that lets the service insert and delete a pair and
 * never update one. Then the Prisma adapter round trip: setUnitDivisions
 * writes exactly the delta, and listUnitDivisionLinks groups by division in
 * the shape org.ts's aggregate/inherit functions already expect.
 *
 * SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000055";
const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const SQL = readFileSync(join(ROOT, "deploy/database/ddl/incr/0055_org_unit_division.sql"), "utf8");

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function cleanup(c: Client): Promise<void> {
  await c.query(`DELETE FROM yucer_gtm.org_unit_member WHERE workspace_id = $1`, [WS]);
  for (;;) {
    const { rowCount } = await c.query(
      `DELETE FROM yucer_gtm.org_unit u WHERE u.workspace_id = $1
         AND NOT EXISTS (SELECT 1 FROM yucer_gtm.org_unit x WHERE x.parent_id = u.id)`,
      [WS],
    );
    if (!rowCount) break;
  }
  await c.query(`DELETE FROM yucer_gtm.org_unit_kind WHERE workspace_id = $1`, [WS]);
  await c.query(`DELETE FROM yucer_core.market_division WHERE workspace_id = $1`, [WS]);
}

async function division(c: Client, code: string, name: string): Promise<string> {
  const r = await c.query(
    `INSERT INTO yucer_core.market_division (workspace_id, division_code, name) VALUES ($1, $2, $3) RETURNING id`,
    [WS, code, name],
  );
  return r.rows[0].id;
}

async function unit(c: Client, code: string): Promise<string> {
  const k = await c.query(
    `INSERT INTO yucer_gtm.org_unit_kind (workspace_id, kind_code, name) VALUES ($1, 'team', 'x')
     ON CONFLICT (workspace_id, kind_code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [WS],
  );
  const r = await c.query(
    `INSERT INTO yucer_gtm.org_unit (workspace_id, unit_code, name, kind_id) VALUES ($1, $2, $2, $3) RETURNING id`,
    [WS, code, k.rows[0].id],
  );
  return r.rows[0].id;
}

test("the PK refuses a duplicate pair, and a link goes with either side", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    await c.query(SQL);
    const east = await division(c, "CHINA-EAST", "华东");
    const u = await unit(c, "east_team");
    await c.query(`INSERT INTO yucer_gtm.org_unit_division (workspace_id, unit_id, division_id) VALUES ($1, $2, $3)`, [WS, u, east]);
    await assert.rejects(
      c.query(`INSERT INTO yucer_gtm.org_unit_division (workspace_id, unit_id, division_id) VALUES ($1, $2, $3)`, [WS, u, east]),
      /pk_org_unit_division|duplicate key/,
    );
    await assert.rejects(
      c.query(`INSERT INTO yucer_gtm.org_unit_division (workspace_id, unit_id, division_id) VALUES ($1, gen_random_uuid(), $2)`, [WS, east]),
      /fk_org_unit_division_unit|violates foreign key/,
    );
    const count = async () =>
      (await c.query(`SELECT count(*)::int AS n FROM yucer_gtm.org_unit_division WHERE workspace_id = $1`, [WS])).rows[0].n as number;
    await c.query(`DELETE FROM yucer_gtm.org_unit WHERE id = $1`, [u]);
    assert.equal(await count(), 0, "CASCADE from the unit");
    const u2 = await unit(c, "east_team2");
    const east2 = await division(c, "CHINA-EAST2", "华东二区");
    await c.query(`INSERT INTO yucer_gtm.org_unit_division (workspace_id, unit_id, division_id) VALUES ($1, $2, $3)`, [WS, u2, east2]);
    await c.query(`DELETE FROM yucer_core.market_division WHERE id = $1`, [east2]);
    assert.equal(await count(), 0, "CASCADE from the 大区");
    await cleanup(c);
  });
});

test("the service role inserts and deletes a pair, and never updates one", { skip }, async () => {
  await withPg(async (c) => {
    for (const p of ["SELECT", "INSERT", "DELETE"]) {
      const r = await c.query(`SELECT has_table_privilege('yucer_svc', 'yucer_gtm.org_unit_division', $1) AS ok`, [p]);
      assert.equal(r.rows[0].ok, true, `${p} on org_unit_division`);
    }
    const upd = await c.query(`SELECT has_table_privilege('yucer_svc', 'yucer_gtm.org_unit_division', 'UPDATE') AS ok`);
    assert.equal(upd.rows[0].ok, false, "no UPDATE on org_unit_division");
    const cols = await c.query(
      `SELECT count(*)::int AS n FROM information_schema.column_privileges
        WHERE table_schema = 'yucer_gtm' AND table_name = 'org_unit_division' AND grantee = 'yucer_svc' AND privilege_type = 'UPDATE'`,
    );
    assert.equal(cols.rows[0].n, 0, "no column UPDATE on org_unit_division");
  });
});

test("the Prisma adapter writes exactly the delta, and lists links grouped by division", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    const east = await division(c, "CHINA-EAST", "华东");
    const south = await division(c, "CHINA-SOUTH", "华南");
    const u = await unit(c, "east_team");
    const u2 = await unit(c, "south_team");
    const store = new PrismaPlanningStore();

    await store.setUnitDivisions(WS, u, [east, south]);
    let links = await store.listUnitDivisionLinks(WS);
    assert.deepEqual(
      links.map((l) => [l.id, [...l.unitIds].sort()]).sort(),
      [[east, [u]], [south, [u]]].sort(),
    );

    // Replaced wholesale: only 华东 stays, and 南方 team joins it.
    await store.setUnitDivisions(WS, u, [east]);
    await store.setUnitDivisions(WS, u2, [east]);
    links = await store.listUnitDivisionLinks(WS);
    assert.deepEqual(links.map((l) => [l.id, [...l.unitIds].sort()]), [[east, [u, u2].sort()]]);

    assert.equal(await store.detachUnitFromDivisions(WS, u), 1);
    assert.equal(await store.detachUnitFromDivisions(WS, u), 0);
    await cleanup(c);
  });
});
