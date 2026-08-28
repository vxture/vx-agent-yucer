import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PERM_CODES,
  ROLE_CODES,
  ROLE_PERMISSIONS,
  OWNER_BOOTSTRAP_ROLE,
  isPermCode,
  isRoleCode,
  permissionsForRoles,
  type PermCode,
  type RoleCode,
} from "./catalog";

// The database seed is the runtime authority; this file is a typed mirror of it.
// These tests are what makes "mirror" true rather than aspirational - they parse
// the seed SQL and demand exact parity in both directions.

// EVERY increment, in order - not just 0001. The catalog grows by numbered
// increment (incr/README.md: "a new permission is a new increment here"), so a
// mirror that read only the first file would go stale the moment one landed and
// would report the drift as a mirror bug rather than as the missing increment.
const INCR_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../deploy/database/ddl/incr",
);

const INCREMENTS = readdirSync(INCR_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sources = INCREMENTS.map((f) => readFileSync(join(INCR_DIR, f), "utf8"));
const sql = sources.join("\n");

/** Strip SQL line comments so commented-out rows never parse as real ones. */
function uncommented(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

/**
 * Every block matching the markers, across every increment, concatenated in
 * file order. An increment that adds one permission has the same INSERT shape
 * as the original seed, so the same parser reads both.
 */
function seedSection(startMarker: string, endMarker: string): string {
  const blocks: string[] = [];
  for (const source of sources) {
    let cursor = 0;
    for (;;) {
      const from = source.indexOf(startMarker, cursor);
      if (from === -1) break;
      const to = source.indexOf(endMarker, from + startMarker.length);
      assert.ok(to !== -1, `seed marker opened but never closed: ${startMarker}`);
      blocks.push(uncommented(source.slice(from, to)));
      cursor = to + endMarker.length;
    }
  }
  assert.ok(blocks.length > 0, `seed marker not found in any increment: ${startMarker}`);
  return blocks.join("\n");
}

function seedPermCodes(): string[] {
  const body = seedSection("INSERT INTO local_authz.permission", "ON CONFLICT");
  return [...body.matchAll(/\('([^']+)'\s*,\s*'[^']*'\)/g)].map((m) => m[1]);
}

function seedRoleCodes(): string[] {
  const body = seedSection("INSERT INTO local_authz.role ", "ON CONFLICT");
  return [...body.matchAll(/\('([^']+)'\s*,\s*'[^']*'\)/g)].map((m) => m[1]);
}

function seedGrants(): Array<[string, string]> {
  const body = seedSection("INSERT INTO local_authz.role_permission", ") AS grants");
  return [...body.matchAll(/\('([^']+)'\s*,\s*'([^']+)'\)/g)].map((m) => [m[1], m[2]]);
}

test("permission codes mirror the seed exactly, in the same order", () => {
  assert.deepEqual([...PERM_CODES], seedPermCodes());
});

test("role codes mirror the seed exactly, in the same order", () => {
  assert.deepEqual([...ROLE_CODES], seedRoleCodes());
});

test("role -> permission grants mirror the seed exactly, both directions", () => {
  const fromSeed = new Set(seedGrants().map(([r, p]) => `${r}|${p}`));
  const fromMirror = new Set<string>();
  for (const role of ROLE_CODES) {
    for (const perm of ROLE_PERMISSIONS[role]) fromMirror.add(`${role}|${perm}`);
  }

  const missingFromMirror = [...fromSeed].filter((g) => !fromMirror.has(g)).sort();
  const missingFromSeed = [...fromMirror].filter((g) => !fromSeed.has(g)).sort();

  assert.deepEqual(missingFromMirror, [], "granted in the seed but not in catalog.ts");
  assert.deepEqual(missingFromSeed, [], "granted in catalog.ts but not in the seed");
});

test("the catalog is the documented size: 25 permissions, 7 roles, 86 grants", () => {
  // Sizes are asserted separately from parity so a symmetric edit to both the
  // seed and the mirror still trips a review against the spec document.
  //
  // 20 -> 23 and 68 -> 79 by incr/0010: the catalogue partition (ADR-017). It
  // carries no feature key, so permissions are the only gate it has - which is
  // why it needed three and not two, the third being the floor price.
  //
  // 23 -> 24 and 79 -> 84 by incr/0011: account.record (ADR-018). Recording
  // what happened is not editing the customer master record.
  //
  // 24 -> 25 and 84 -> 86 by incr/0012: pipeline.discount (ADR-019). The floor
  // raised a signature requirement that no role could satisfy; the signature
  // is its own permission because the person who quotes below the floor must
  // not be the person who signs it off. Two grants - the same two roles that
  // hold catalog.price, since setting the floor and excepting it are halves of
  // one authority.
  assert.equal(PERM_CODES.length, 25);
  assert.equal(ROLE_CODES.length, 7);
  const total = ROLE_CODES.reduce((n, r) => n + ROLE_PERMISSIONS[r].length, 0);
  assert.equal(total, 86);
});

test("no role lists a duplicate permission, and every listed permission exists", () => {
  for (const role of ROLE_CODES) {
    const perms = ROLE_PERMISSIONS[role];
    assert.equal(new Set(perms).size, perms.length, `${role} lists a duplicate permission`);
    for (const p of perms) assert.ok(isPermCode(p), `${role} grants unknown permission ${p}`);
  }
});

test("every permission is granted to at least one role", () => {
  const granted = new Set<PermCode>();
  for (const role of ROLE_CODES) for (const p of ROLE_PERMISSIONS[role]) granted.add(p);
  for (const p of PERM_CODES) assert.ok(granted.has(p), `${p} is granted to no role`);
});

test("permission codes are <partition>.<action> over the nine partitions plus admin", () => {
  const domains = new Set([
    "strategy",
    "planning",
    "campaign",
    "account",
    "signal",
    "pipeline",
    "delivery",
    "copilot",
    // D9. It carries no feature key - the catalogue is not sold separately -
    // but it owns four tables, and permissions are therefore the ONLY gate on
    // it. See ADR-017.
    "catalog",
    "admin",
  ]);
  for (const p of PERM_CODES) {
    const parts = p.split(".");
    assert.equal(parts.length, 2, `${p} is not <domain>.<action>`);
    assert.ok(domains.has(parts[0]), `${p} uses an unknown domain prefix`);
  }
});

// --- The four assignment rules the catalog doc calls out by name -----------

test("copilot.autopilot is held by sales_leader alone", () => {
  const holders = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("copilot.autopilot"));
  assert.deepEqual(holders, ["sales_leader"]);
});

test("pipeline.forecast goes to leadership and ops, never to the rep", () => {
  const holders = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("pipeline.forecast"));
  assert.deepEqual(holders.sort(), ["sales_leader", "sales_ops"]);
  assert.ok(ROLE_PERMISSIONS.sales_rep.includes("pipeline.write"));
  assert.ok(!ROLE_PERMISSIONS.sales_rep.includes("pipeline.forecast"));
});

test("sales_ops administers without editing deals", () => {
  assert.ok(ROLE_PERMISSIONS.sales_ops.includes("admin.manage"));
  assert.ok(!ROLE_PERMISSIONS.sales_ops.includes("pipeline.write"));
});

test("marketing_manager triages signals but hands the deal over", () => {
  assert.ok(ROLE_PERMISSIONS.marketing_manager.includes("signal.triage"));
  assert.ok(!ROLE_PERMISSIONS.marketing_manager.includes("pipeline.write"));
});

test("viewer holds every read plus copilot.use, and nothing else", () => {
  const expected = PERM_CODES.filter((p) => p.endsWith(".read"));
  const actual = ROLE_PERMISSIONS.viewer.filter((p) => p !== "copilot.use");
  assert.deepEqual([...actual], [...expected]);
  assert.ok(ROLE_PERMISSIONS.viewer.includes("copilot.use"));
});

test("sales_leader holds every permission", () => {
  assert.equal(ROLE_PERMISSIONS.sales_leader.length, PERM_CODES.length);
});

// --- permissionsForRoles ----------------------------------------------------

test("permissionsForRoles unions roles and returns catalog order", () => {
  const perms = permissionsForRoles(["presales", "delivery_manager"]);
  assert.deepEqual(perms, PERM_CODES.filter((p) => perms.includes(p)));
  assert.ok(perms.includes("account.write")); // from presales
  assert.ok(perms.includes("delivery.write")); // from delivery_manager
  assert.ok(!perms.includes("pipeline.write")); // neither role has it
});

test("permissionsForRoles deduplicates overlapping roles", () => {
  const perms = permissionsForRoles(["viewer", "viewer", "presales"]);
  assert.equal(new Set(perms).size, perms.length);
});

test("an unknown role grants nothing rather than throwing", () => {
  // A rolling deploy can put a new role in the database before this mirror knows
  // it. Degrading to "grants nothing" is the fail-closed direction.
  assert.deepEqual(permissionsForRoles(["role_from_the_future"]), []);
  assert.deepEqual(permissionsForRoles([]), []);
  assert.deepEqual(permissionsForRoles(["viewer", "role_from_the_future"]), [
    ...ROLE_PERMISSIONS.viewer,
  ]);
});

test("type guards accept catalog values and reject everything else", () => {
  assert.ok(isPermCode("pipeline.forecast"));
  assert.ok(!isPermCode("pipeline.forecasts"));
  assert.ok(isRoleCode("sales_ops"));
  assert.ok(!isRoleCode("owner")); // a platform governance role, not a product role
});

test("the workspace-owner bootstrap role is a real role holding admin.manage", () => {
  assert.ok(isRoleCode(OWNER_BOOTSTRAP_ROLE));
  const role: RoleCode = OWNER_BOOTSTRAP_ROLE;
  assert.ok(ROLE_PERMISSIONS[role].includes("admin.manage"));
});

test("no product role reuses a platform governance role code", () => {
  // claims.ts owns owner/manager/member/readonly/guest. Overlap would invite the
  // mapping table the spec explicitly refuses to have.
  for (const g of ["owner", "manager", "member", "readonly", "guest"]) {
    assert.ok(!isRoleCode(g), `${g} collides with a platform governance role`);
  }
});
