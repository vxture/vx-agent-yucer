import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { PrismaPlanningStore } from "./prisma-store";

/* incr/0052 - the two joints of a territory, against a real Postgres.
 *
 * Properties of the DATABASE and nothing else: the migration that turns a
 * territory's region NAMES into 大区 ids (and drops a name no 大区 carries);
 * the CASCADE that takes a link with either side; the CHECK that now admits
 * the unit scope; the grant set that lets the service insert and delete a
 * pair and never update one. Then the Prisma adapter round trip: a territory
 * written with ids reads back with the 大区's CURRENT name, and a rename
 * follows without touching the territory.
 *
 * SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000052";
const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const SQL = readFileSync(join(ROOT, "deploy/database/ddl/incr/0052_territory_links.sql"), "utf8");

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
  await c.query(`DELETE FROM yucer_gtm.territory WHERE workspace_id = $1`, [WS]);
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
  await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [WS]);
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

test("the migration resolves region names to 大区 ids and drops the rest; re-running adds nothing", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    const east = await division(c, "CHINA-EAST", "华东");
    await division(c, "CHINA-SOUTH", "华南");
    const t = await c.query(
      `INSERT INTO yucer_gtm.territory (workspace_id, territory_code, name, regions)
       VALUES ($1, 'EAST', 'East', '["华东", "华东", "不存在的大区"]'::jsonb) RETURNING id`,
      [WS],
    );
    await c.query(SQL);
    const links = await c.query(
      `SELECT division_id FROM yucer_gtm.territory_division WHERE workspace_id = $1 AND territory_id = $2`,
      [WS, t.rows[0].id],
    );
    assert.deepEqual(links.rows.map((r) => r.division_id), [east], "one link, for the one name a 大区 carries");
    await c.query(SQL);
    const again = await c.query(`SELECT count(*)::int AS n FROM yucer_gtm.territory_division WHERE workspace_id = $1`, [WS]);
    assert.equal(again.rows[0].n, 1);
    await cleanup(c);
  });
});

test("a link goes with either side: the unit, the 大区, the territory", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    const east = await division(c, "CHINA-EAST", "华东");
    const u = await unit(c, "east_team");
    const t = (await c.query(
      `INSERT INTO yucer_gtm.territory (workspace_id, territory_code, name) VALUES ($1, 'EAST', 'East') RETURNING id`,
      [WS],
    )).rows[0].id;
    await c.query(`INSERT INTO yucer_gtm.territory_unit (workspace_id, territory_id, unit_id) VALUES ($1, $2, $3)`, [WS, t, u]);
    await c.query(`INSERT INTO yucer_gtm.territory_division (workspace_id, territory_id, division_id) VALUES ($1, $2, $3)`, [WS, t, east]);
    await assert.rejects(
      c.query(`INSERT INTO yucer_gtm.territory_unit (workspace_id, territory_id, unit_id) VALUES ($1, $2, $3)`, [WS, t, u]),
      /pk_territory_unit|duplicate key/,
    );
    await assert.rejects(
      c.query(`INSERT INTO yucer_gtm.territory_unit (workspace_id, territory_id, unit_id) VALUES ($1, $2, gen_random_uuid())`, [WS, t]),
      /fk_territory_unit_unit|violates foreign key/,
    );
    const count = async (table: string) =>
      (await c.query(`SELECT count(*)::int AS n FROM yucer_gtm.${table} WHERE workspace_id = $1`, [WS])).rows[0].n as number;
    await c.query(`DELETE FROM yucer_gtm.org_unit WHERE id = $1`, [u]);
    assert.equal(await count("territory_unit"), 0, "CASCADE from the unit");
    await c.query(`DELETE FROM yucer_core.market_division WHERE id = $1`, [east]);
    assert.equal(await count("territory_division"), 0, "CASCADE from the 大区");
    const east2 = await division(c, "CHINA-EAST", "华东");
    await c.query(`INSERT INTO yucer_gtm.territory_division (workspace_id, territory_id, division_id) VALUES ($1, $2, $3)`, [WS, t, east2]);
    await c.query(`DELETE FROM yucer_gtm.territory WHERE id = $1`, [t]);
    assert.equal(await count("territory_division"), 0, "CASCADE from the territory");
    await cleanup(c);
  });
});

test("the member scope admits unit, and still nothing else", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    await c.query(`INSERT INTO local_authz.member (workspace_id, sub, scope) VALUES ($1, 'usr_unit', 'unit')`, [WS]);
    await assert.rejects(
      c.query(`INSERT INTO local_authz.member (workspace_id, sub, scope) VALUES ($1, 'usr_bad', 'department')`, [WS]),
      /chk_member_scope/,
    );
    await cleanup(c);
  });
});

test("the service role inserts and deletes a pair, and never updates one", { skip }, async () => {
  await withPg(async (c) => {
    for (const t of ["yucer_gtm.territory_unit", "yucer_gtm.territory_division"]) {
      for (const p of ["SELECT", "INSERT", "DELETE"]) {
        const r = await c.query(`SELECT has_table_privilege('yucer_svc', $1, $2) AS ok`, [t, p]);
        assert.equal(r.rows[0].ok, true, `${p} on ${t}`);
      }
      const upd = await c.query(`SELECT has_table_privilege('yucer_svc', $1, 'UPDATE') AS ok`, [t]);
      assert.equal(upd.rows[0].ok, false, `no UPDATE on ${t}`);
      const cols = await c.query(
        `SELECT count(*)::int AS n FROM information_schema.column_privileges
          WHERE table_schema = 'yucer_gtm' AND table_name = $1 AND grantee = 'yucer_svc' AND privilege_type = 'UPDATE'`,
        [t.split(".")[1]],
      );
      assert.equal(cols.rows[0].n, 0, `no column UPDATE on ${t}`);
    }
  });
});

test("the Prisma adapter writes ids and reads the 大区's current name; a rename follows", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    const east = await division(c, "CHINA-EAST", "华东");
    const south = await division(c, "CHINA-SOUTH", "华南");
    const u = await unit(c, "east_team");
    const store = new PrismaPlanningStore();
    const saved = await store.upsertTerritory(WS, {
      territoryCode: "EAST", name: "East", parentId: null, ownerSub: null, status: "active",
      regions: [], divisionIds: [east, south], unitIds: [u],
    });
    assert.deepEqual([[...saved.divisionIds].sort(), [...saved.regions].sort(), saved.unitIds], [[east, south].sort(), ["华东", "华南"], [u]]);
    // The column is not written: it still says what it said before 0052.
    const col = await c.query(`SELECT regions FROM yucer_gtm.territory WHERE id = $1`, [saved.id]);
    assert.deepEqual(col.rows[0].regions, []);
    await c.query(`UPDATE yucer_core.market_division SET name = '华东大区' WHERE id = $1`, [east]);
    const [read] = await store.listTerritories(WS);
    assert.deepEqual([...read!.regions].sort(), ["华东大区", "华南"]);
    // Replaced wholesale: one 大区, no unit.
    const again = await store.upsertTerritory(WS, {
      territoryCode: "EAST", name: "East", parentId: null, ownerSub: null, status: "active",
      regions: [], divisionIds: [south], unitIds: [],
    });
    assert.deepEqual([again.divisionIds, again.regions, again.unitIds], [[south], ["华南"], []]);
    // And the by-hand detach the memory store mirrors.
    await store.upsertTerritory(WS, {
      territoryCode: "EAST", name: "East", parentId: null, ownerSub: null, status: "active",
      divisionIds: [south], unitIds: [u],
    });
    assert.equal(await store.detachUnitFromTerritories(WS, u), 1);
    assert.equal(await store.detachUnitFromTerritories(WS, u), 0);
    await cleanup(c);
  });
});
