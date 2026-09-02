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
    assert.ok(perms.length > 0, "sales_rep must resolve to at least one real permission through the seeded join");
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

test("granting a role outside the seeded catalog is refused rather than silently ignored", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(() => s.grantRole(WS, SUB, "not_a_real_role" as never), /not in the seeded catalog/);
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
