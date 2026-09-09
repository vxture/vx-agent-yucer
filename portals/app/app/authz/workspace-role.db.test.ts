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

test("the presets carry the names, descriptions and order 0046 wrote", { skip }, async () => {
  await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT role_code, name, description, sort_order FROM local_authz.role ORDER BY sort_order`,
    );
    assert.equal(rows.length, 9);
    assert.deepEqual(rows.map((r) => r.sort_order), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(rows[0].role_code, "sales_leader");
    assert.equal(rows[0].name, "销售负责人");
    assert.ok(rows.every((r) => r.description.length > 0), "every preset has its sentence");
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
    assert.deepEqual(rows.map((r) => r.column_name), ["description", "name", "sort_order", "updated_at"]);
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
