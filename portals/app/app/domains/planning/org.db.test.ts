import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { DEFAULT_ORG_KINDS, ORG_TEMPLATES } from "./lib/org";
import { WRITABLE_COLUMNS } from "../shared/column-locks";

/* incr/0051 - 组织结构, against a real Postgres.
 *
 * Everything asserted here is a property of the DATABASE: the templates as
 * rows equal to their mirror, the seed a workspace with members receives
 * (kinds, then the default tree with its parents linked), the CHECK on a
 * code, the unique key per workspace, the RESTRICT that keeps a trunk while
 * anything stands under it and a kind while anything is of it, the CASCADE
 * that un-places members with their unit, one unit per member, and the
 * grant set that lets the service rename and re-hang but never re-key.
 *
 * SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000051";
const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const SQL = readFileSync(join(ROOT, "deploy/database/ddl/incr/0051_org_structure.sql"), "utf8");

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
  // Leaves first: the parent FK RESTRICTs.
  for (;;) {
    const { rowCount } = await c.query(
      `DELETE FROM yucer_gtm.org_unit u WHERE u.workspace_id = $1
         AND NOT EXISTS (SELECT 1 FROM yucer_gtm.org_unit x WHERE x.parent_id = u.id)`,
      [WS],
    );
    if (!rowCount) break;
  }
  await c.query(`DELETE FROM yucer_gtm.org_unit_kind WHERE workspace_id = $1`, [WS]);
  await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [WS]);
}

test("the table and the mirror hold the same templates, unit for unit, parents by code", { skip }, async () => {
  await withPg(async (c) => {
    const templates = (
      await c.query(`SELECT template_key, name, description, is_default FROM yucer_ref.org_template ORDER BY sort_order`)
    ).rows;
    assert.deepEqual(
      templates.map((t) => ({ key: t.template_key, name: t.name, description: t.description, isDefault: t.is_default })),
      ORG_TEMPLATES.map(({ key, name, description, isDefault }) => ({ key, name, description, isDefault })),
    );
    for (const t of ORG_TEMPLATES) {
      const units = (
        await c.query(
          `SELECT u.unit_code, p.unit_code AS parent_code, u.kind_code, u.name
             FROM yucer_ref.org_template_unit u
             JOIN yucer_ref.org_template t ON t.id = u.template_id
             LEFT JOIN yucer_ref.org_template_unit p ON p.id = u.parent_id
            WHERE t.template_key = $1 ORDER BY u.sort_order`,
          [t.key],
        )
      ).rows;
      assert.deepEqual(
        units.map((u) => ({ code: u.unit_code, parent: u.parent_code, kind: u.kind_code, name: u.name })),
        [...t.units],
        t.key,
      );
    }
  });
});

test("a workspace with members receives the kinds and the default tree, linked, once", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    await c.query(`INSERT INTO local_authz.member (workspace_id, sub) VALUES ($1, 'usr_org_1')`, [WS]);
    // The increment again, as db-init would run it on a database that has
    // this workspace: CREATE IF NOT EXISTS is a no-op, the seed fires.
    await c.query(SQL);
    const kinds = (await c.query(`SELECT kind_code, name FROM yucer_gtm.org_unit_kind WHERE workspace_id = $1 ORDER BY sort_order`, [WS])).rows;
    assert.deepEqual(kinds.map((k) => ({ code: k.kind_code, name: k.name })), [...DEFAULT_ORG_KINDS]);
    const d = ORG_TEMPLATES.find((t) => t.isDefault)!;
    const units = (
      await c.query(
        `SELECT u.unit_code, p.unit_code AS parent_code, k.kind_code, u.name
           FROM yucer_gtm.org_unit u
           JOIN yucer_gtm.org_unit_kind k ON k.id = u.kind_id
           LEFT JOIN yucer_gtm.org_unit p ON p.id = u.parent_id
          WHERE u.workspace_id = $1 ORDER BY u.sort_order`,
        [WS],
      )
    ).rows;
    assert.deepEqual(
      units.map((u) => ({ code: u.unit_code, parent: u.parent_code, kind: u.kind_code, name: u.name })),
      [...d.units],
    );
    // And again: nothing doubles, nothing re-hangs.
    await c.query(SQL);
    const again = await c.query(`SELECT count(*)::int AS n FROM yucer_gtm.org_unit WHERE workspace_id = $1`, [WS]);
    assert.equal(again.rows[0].n, d.units.length);
    await cleanup(c);
  });
});

test("one code per workspace in the code's shape; a trunk and a kind in use stay; a member goes with the unit", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    const kind = await c.query(
      `INSERT INTO yucer_gtm.org_unit_kind (workspace_id, kind_code, name) VALUES ($1, 'team', '团队') RETURNING id`,
      [WS],
    );
    const kindId: string = kind.rows[0].id;
    await assert.rejects(
      c.query(`INSERT INTO yucer_gtm.org_unit_kind (workspace_id, kind_code, name) VALUES ($1, 'Team', 'x')`, [WS]),
      /chk_org_unit_kind_code/,
    );
    const hq = await c.query(
      `INSERT INTO yucer_gtm.org_unit (workspace_id, unit_code, name, kind_id) VALUES ($1, 'hq', '总部', $2) RETURNING id`,
      [WS, kindId],
    );
    const hqId: string = hq.rows[0].id;
    await assert.rejects(
      c.query(`INSERT INTO yucer_gtm.org_unit (workspace_id, unit_code, name, kind_id) VALUES ($1, 'hq', 'x', $2)`, [WS, kindId]),
      /uidx_org_unit_code|duplicate key/,
    );
    await assert.rejects(
      c.query(`INSERT INTO yucer_gtm.org_unit (workspace_id, unit_code, name, kind_id) VALUES ($1, 'HQ-2', 'x', $2)`, [WS, kindId]),
      /chk_org_unit_code/,
    );
    const team = await c.query(
      `INSERT INTO yucer_gtm.org_unit (workspace_id, unit_code, name, kind_id, parent_id) VALUES ($1, 'sales', '销售', $2, $3) RETURNING id`,
      [WS, kindId, hqId],
    );
    const teamId: string = team.rows[0].id;
    // The trunk stays while the team stands under it; the kind stays while a unit is of it.
    await assert.rejects(c.query(`DELETE FROM yucer_gtm.org_unit WHERE id = $1`, [hqId]), /fk_org_unit_parent|violates foreign key/);
    await assert.rejects(c.query(`DELETE FROM yucer_gtm.org_unit_kind WHERE id = $1`, [kindId]), /fk_org_unit_kind|violates foreign key/);
    // One unit per member; the placement goes with the unit.
    await c.query(`INSERT INTO yucer_gtm.org_unit_member (workspace_id, sub, unit_id) VALUES ($1, 'usr_a', $2)`, [WS, teamId]);
    await assert.rejects(
      c.query(`INSERT INTO yucer_gtm.org_unit_member (workspace_id, sub, unit_id) VALUES ($1, 'usr_a', $2)`, [WS, hqId]),
      /pk_org_unit_member|duplicate key/,
    );
    await c.query(`DELETE FROM yucer_gtm.org_unit WHERE id = $1`, [teamId]);
    const left = await c.query(`SELECT count(*)::int AS n FROM yucer_gtm.org_unit_member WHERE workspace_id = $1`, [WS]);
    assert.equal(left.rows[0].n, 0, "CASCADE: the member is un-placed, not stranded");
    await cleanup(c);
  });
});

test("the service role reads the templates, and rewrites nothing it is not granted", { skip }, async () => {
  await withPg(async (c) => {
    const priv = async (t: string, p: string) =>
      (await c.query(`SELECT has_table_privilege('yucer_svc', $1, $2) AS ok`, [t, p])).rows[0].ok as boolean;
    for (const t of ["yucer_ref.org_template", "yucer_ref.org_template_unit"]) {
      assert.equal(await priv(t, "SELECT"), true, t);
      for (const p of ["INSERT", "UPDATE", "DELETE"]) assert.equal(await priv(t, p), false, `${p} on ${t}`);
    }
    for (const t of ["yucer_gtm.org_unit_kind", "yucer_gtm.org_unit", "yucer_gtm.org_unit_member"]) {
      for (const p of ["SELECT", "INSERT", "DELETE"]) assert.equal(await priv(t, p), true, `${p} on ${t}`);
      const [schema, table] = t.split(".");
      const cols = await c.query(
        `SELECT column_name FROM information_schema.column_privileges
          WHERE table_schema = $1 AND table_name = $2 AND grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
          ORDER BY column_name`,
        [schema, table],
      );
      // The mirror IS the whitelist, column for column.
      assert.deepEqual(cols.rows.map((r) => r.column_name), [...WRITABLE_COLUMNS[t]!].sort(), t);
    }
  });
});
