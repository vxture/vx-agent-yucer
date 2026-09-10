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
  presetRoles,
  DEFAULT_ROLE_LINES,
  DEFAULT_ROLE_RANKS,
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

test("the catalog is the documented size: 25 permissions, 24 roles, 287 grants", () => {
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
  //
  // 7 -> 9 roles and 86 -> 117 grants by incr/0021: sales_manager and
  // regional_director, the two rungs between a rep and the whole organisation
  // (owner, 2026-09-01). PERMISSIONS DID NOT MOVE - every code they grant
  // already existed, so the product gained no new thing anyone may do, it
  // gained two places to stand.
  //
  // 9 -> 24 roles and 117 -> 287 grants by incr/0047 (owner, 2026-09-09:
  // 集团级公司规模，尽量减少用户自定义): the ladder. PERMISSIONS DID NOT MOVE
  // again - twenty-five is still the whole vocabulary - and no two presets
  // hold the same set (presets.test.ts holds that).
  assert.equal(PERM_CODES.length, 25);
  assert.equal(ROLE_CODES.length, 24);
  const total = ROLE_CODES.reduce((n, r) => n + ROLE_PERMISSIONS[r].length, 0);
  assert.equal(total, 287);
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
  // THE INVARIANT IS THE SECOND HALF, not the list. A rep owns the deal and not
  // the forecast commitment; who else may commit is a catalogue decision that
  // grows. incr/0021 added the two rungs between a rep and the whole
  // organisation, and both of them exist precisely BECAUSE they commit a number
  // upward - that is the line a first-line manager crosses.
  // incr/0047 widened the list to the group-scale ladder: every rung from
  // manager up, the two ops rungs, and 大客户经理, who commits on the accounts
  // they own. The invariant is unchanged: nobody on the bottom rung.
  const holders = ROLE_CODES.filter((r) => ROLE_PERMISSIONS[r].includes("pipeline.forecast"));
  assert.deepEqual([...holders].sort(), [
    "key_account_manager",
    "regional_director",
    "regional_general_manager",
    "sales_leader",
    "sales_manager",
    "sales_ops",
    "sales_ops_specialist",
    "senior_channel_manager",
    "senior_sales_manager",
  ]);
  for (const bottom of ["sales_rep", "channel_manager", "sdr", "presales", "marketing_specialist"] as const) {
    assert.ok(!ROLE_PERMISSIONS[bottom].includes("pipeline.forecast"), `${bottom} does not commit a number`);
  }
  assert.ok(ROLE_PERMISSIONS.sales_rep.includes("pipeline.write"));
});

test("the two new rungs are a ladder, not two labels for the same thing", () => {
  // A catalogue with two codes and one permission set is a catalogue that lies
  // about having made a distinction. Each rung must add something the one below
  // it does not have - and this is also why 总经理 got no role of its own:
  // sales_leader already holds everything it would.
  const rep = new Set(ROLE_PERMISSIONS.sales_rep);
  const mgr = new Set(ROLE_PERMISSIONS.sales_manager);
  const dir = new Set(ROLE_PERMISSIONS.regional_director);

  for (const p of rep) assert.ok(mgr.has(p), `sales_manager should hold everything a rep does: ${p}`);
  for (const p of mgr) assert.ok(dir.has(p), `regional_director should hold everything a manager does: ${p}`);
  assert.ok(mgr.size > rep.size, "a manager who may do exactly what a rep may do is a label");
  assert.ok(dir.size > mgr.size, "a director who may do exactly what a manager may do is a label");
});

test("no two roles hold the same permission set", () => {
  // The general form of the rule above, over the whole catalogue. It is what
  // decided that 总经理 is sales_leader rather than a ninth role.
  const seen = new Map<string, string>();
  for (const role of ROLE_CODES) {
    const key = [...ROLE_PERMISSIONS[role]].sort().join(",");
    const twin = seen.get(key);
    assert.equal(twin, undefined, `${role} and ${twin} grant exactly the same thing`);
    seen.set(key, role);
  }
});

test("neither new rung administers the workspace or runs the copilot unattended", () => {
  // Running the sales organisation and administering the workspace are not one
  // job. Nor is deciding a proposal the same as switching off the deciding.
  for (const role of ["sales_manager", "regional_director"] as const) {
    assert.ok(!ROLE_PERMISSIONS[role].includes("admin.manage"), role);
    assert.ok(!ROLE_PERMISSIONS[role].includes("copilot.autopilot"), role);
    assert.ok(!ROLE_PERMISSIONS[role].includes("strategy.approve"), role);
  }
});

test("a director approves against the floor but does not get to move it", () => {
  // ADR-019's separation, applied to the new rung: the person who signs a
  // below-floor deal must not be the person who decides where the floor sits.
  assert.ok(ROLE_PERMISSIONS.regional_director.includes("pipeline.discount"));
  assert.ok(!ROLE_PERMISSIONS.regional_director.includes("catalog.price"));
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

// --- incr/0046: the presets carry name, description and order as DATA ---------

/** The (code, name, description, line, rank, order) rows the LAST preset
 *  statement writes onto local_authz.role - 0047's, which restates all 24
 *  and therefore supersedes 0046's four-column rows. */
function seedPresetRows(): Array<[string, string, string, string, string, number]> {
  // THE LAST BLOCK ONLY: 0047 wrote these rows and 0048 restated them in a
  // new order; the table holds whatever the latest increment says, so the
  // mirror is held to that and not to a superseded statement.
  const all = seedSection(
    "UPDATE local_authz.role r SET name = v.name, description = v.description,\n  business_line = v.line",
    ") AS v(code, name, description, line, rank, ord)",
  );
  const marker = "UPDATE local_authz.role r SET name = v.name";
  const body = all.slice(all.lastIndexOf(marker));
  return [...body.matchAll(/\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\)/g)].map(
    (m) => [m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, Number(m[6])],
  );
}

test("the presets' names, descriptions, lines, ranks and order mirror the latest increment exactly", () => {
  // A workspace copy starts from these columns and prints them (incr/0046,
  // 0047), so the in-memory store's presets and the table's have to be the
  // same rows - or the demo would show one 销售经理 and production another.
  const rows = seedPresetRows();
  assert.equal(rows.length, ROLE_CODES.length, "the latest block names every preset once");
  const mirror = presetRoles();
  for (const [code, name, description, line, rank, ord] of rows) {
    const p = mirror.find((x) => x.code === code);
    assert.ok(p, `${code} is in the seed but not in presetRoles()`);
    assert.equal(p.name, name, `${code}: name`);
    assert.equal(p.description, description, `${code}: description`);
    assert.equal(p.line, line, `${code}: business_line`);
    assert.equal(p.rank, rank, `${code}: rank`);
    assert.equal(p.sortOrder, ord, `${code}: sort_order`);
  }
  // Roster order is dense, starts with the group layer, and inside a line
  // runs from the top rung down (0048): a reader picks from an org chart.
  assert.deepEqual([...mirror.map((p) => p.sortOrder)], mirror.map((_, i) => i + 1));
  assert.equal(mirror[0]!.code, "sales_leader");
  const lines = DEFAULT_ROLE_LINES.map((g) => g.code);
  const ranks = DEFAULT_ROLE_RANKS.map((g) => g.code);
  for (let i = 1; i < mirror.length; i += 1) {
    const a = mirror[i - 1]!;
    const b = mirror[i]!;
    const la = lines.indexOf(a.line);
    const lb = lines.indexOf(b.line);
    assert.ok(la <= lb, `${a.code} before ${b.code}: line order`);
    if (la === lb) assert.ok(ranks.indexOf(a.rank) >= ranks.indexOf(b.rank), `${a.code} before ${b.code}: rank high to low`);
  }
});

test("no two presets hold the same permission set - a rung adds something", () => {
  // The owner's standing rule since 总经理 was refused: two codes with one
  // set is a catalogue pretending to distinguish. Every rung of the 0047
  // ladder differs from every other preset in at least one grant.
  const seen = new Map<string, string>();
  for (const p of presetRoles()) {
    const key = [...p.permissions].sort().join("|");
    assert.ok(!seen.has(key), `${p.code} holds exactly what ${seen.get(key)} holds`);
    seen.set(key, p.code);
  }
});

/** The (code, name, order) rows 0047 seeds into a workspace's vocabulary. */
function seedGroupRows(table: "role_line" | "role_rank"): Array<[string, string, number]> {
  const body = seedSection(`INSERT INTO local_authz.${table} (workspace_id`, ") AS v(code, name, ord)");
  return [...body.matchAll(/\('([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\)/g)].map((m) => [m[1]!, m[2]!, Number(m[3])]);
}

test("the shipped 业务线 and 层级 mirror incr/0047 exactly, and every preset names one of each", () => {
  // The memory store seeds a workspace from these lists; 0047 seeded the
  // workspaces that were already there from its VALUES. Same rows, or the
  // demo and production disagree about what a 销售 line is called.
  for (const [table, list] of [["role_line", DEFAULT_ROLE_LINES], ["role_rank", DEFAULT_ROLE_RANKS]] as const) {
    const rows = seedGroupRows(table);
    assert.deepEqual(rows.map(([c, n]) => ({ code: c, name: n })), [...list], table);
    assert.deepEqual(rows.map(([, , o]) => o), rows.map((_, i) => i + 1), `${table}: dense order`);
  }
  for (const p of presetRoles()) {
    assert.ok(DEFAULT_ROLE_LINES.some((g) => g.code === p.line), `${p.code}: line ${p.line} is shipped`);
    assert.ok(DEFAULT_ROLE_RANKS.some((g) => g.code === p.rank), `${p.code}: rank ${p.rank} is shipped`);
  }
});
