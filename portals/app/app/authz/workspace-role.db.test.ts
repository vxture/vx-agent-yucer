import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

/* incr/0046 - the workspace's own roles, against a real Postgres.
 *
 * Everything asserted here is a property of the DATABASE and nothing else:
 * the unique key that keeps one code per workspace, the CHECK on the code's
 * shape, the foreign key that stops a held role being deleted, the cascade
 * that takes a role's grants with it, the grant set that lets the service
 * rename and re-order but never rewrite the code, and the presets' names
 * and descriptions as 0046 wrote them.
 *
 * SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000046";

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
  await c.query(
    `DELETE FROM local_authz.member_role WHERE member_id IN (SELECT id FROM local_authz.member WHERE workspace_id = $1)`,
    [WS],
  );
  await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [WS]);
  await c.query(`DELETE FROM local_authz.workspace_role WHERE workspace_id = $1`, [WS]);
  // 0047: the two vocabularies, after the roles that stand in them.
  await c.query(`DELETE FROM local_authz.role_line WHERE workspace_id = $1`, [WS]);
  await c.query(`DELETE FROM local_authz.role_rank WHERE workspace_id = $1`, [WS]);
}

/** A role with two grants. */
async function role(c: Client, code: string, perms: string[]): Promise<string> {
  const r = await c.query(
    `INSERT INTO local_authz.workspace_role (workspace_id, role_code, name) VALUES ($1, $2, $2) RETURNING id`,
    [WS, code],
  );
  const id: string = r.rows[0].id;
  for (const p of perms) {
    await c.query(
      `INSERT INTO local_authz.workspace_role_permission (workspace_role_id, permission_id)
       SELECT $1, id FROM local_authz.permission WHERE perm_code = $2`,
      [id, p],
    );
  }
  return id;
}

test("the presets carry the names, descriptions, lines, ranks and order 0047 wrote", { skip }, async () => {
  await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT role_code, name, description, sort_order FROM local_authz.role ORDER BY sort_order`,
    );
    // 0047: twenty-four, roster order dense, 集团层 first, each with a line
    // and a rung the CHECKs admit.
    assert.equal(rows.length, 31);
    assert.deepEqual(rows.map((r) => r.sort_order), rows.map((_, i) => i + 1));
    assert.equal(rows[0].role_code, "executive");
    assert.equal(rows[0].name, "高管");
    assert.equal(rows.find((r) => r.role_code === "sales_ops")?.name, "高级运营经理");
    assert.ok(rows.every((r) => r.description.length > 0), "every preset has its sentence");
    const meta = await c.query(`SELECT count(DISTINCT business_line)::int AS lines, count(DISTINCT rank)::int AS ranks FROM local_authz.role`);
    assert.deepEqual(meta.rows[0], { lines: 8, ranks: 6 });
  });
});

test("one code per workspace, in the code's shape - and the same code in two workspaces", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    await role(c, "channel_manager", []);
    await assert.rejects(role(c, "channel_manager", []), /uidx_workspace_role_code|duplicate key/);
    for (const bad of ["Channel", "9lives", "with-dash", "with space"]) {
      await assert.rejects(role(c, bad, []), /chk_workspace_role_code/, bad);
    }
    // 0047: a group is a row of THIS workspace's vocabulary, by id - a made-up
    // id is refused by the foreign key.
    await assert.rejects(
      c.query(`INSERT INTO local_authz.workspace_role (workspace_id, role_code, name, line_id) VALUES ($1, 'x_line', 'x', '00000000-0000-0000-0000-000000000000')`, [WS]),
      /fk_workspace_role_line/,
    );
    // Another workspace may have the same code: the key is per workspace.
    const other = "eeeeeeee-0000-0000-0000-000000000047";
    await c.query(`DELETE FROM local_authz.workspace_role WHERE workspace_id = $1`, [other]);
    await c.query(
      `INSERT INTO local_authz.workspace_role (workspace_id, role_code, name) VALUES ($1, 'channel_manager', 'x')`,
      [other],
    );
    await c.query(`DELETE FROM local_authz.workspace_role WHERE workspace_id = $1`, [other]);
    await cleanup(c);
  });
});

test("a held role cannot be deleted; an unheld one takes its grants with it", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    const id = await role(c, "channel_manager", ["account.read", "pipeline.read"]);
    const m = await c.query(
      `INSERT INTO local_authz.member (workspace_id, sub) VALUES ($1, 'usr_wr_1') RETURNING id`,
      [WS],
    );
    await c.query(`INSERT INTO local_authz.member_role (member_id, role_id) VALUES ($1, $2)`, [m.rows[0].id, id]);
    // RESTRICT - the service's role_in_use, said by the database.
    await assert.rejects(
      c.query(`DELETE FROM local_authz.workspace_role WHERE id = $1`, [id]),
      /fk_member_role_workspace_role|violates foreign key/,
    );
    // A link to a preset row is refused too: since 0046 a member holds the
    // WORKSPACE'S role, never the template.
    await assert.rejects(
      c.query(
        `INSERT INTO local_authz.member_role (member_id, role_id)
         SELECT $1, id FROM local_authz.role WHERE role_code = 'viewer'`,
        [m.rows[0].id],
      ),
      /fk_member_role_workspace_role|violates foreign key/,
    );
    await c.query(`DELETE FROM local_authz.member_role WHERE role_id = $1`, [id]);
    await c.query(`DELETE FROM local_authz.workspace_role WHERE id = $1`, [id]);
    const left = await c.query(
      `SELECT count(*)::int AS n FROM local_authz.workspace_role_permission WHERE workspace_role_id = $1`,
      [id],
    );
    assert.equal(left.rows[0].n, 0, "the grants cascade with the role");
    await cleanup(c);
  });
});

test("a grant names a permission the catalogue has, once", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    const id = await role(c, "channel_manager", ["account.read"]);
    await assert.rejects(
      c.query(
        `INSERT INTO local_authz.workspace_role_permission (workspace_role_id, permission_id)
         SELECT $1, id FROM local_authz.permission WHERE perm_code = 'account.read'`,
        [id],
      ),
      /pk_workspace_role_permission|duplicate key/,
    );
    await assert.rejects(
      c.query(
        `INSERT INTO local_authz.workspace_role_permission (workspace_role_id, permission_id)
         VALUES ($1, '00000000-0000-0000-0000-000000000000')`,
        [id],
      ),
      /fk_workspace_role_permission_permission/,
    );
    await cleanup(c);
  });
});

test("the service role may rename and re-order, and never rewrite the code", { skip }, async () => {
  await withPg(async (c) => {
    const priv = (t: string, p: string) =>
      c.query(`SELECT has_table_privilege('yucer_svc', $1, $2) AS ok`, [t, p]);
    for (const t of ["local_authz.workspace_role", "local_authz.workspace_role_permission"]) {
      for (const p of ["SELECT", "INSERT", "DELETE"]) {
        assert.equal((await priv(t, p)).rows[0].ok, true, `${p} on ${t}`);
      }
    }
    const { rows } = await c.query(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE table_schema = 'local_authz' AND table_name = 'workspace_role'
          AND grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
        ORDER BY column_name`,
    );
    assert.deepEqual(rows.map((r) => r.column_name), ["description", "line_id", "name", "rank_id", "sort_order", "updated_at"]);
    const link = await c.query(
      `SELECT count(*)::int AS n FROM information_schema.column_privileges
        WHERE table_schema = 'local_authz' AND table_name = 'workspace_role_permission'
          AND grantee = 'yucer_svc' AND privilege_type = 'UPDATE'`,
    );
    assert.equal(link.rows[0].n, 0, "a grant is a pair: insert and delete only");
    // And the presets stay read-only, as they were.
    const preset = await c.query(
      `SELECT has_table_privilege('yucer_svc', 'local_authz.role', 'UPDATE') AS ok`,
    );
    assert.equal(preset.rows[0].ok, false);
  });
});

test("业务线 / 层级 are the workspace's own rows: one code each, the code's shape, deletable only while empty", { skip }, async () => {
  await withPg(async (c) => {
    await cleanup(c);
    const line = await c.query(
      `INSERT INTO local_authz.role_line (workspace_id, line_code, name) VALUES ($1, 'public_sector', '政企') RETURNING id`,
      [WS],
    );
    await assert.rejects(
      c.query(`INSERT INTO local_authz.role_line (workspace_id, line_code, name) VALUES ($1, 'public_sector', 'x')`, [WS]),
      /uidx_role_line_code|duplicate key/,
    );
    await assert.rejects(
      c.query(`INSERT INTO local_authz.role_rank (workspace_id, rank_code, name) VALUES ($1, 'Vice-President', 'x')`, [WS]),
      /chk_role_rank_code/,
    );
    // A role standing in the line keeps it (RESTRICT); empty, it goes.
    const id = await role(c, "gov_manager", ["account.read"]);
    await c.query(`UPDATE local_authz.workspace_role SET line_id = $1 WHERE id = $2`, [line.rows[0].id, id]);
    await assert.rejects(
      c.query(`DELETE FROM local_authz.role_line WHERE id = $1`, [line.rows[0].id]),
      /fk_workspace_role_line|violates foreign key/,
    );
    await c.query(`DELETE FROM local_authz.workspace_role WHERE id = $1`, [id]);
    await c.query(`DELETE FROM local_authz.role_line WHERE id = $1`, [line.rows[0].id]);
    // Grants: the service may add, rename, re-order and delete; never re-key.
    for (const t of ["local_authz.role_line", "local_authz.role_rank"]) {
      for (const p of ["SELECT", "INSERT", "DELETE"]) {
        const r = await c.query(`SELECT has_table_privilege('yucer_svc', $1, $2) AS ok`, [t, p]);
        assert.equal(r.rows[0].ok, true, `${p} on ${t}`);
      }
      const cols = await c.query(
        `SELECT column_name FROM information_schema.column_privileges
          WHERE table_schema = 'local_authz' AND table_name = $1 AND grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
          ORDER BY column_name`,
        [t.split(".")[1]],
      );
      assert.deepEqual(cols.rows.map((r) => r.column_name), ["name", "sort_order", "updated_at"], t);
    }
    await cleanup(c);
  });
});
