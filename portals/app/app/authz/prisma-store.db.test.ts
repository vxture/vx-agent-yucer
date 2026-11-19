import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaAuthzStore, against a real Postgres.
//
// Nothing here has ever run against local_authz - the gate/decide logic is
// unit-tested against InMemoryAuthzStore, and the seeded catalog is tested
// in catalog.test.ts, but the class every real request actually goes through
// (the two batched queries in roleCodesForMembers, the lazy-upsert semantics
// of seeMember, the scope replace-wholesale in setScope) has never touched a
// database.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000004";
const SUB = "usr_test_authz_1";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(
      `DELETE FROM local_authz.member_role WHERE member_id IN (SELECT id FROM local_authz.member WHERE workspace_id = $1)`,
      [WS],
    );
    await c.query(
      `DELETE FROM local_authz.member_territory WHERE member_id IN (SELECT id FROM local_authz.member WHERE workspace_id = $1)`,
      [WS],
    );
    await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [WS]);
    // 0046: the workspace's own roles, materialised by the first grant.
    await c.query(`DELETE FROM local_authz.workspace_role WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM local_authz.role_line WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM local_authz.role_rank WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaAuthzStore } = await import("./prisma-store");
  return new PrismaAuthzStore();
}

// --- seeMember -----------------------------------------------------------------

test("seeMember creates on the first sighting and reports created only then", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const first = await s.seeMember({ workspaceId: WS, sub: SUB, displayName: "First Name" });
    assert.equal(first.created, true);

    const second = await s.seeMember({ workspaceId: WS, sub: SUB, displayName: "Renamed" });
    assert.equal(second.created, false);
    assert.equal(second.memberId, first.memberId, "the same sub must resolve to the same row");
  } finally {
    await cleanup();
  }
});

test("a later sighting refreshes the display cache but never touches roles or status", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.seeMember({ workspaceId: WS, sub: SUB, displayName: "Original" });
    await s.grantRole(WS, SUB, "sales_rep");
    await s.setMemberStatus(WS, SUB, "inactive");

    await s.seeMember({ workspaceId: WS, sub: SUB, displayName: "Updated Name" });

    const members = await s.listMembers(WS);
    const m = members.find((r) => r.sub === SUB);
    assert.equal(m?.displayName, "Updated Name");
    assert.deepEqual(m?.roles, ["sales_rep"], "a re-sighting must not reset roles");
    assert.equal(m?.status, "inactive", "a re-sighting must not resurrect status");
  } finally {
    await cleanup();
  }
});

test("the display cache keeps phone, email, user_no and face (0103); an unchanged sighting writes nothing", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const profile = { displayName: "Alice", phone: "+8613800000000", email: "a@example.com", userNo: "1000010000", pictureUrl: "https://x/avatar" };
    await s.seeMember({ workspaceId: WS, sub: SUB, ...profile });
    const stamp = () =>
      withPg(async (c) => (await c.query(`SELECT updated_at FROM local_authz.member WHERE workspace_id = $1 AND sub = $2`, [WS, SUB])).rows[0].updated_at.getTime());
    const before = await stamp();

    await s.seeMember({ workspaceId: WS, sub: SUB, ...profile });
    assert.equal(await stamp(), before, "the same profile again is not a write");

    await s.seeMember({ workspaceId: WS, sub: SUB, phone: null });
    const m = (await s.listMembers(WS)).find((r) => r.sub === SUB)!;
    assert.deepEqual([m.phone, m.email, m.userNo, m.pictureUrl], [null, "a@example.com", "1000010000", "https://x/avatar"]);
  } finally {
    await cleanup();
  }
});

// --- roles / permissions --------------------------------------------------------

test("rolesOf is empty before any grant, and permissionsOf derives from the real catalog join", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.seeMember({ workspaceId: WS, sub: SUB });
    assert.deepEqual(await s.rolesOf(WS, SUB), []);
    assert.deepEqual(await s.permissionsOf(WS, SUB), []);

    await s.grantRole(WS, SUB, "sales_rep");
    const roles = await s.rolesOf(WS, SUB);
    assert.deepEqual(roles, ["sales_rep"]);
    const perms = await s.permissionsOf(WS, SUB);
    assert.ok(perms.length > 0, "sales_rep must resolve to at least one real permission through the workspace's own rows");
    // 0046: the first grant materialised the presets, from the table.
    const mine = await s.listRoles(WS);
    assert.equal(mine.length, 31);
    // 0047: seeded with the vocabularies, and grouped through them.
    assert.equal((await s.listRoleGroups(WS, "line")).length, 8);
    assert.equal(mine.find((r) => r.code === "sales_rep")?.line?.code, "sales");
    assert.deepEqual(mine.find((r) => r.code === "sales_rep")?.permissions, perms);
  } finally {
    await cleanup();
  }
});

test("granting a role no member has been seen for still lands - grantRole sees the member itself", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    // No prior seeMember() call.
    await s.grantRole(WS, SUB, "viewer");
    assert.deepEqual(await s.rolesOf(WS, SUB), ["viewer"]);
  } finally {
    await cleanup();
  }
});

test("granting the same role twice does not duplicate the link, on the real unique index", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.grantRole(WS, SUB, "sales_rep");
    await s.grantRole(WS, SUB, "sales_rep");
    assert.deepEqual(await s.rolesOf(WS, SUB), ["sales_rep"]);
  } finally {
    await cleanup();
  }
});

test("granting a role the workspace does not have is refused rather than silently ignored", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(() => s.grantRole(WS, SUB, "not_a_real_role"), /not a role of this workspace/);
  } finally {
    await cleanup();
  }
});

test("revokeRole removes only the named link, and is a no-op for a member never seen", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.grantRole(WS, SUB, "sales_rep");
    await s.grantRole(WS, SUB, "viewer");
    await s.revokeRole(WS, SUB, "sales_rep");
    assert.deepEqual(await s.rolesOf(WS, SUB), ["viewer"]);

    // No throw for a sub the workspace has never seen.
    await s.revokeRole(WS, "usr_never_seen", "sales_rep");
  } finally {
    await cleanup();
  }
});

// --- member status --------------------------------------------------------------

test("setMemberStatus is a no-op for a sub with no row, and takes effect for one that exists", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.setMemberStatus(WS, "usr_never_seen", "inactive"); // must not throw
    await s.seeMember({ workspaceId: WS, sub: SUB });
    await s.setMemberStatus(WS, SUB, "inactive");
    const members = await s.listMembers(WS);
    assert.equal(members.find((m) => m.sub === SUB)?.status, "inactive");
  } finally {
    await cleanup();
  }
});

// --- scope -----------------------------------------------------------------------

test("a sub with no row reads as unscoped, not narrowed", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const scope = await s.getScope(WS, "usr_never_seen");
    assert.equal(scope.kind, "workspace");
    assert.deepEqual(scope.territoryIds, []);
  } finally {
    await cleanup();
  }
});

test("setScope round-trips, and replaces territoryIds wholesale rather than merging", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.seeMember({ workspaceId: WS, sub: SUB });
    await s.setScope(WS, SUB, { kind: "territory", territoryIds: ["eeeeeeee-0000-0000-0000-00000000aa01", "eeeeeeee-0000-0000-0000-00000000aa02"] });
    let scope = await s.getScope(WS, SUB);
    assert.equal(scope.kind, "territory");
    assert.deepEqual([...scope.territoryIds].sort(), ["eeeeeeee-0000-0000-0000-00000000aa01", "eeeeeeee-0000-0000-0000-00000000aa02"]);

    await s.setScope(WS, SUB, { kind: "territory", territoryIds: ["eeeeeeee-0000-0000-0000-00000000aa03"] });
    scope = await s.getScope(WS, SUB);
    assert.deepEqual(scope.territoryIds, ["eeeeeeee-0000-0000-0000-00000000aa03"], "the old pair is gone, not merged with the new one");
  } finally {
    await cleanup();
  }
});

// --- listMembers -----------------------------------------------------------------

test("listMembers batches roles and territories in two queries, not one per member, and returns them correctly", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.seeMember({ workspaceId: WS, sub: SUB, displayName: "Rep One" });
    await s.grantRole(WS, SUB, "sales_rep");
    await s.grantRole(WS, SUB, "viewer");
    await s.setScope(WS, SUB, { kind: "territory", territoryIds: ["eeeeeeee-0000-0000-0000-00000000aa01"] });

    const other = "usr_test_authz_2";
    await s.seeMember({ workspaceId: WS, sub: other, displayName: "Rep Two" });

    const members = await s.listMembers(WS);
    const m1 = members.find((m) => m.sub === SUB);
    const m2 = members.find((m) => m.sub === other);
    assert.ok(m1 && m2);
    assert.deepEqual([...(m1?.roles ?? [])].sort(), ["sales_rep", "viewer"]);
    assert.deepEqual(m1?.territoryIds, ["eeeeeeee-0000-0000-0000-00000000aa01"]);
    assert.deepEqual(m2?.roles, []);
    assert.deepEqual(m2?.territoryIds, []);
  } finally {
    await cleanup();
    await withPg((c) => c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [WS]));
  }
});

// --- listWorkspaces (ADR-033) --------------------------------------------------
test("listWorkspaces returns each workspace with a member once - the jobs' enumeration", { skip }, async () => {
  const WS2 = "eeeeeeee-0000-0000-0000-000000000033";
  const cleanup2 = () =>
    withPg(async (c) => {
      await c.query(`DELETE FROM local_authz.member_role WHERE member_id IN (SELECT id FROM local_authz.member WHERE workspace_id = $1)`, [WS2]);
      await c.query(`DELETE FROM local_authz.member WHERE workspace_id = $1`, [WS2]);
      await c.query(`DELETE FROM local_authz.workspace_role WHERE workspace_id = $1`, [WS2]);
      await c.query(`DELETE FROM local_authz.role_line WHERE workspace_id = $1`, [WS2]);
      await c.query(`DELETE FROM local_authz.role_rank WHERE workspace_id = $1`, [WS2]);
    });
  await cleanup();
  await cleanup2();
  try {
    const s = await store();
    await s.seeMember({ workspaceId: WS, sub: "usr_lw_1" });
    await s.seeMember({ workspaceId: WS, sub: "usr_lw_2" });
    await s.seeMember({ workspaceId: WS2, sub: "usr_lw_3" });
    const all = await s.listWorkspaces();
    const ours = all.filter((w) => w === WS || w === WS2).sort();
    assert.deepEqual(ours, [WS2, WS].sort());
    assert.equal(all.filter((w) => w === WS).length, 1, "distinct, not one per member");
  } finally {
    await cleanup();
    await cleanup2();
  }
});

// --- One-time default assignment (0127) ---------------------------------------

test("concurrent default initialization grants once and audits once, with the actual workspace role", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.seeMember({ workspaceId: WS, sub: SUB });
    await s.seedPresetRoles(WS);
    const before = await withPg(async (c) => Number((await c.query(
      "SELECT count(*) FROM local_audit.event WHERE workspace_id=$1 AND object_id=$2 AND action='admin.member.role.default'", [WS, SUB],
    )).rows[0].count));
    await Promise.all(Array.from({ length: 8 }, () => s.initializeMemberRole(WS, SUB, "sales_rep")));
    assert.deepEqual(await s.rolesOf(WS, SUB), ["sales_rep"]);
    await withPg(async (c) => {
      const result = await c.query("SELECT role_setup_complete FROM local_authz.member WHERE workspace_id=$1 AND sub=$2", [WS, SUB]);
      assert.equal(result.rows[0].role_setup_complete, true);
      const events = await c.query("SELECT count(*) FROM local_audit.event WHERE workspace_id=$1 AND object_id=$2 AND action='admin.member.role.default'", [WS, SUB]);
      assert.equal(Number(events.rows[0].count), before + 1);
    });
  } finally { await cleanup(); }
});

test("explicit role removal and inactive status cannot be undone by default initialization", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.grantRole(WS, SUB, "viewer");
    await s.revokeRole(WS, SUB, "viewer");
    await s.initializeMemberRole(WS, SUB, "sales_rep");
    assert.deepEqual(await s.rolesOf(WS, SUB), []);
    const inactive = `${SUB}_inactive`;
    await s.seeMember({ workspaceId: WS, sub: inactive });
    await s.setMemberStatus(WS, inactive, "inactive");
    await s.initializeMemberRole(WS, inactive, "sales_rep");
    await s.initializeMemberRole(WS, inactive, "sales_leader", true);
    assert.deepEqual(await s.rolesOf(WS, inactive), []);
    await s.setMemberStatus(WS, inactive, "active");
    await s.initializeMemberRole(WS, inactive, "sales_rep");
    assert.deepEqual(await s.rolesOf(WS, inactive), []);
  } finally { await cleanup(); }
});

test("an existing role or a missing default role is left alone", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.grantRole(WS, SUB, "viewer");
    await s.initializeMemberRole(WS, SUB, "sales_rep");
    assert.deepEqual(await s.rolesOf(WS, SUB), ["viewer"]);
    await s.removeRole(WS, "sales_rep");
    const newcomer = `${SUB}_new`;
    await s.seeMember({ workspaceId: WS, sub: newcomer });
    await s.initializeMemberRole(WS, newcomer, "sales_rep");
    assert.deepEqual(await s.rolesOf(WS, newcomer), []);
    assert.ok(!(await s.listRoles(WS)).some((r) => r.code === "sales_rep"));
  } finally { await cleanup(); }
});

test("an administrator revoke holding the member lock wins over a waiting default initializer", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const { memberId } = await s.seeMember({ workspaceId: WS, sub: SUB });
    await s.seedPresetRoles(WS);
    await withPg(async (c) => {
      await c.query("BEGIN");
      await c.query("SELECT id FROM local_authz.member WHERE id=$1 FOR UPDATE", [memberId]);
      const pending = s.initializeMemberRole(WS, SUB, "sales_rep");
      await c.query("UPDATE local_authz.member SET role_setup_complete=true WHERE id=$1", [memberId]);
      await c.query("COMMIT");
      await pending;
    });
    assert.deepEqual(await s.rolesOf(WS, SUB), []);
    // Both orderings of the real methods leave the explicit revoke in force.
    await Promise.all([s.initializeMemberRole(WS, SUB, "sales_rep"), s.revokeRole(WS, SUB, "sales_rep")]);
    assert.deepEqual(await s.rolesOf(WS, SUB), []);
  } finally { await cleanup(); }
});

test("default role, initialization marker and audit roll back together if audit recording fails", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await s.seeMember({ workspaceId: WS, sub: SUB });
    await s.seedPresetRoles(WS);
    // Reject only this fixture's audit event to prove the whole grant rolls back.
    // Other test workspaces are unaffected.
    await withPg(async (c) => {
      await c.query(`CREATE OR REPLACE FUNCTION local_audit.test_reject_default_role() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.workspace_id='${WS}'::uuid AND NEW.action='admin.member.role.default' THEN
          RAISE EXCEPTION 'audit fault fixture'; END IF; RETURN NEW; END $$`);
      await c.query("CREATE TRIGGER test_reject_default_role BEFORE INSERT ON local_audit.event FOR EACH ROW EXECUTE FUNCTION local_audit.test_reject_default_role()");
    });
    try {
      await assert.rejects(() => s.initializeMemberRole(WS, SUB, "sales_rep"), /audit fault fixture/);
      assert.deepEqual(await s.rolesOf(WS, SUB), []);
      await withPg(async (c) => {
        const rows = await c.query("SELECT role_setup_complete FROM local_authz.member WHERE workspace_id=$1 AND sub=$2", [WS, SUB]);
        assert.equal(rows.rows[0].role_setup_complete, false);
      });
    } finally {
      await withPg(async (c) => {
        await c.query("DROP TRIGGER test_reject_default_role ON local_audit.event");
        await c.query("DROP FUNCTION local_audit.test_reject_default_role()");
      });
    }
  } finally { await cleanup(); }
});

test("service role may update initialization state but not member identity", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const { memberId } = await s.seeMember({ workspaceId: WS, sub: SUB });
    await withPg(async (c) => {
      await c.query("SET ROLE yucer_svc");
      try {
        await c.query("UPDATE local_authz.member SET role_setup_complete=true WHERE id=$1", [memberId]);
        await assert.rejects(() => c.query("UPDATE local_authz.member SET sub='rewritten' WHERE id=$1", [memberId]), /permission denied/);
      } finally { await c.query("RESET ROLE"); }
    });
  } finally { await cleanup(); }
});
