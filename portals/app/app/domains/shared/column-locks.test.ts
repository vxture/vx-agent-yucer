import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  APPEND_ONLY_TABLES,
  FROZEN_COLUMN_REASON,
  WRITABLE_COLUMNS,
  assertWritable,
  isAppendOnly,
  pickWritable,
  toSnakeCase,
  writableColumns,
} from "./column-locks";

// The DDL is the authority; this file is a mirror. These tests are what make
// "mirror" true: they parse 98_column_locks.sql and demand parity in both
// directions, so a grant added to the database without being added here (or the
// reverse) fails the build instead of failing a production write.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
// 98_column_locks.sql PLUS every increment.
//
// db-init applies 97/98 BEFORE incr/*, so a table created in an increment
// cannot have its locks in file 98 - the REVOKE would run against a table that
// does not exist yet. Its grants therefore ship inside the increment that
// creates it, and this mirror has to read them from there or it would demand
// parity against half the picture.
const LOCK_FILES = [
  join(ROOT, "deploy/database/ddl/98_column_locks.sql"),
  ...readdirSync(join(ROOT, "deploy/database/ddl/incr"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(ROOT, "deploy/database/ddl/incr", f)),
];
const sql = LOCK_FILES.map((f) => readFileSync(f, "utf8")).join("\n");

/** Strip SQL line comments so commented-out grants never parse as real ones. */
const uncommented = sql
  .split("\n")
  .map((l) => {
    const i = l.indexOf("--");
    return i === -1 ? l : l.slice(0, i);
  })
  .join("\n");

function ddlGrants(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  // GRANT UPDATE (a, b, c) ON schema.table TO yucer_svc;  (may span lines)
  const re = /GRANT\s+UPDATE\s*\(([^)]*)\)\s*ON\s+(\w+\.\w+)\s+TO\s+\w+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(uncommented))) {
    const cols = m[1]
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    // UNION, not overwrite. Postgres accumulates grants: two GRANT UPDATE
    // statements on one table leave the service role able to write BOTH column
    // sets. Overwriting here would make the mirror check compare against only
    // the last statement, so an increment adding a second grant to a table
    // already granted in 98 would either pass while the mirror was missing
    // columns, or demand the mirror DISAGREE with the database to stay green.
    //
    // No table has two grants today, so this is a trap rather than a live
    // defect - but incr/0004 already proved increments carry their own grants,
    // and the first one that extends an existing table springs it.
    const prior = out.get(m[2]) ?? [];
    out.set(m[2], [...prior, ...cols.filter((c) => !prior.includes(c))]);
  }
  return out;
}

/**
 * Tables an increment RENAMEs away, as the name they no longer have.
 *
 * THE MIRROR DESCRIBES THE END STATE; the DDL text describes a journey. Until
 * incr/0026 those were the same thing, because no table had ever been renamed.
 * Now 98 legitimately grants on `yucer_core.contact` - correct, because at the
 * point 98 runs the table IS called contact - and by the end of the apply that
 * name does not exist, so demanding a mirror entry for it would demand the
 * mirror disagree with the database.
 *
 * The union in ddlGrants() is what makes this necessary rather than cosmetic:
 * grants accumulate across files, so the old name never falls out on its own.
 */
function renamedAway(): Set<string> {
  const out = new Set<string>();
  const re = /ALTER\s+TABLE\s+(\w+)\.(\w+)\s+RENAME\s+TO\s+(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(uncommented))) out.add(`${m[1]}.${m[2]}`);
  return out;
}

function ddlRevokes(): Set<string> {
  const out = new Set<string>();
  const re = /REVOKE\s+UPDATE\s+ON\s+(\w+\.\w+)\s+FROM\s+\w+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(uncommented))) out.add(m[1]);
  return out;
}

/**
 * Tables whose table-level GRANT never included UPDATE at all.
 *
 * A SECOND WAY TO BE APPEND-ONLY, and the guard was blind to it. Every table in
 * the original design got `GRANT SELECT, INSERT, UPDATE, DELETE` and then had
 * UPDATE revoked, so deriving the append-only set from REVOKE worked. A table
 * that is granted only what it needs in the first place - the tighter and
 * better shape - never appears in a REVOKE and was therefore invisible here.
 *
 * That is not hypothetical: it hid `yucer_field.commitment`, whose grant omits
 * UPDATE even though its own columns (status, met_at, waived_by_sub) exist to
 * be changed. Neither map mentioned the table, so the mirror could not warn
 * anybody, and the first code to close a commitment would have found out from
 * Postgres at runtime. Both mirrors agreeing says nothing when both are silent.
 */
function ddlGrantsWithoutUpdate(): Set<string> {
  const out = new Set<string>();
  const re = /GRANT\s+([A-Z,\s]+?)\s+ON\s+(\w+\.\w+)\s+TO\s+\w+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(uncommented))) {
    const privs = m[1].toUpperCase();
    if (!/\bUPDATE\b/.test(privs)) out.add(m[2]);
  }
  return out;
}

const gone = renamedAway();
// Drop every name a rename retired, from all three derivations at once: a table
// that does not exist at the end of the apply cannot be mirrored, cannot be
// append-only, and cannot be anything else either.
const grants = new Map([...ddlGrants()].filter(([t]) => !gone.has(t)));
const revokes = new Set([...ddlRevokes()].filter((t) => !gone.has(t)));
const neverUpdatable = new Set([...ddlGrantsWithoutUpdate()].filter((t) => !gone.has(t)));

test("the DDL was parsed at all - guards against a silently empty test", () => {
  assert.ok(grants.size > 10, `expected many GRANT UPDATE statements, parsed ${grants.size}`);
  assert.ok(revokes.size > 10, `expected many REVOKE UPDATE statements, parsed ${revokes.size}`);
  // Non-vacuity for the second derivation too. A regex that matched nothing
  // would make the append-only check pass by finding no tables to check.
  assert.ok(
    neverUpdatable.size > 0,
    `expected some table-level grants without UPDATE, parsed ${neverUpdatable.size}`,
  );
});

test("the rename filter sees the rename that exists, and only real ones", () => {
  // NON-VACUITY, and it matters more here than for the other parsers: a regex
  // that matched nothing would filter nothing, every assertion below would go
  // on passing, and the filter would look like it worked until the next rename.
  assert.ok(gone.has("yucer_core.contact"), `renamedAway() saw ${[...gone].join(", ") || "nothing"}`);
  // And it must not be greedy - a table still in use must never be filtered
  // out, or its mirror stops being checked at all.
  assert.ok(!gone.has("yucer_core.account"));
  assert.ok(!gone.has("yucer_core.person"));
});

test("every table with a grant mirrors that grant exactly, column for column", () => {
  for (const [table, cols] of grants) {
    const mirrored = WRITABLE_COLUMNS[table];
    assert.ok(mirrored, `${table} has a GRANT UPDATE in the DDL but no mirror entry`);
    assert.deepEqual(
      [...mirrored].sort(),
      [...cols].sort(),
      `${table} writable columns differ between the DDL and the mirror`,
    );
  }
});

test("the mirror invents nothing the DDL does not grant", () => {
  for (const table of Object.keys(WRITABLE_COLUMNS)) {
    assert.ok(grants.has(table), `${table} is writable in the mirror but has no GRANT UPDATE in the DDL`);
  }
});

test("every table the DDL cannot UPDATE is listed as append-only", () => {
  // Both routes to append-only: granted-then-revoked, and never granted at all.
  // A table with a column-level GRANT UPDATE is writable by either route.
  const appendOnlyFromDdl = [...new Set([...revokes, ...neverUpdatable])]
    .filter((t) => !grants.has(t))
    .sort();
  assert.deepEqual([...APPEND_ONLY_TABLES].sort(), appendOnlyFromDdl);
});

test("a table is never both writable and append-only", () => {
  for (const t of APPEND_ONLY_TABLES) {
    assert.equal(WRITABLE_COLUMNS[t], undefined, `${t} is in both categories`);
  }
});

test("the four product append-only tables the spec names are all present", () => {
  for (const t of [
    "yucer_core.account_relation",
    "yucer_pipeline.opportunity_stage_event",
    "yucer_pipeline.forecast_snapshot",
    "yucer_agent.agent_message",
  ]) {
    assert.ok(isAppendOnly(t), `${t} must be append-only`);
  }
});

// --- The attribution and proposal freezes, asserted by name -----------------

test("attribution keys are absent from every writable list", () => {
  // Allowing these to be edited is allowing credit for revenue to be reassigned
  // after everyone can see which allocation pays better.
  assert.ok(!writableColumns("yucer_pipeline.lead").includes("signal_id"));
  assert.ok(!writableColumns("yucer_pipeline.lead").includes("campaign_id"));
  assert.ok(!writableColumns("yucer_pipeline.opportunity").includes("campaign_id"));
  assert.ok(!writableColumns("yucer_pipeline.opportunity").includes("account_id"));
});

test("signal evidence is frozen and only the resolution is writable", () => {
  const cols = writableColumns("yucer_pipeline.signal");
  // targeting is writable (ADR-016) and the evidence is not: re-mining can
  // reclassify WHY we were looking, and a signal matched to an account after
  // the fact moves from product_domain to named_account. What was published,
  // when, and by whom cannot move at all.
  assert.deepEqual([...cols].sort(), ["account_id", "score", "status", "targeting", "updated_at"]);
  for (const evidence of ["source", "source_ref", "signal_type", "subject", "payload", "detected_at"]) {
    assert.ok(!cols.includes(evidence), `${evidence} must stay frozen`);
  }
});

test("the copilot proposal is frozen and only the human decision is writable", () => {
  const cols = writableColumns("yucer_agent.agent_action");
  for (const frozen of ["payload", "rationale", "confidence"]) {
    assert.ok(!cols.includes(frozen), `${frozen} must stay frozen`);
  }
  for (const movable of ["status", "decided_by_sub", "decided_at", "executed_at"]) {
    assert.ok(cols.includes(movable), `${movable} must be writable`);
  }
});

test("planning keys stay writable while anchors do not", () => {
  const cols = writableColumns("yucer_pipeline.opportunity");
  for (const c of ["plan_id", "territory_id", "owner_sub"]) assert.ok(cols.includes(c), c);
  for (const c of ["opportunity_no", "workspace_id", "created_at"]) assert.ok(!cols.includes(c), c);
});

test("the sales target scope tuple is not writable", () => {
  const cols = writableColumns("yucer_gtm.sales_target");
  for (const c of ["period", "scope_type", "territory_id", "owner_sub", "metric"]) {
    assert.ok(!cols.includes(c), `${c} is part of the target identity`);
  }
});

test("no writable list contains an anchor column", () => {
  for (const [table, cols] of Object.entries(WRITABLE_COLUMNS)) {
    for (const anchor of ["id", "workspace_id", "created_at"]) {
      assert.ok(!cols.includes(anchor), `${table} must not allow writing ${anchor}`);
    }
    // TWO KINDS OF "code", and only one of them is an anchor.
    //
    // account_no and opportunity_no are numbers THIS SYSTEM ASSIGNS. They are
    // the row's identity to every human who quotes one, so they are immutable
    // and the pattern catches them.
    //
    // segment_code and credit_code are numbers THE WORLD ASSIGNED that we
    // record. A classification changes when the segmentation does; a credit
    // code is usually unknown when the prospect is created and filled in later,
    // and occasionally mistyped. Freezing it would mean a customer whose code
    // nobody had yet could never have one - and "nobody has it yet" is the
    // normal state of every new prospect.
    //
    // credit_code is UNIQUE per live row (uidx_account_ws_credit_code), which
    // makes it identity-LIKE and is exactly why it needed arguing rather than
    // exempting quietly: uniqueness stops two customers claiming one entity, it
    // does not mean the value was ours to assign.
    const ANCHOR_EXEMPT = new Set(["segment_code", "credit_code"]);
    const businessNumber = cols.find((c) => /_(no|code)$/.test(c) && !ANCHOR_EXEMPT.has(c));
    assert.equal(businessNumber, undefined, `${table} must not allow writing ${businessNumber}`);
  }
});

// --- assertWritable ---------------------------------------------------------

test("a patch of writable columns passes, in either naming style", () => {
  assert.ok(assertWritable("yucer_core.account", { name: "n", health_score: 70 }).ok);
  // Prisma builds camelCase; the DDL speaks snake_case. Both are accepted so a
  // caller never has a reason to skip the check.
  assert.ok(assertWritable("yucer_core.account", { healthScore: 70, ownerSub: "u" }).ok);
});

test("a patch touching a locked column is refused with the reason", () => {
  // `created_at` rather than `campaignId`: since 2026-08-31 the attribution
  // columns carry their own sentence from FROZEN_COLUMN_REASON, so asserting
  // the GENERIC wording has to use a column that has no sentence of its own.
  // The reasoned path is covered below.
  const r = assertWritable("yucer_pipeline.opportunity", { createdAt: new Date() });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "column_not_writable");
  assert.match(r.ok === false ? r.violations[0].message : "", /permission denied/);
});

test("every offending column is reported, not just the first", () => {
  const r = assertWritable("yucer_pipeline.signal", { source: "x", payload: {}, detectedAt: new Date() });
  assert.equal(r.ok === false && r.violations.length, 3);
});

test("any update to an append-only table is refused", () => {
  const r = assertWritable("yucer_pipeline.forecast_snapshot", { commitAmount: 1 });
  assert.equal(r.ok === false && r.violations[0].code, "append_only_table");
  // An empty patch is a no-op, not a violation.
  assert.ok(assertWritable("yucer_pipeline.forecast_snapshot", {}).ok);
});

test("an unknown table is an error, never a silent pass", () => {
  // A typo that allowed every column would defeat the point of this module.
  const r = assertWritable("yucer_pipeline.opportunitys", { name: "n" });
  assert.equal(r.ok === false && r.violations[0].code, "unknown_table");
});

// --- pickWritable -----------------------------------------------------------

test("pickWritable keeps the safe subset and reports what it dropped", () => {
  const { patch, dropped } = pickWritable("yucer_pipeline.opportunity", {
    name: "renamed",
    amount: 100,
    campaignId: "c",
    accountId: "a",
  });
  assert.deepEqual(Object.keys(patch).sort(), ["amount", "name"]);
  assert.deepEqual(dropped.sort(), ["accountId", "campaignId"]);
});

test("pickWritable drops everything for an append-only table", () => {
  const { patch, dropped } = pickWritable("yucer_agent.agent_message", { content: "edited" });
  assert.deepEqual(patch, {});
  assert.deepEqual(dropped, ["content"]);
});

test("toSnakeCase maps Prisma fields onto DDL columns", () => {
  assert.equal(toSnakeCase("expectedCloseAt"), "expected_close_at");
  assert.equal(toSnakeCase("decidedBySub"), "decided_by_sub");
  assert.equal(toSnakeCase("status"), "status");
});

/**
 * EVERY GRANTED COLUMN MUST EXIST.
 *
 * The parity tests above prove mirror == DDL. They do NOT prove DDL == the
 * schema, and on 2026-08-26 that gap let a real defect through: incr/0010
 * granted UPDATE on `price_book_entry (list_price, floor_price, status,
 * updated_at)` and the mirror matched it exactly - both wrong together, both
 * green. The table has neither `status` nor `updated_at`, so db-init would have
 * died on `column "status" ... does not exist`, in production, at deploy time.
 *
 * Two mirrors of each other agreeing says nothing about whether either is true.
 * This test is the third point of reference: the CREATE TABLE statements.
 */
const CREATE_FILES = [
  join(ROOT, "deploy/database/ddl/00_baseline.sql"),
  ...readdirSync(join(ROOT, "deploy/database/ddl/incr"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(ROOT, "deploy/database/ddl/incr", f)),
];

function declaredColumns(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const all = CREATE_FILES.map((f) => readFileSync(f, "utf8")).join("\n");

  const create = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\n\);/gi;
  for (const m of all.matchAll(create)) {
    const cols = new Set<string>();
    for (const line of m[2]!.split("\n")) {
      const t = line.trim();
      // Column definitions only. A constraint or table-level clause starts with
      // a keyword; a column starts with its own name.
      if (!t || t.startsWith("--")) continue;
      if (/^(constraint|primary|unique|foreign|check|references)\b/i.test(t)) continue;
      const name = t.match(/^([a-z_]+)\s/i);
      if (name) cols.add(name[1]!.toLowerCase());
    }
    out.set(m[1]!.toLowerCase(), cols);
  }

  // ALTER TABLE ... ADD COLUMN declares columns too, and it is read PER
  // STATEMENT rather than across the joined text. A lazy `[\s\S]*?` between
  // "ALTER TABLE x" and "ADD COLUMN" bridges a semicolon happily, so an ALTER
  // that only adds a CONSTRAINT swallows the next file's ADD COLUMN and files
  // that column under the wrong table - which then reports a column that really
  // exists as missing. That false positive appeared on the first run against
  // `yucer_core.account.tier`. Splitting on `;` gives each statement its own
  // universe.
  for (const stmt of all.split(";")) {
    const t = stmt.match(/ALTER TABLE\s+([a-z_]+\.[a-z_]+)/i);
    if (!t) continue;
    const table = t[1]!.toLowerCase();
    for (const c of stmt.matchAll(/ADD COLUMN(?: IF NOT EXISTS)?\s+([a-z_]+)/gi)) {
      if (!out.has(table)) out.set(table, new Set());
      out.get(table)!.add(c[1]!.toLowerCase());
    }
  }
  return out;
}

test("every granted column exists in the table it is granted on", () => {
  const declared = declaredColumns();
  assert.ok(declared.size > 20, `only ${declared.size} tables parsed - the regex broke`);

  const missing: string[] = [];
  // `grants` is a Map. The first version of this test used Object.entries on
  // it, which yields [] - so the loop never ran and the test passed vacuously,
  // which is precisely the failure the first test in this file exists to
  // prevent. It was caught by putting the bad column back and watching this
  // stay green. A test that cannot be made to fail is not a test.
  let checked = 0;
  for (const [table, cols] of grants) {
    const known = declared.get(table.toLowerCase());
    // Platform-reserved tables may be created outside this repo's DDL.
    if (!known || known.size === 0) continue;
    for (const c of cols) {
      checked += 1;
      if (!known.has(c.toLowerCase())) missing.push(`${table}.${c}`);
    }
  }
  assert.ok(checked > 50, `only ${checked} columns checked - the loop went empty`);
  assert.deepEqual(
    missing,
    [],
    `granted on columns that do not exist - db-init would fail on these: ${missing.join(", ")}`,
  );
});

// --- The frozen-column reasons ---------------------------------------------
//
// FROZEN_COLUMN_REASON absorbed six guards on 2026-08-31 - two in attribution,
// one each in scoring, action, revenue and target - every one of which refused
// a patch touching a column this module already refuses. They were a second
// answer to one question. What they had that the generic refusal did not was
// the reason, so the reason moved here and the guards went.
//
// A reason is a comment unless something proves it can fire. These three tests
// are that proof, against the same three reference points the mirror itself
// uses: the reason's column must EXIST in the DDL, must be ABSENT from the
// writable list, and the sentence must actually reach the violation.

test("every frozen-column reason names a column that exists in the DDL", () => {
  // Otherwise it is a comment pretending to be a rule: a typo'd column can
  // never appear in a patch, so its reason would never print and nothing would
  // ever say so. The same third-reference-point argument the mirror uses.
  const declared = declaredColumns();
  const missing: string[] = [];

  for (const key of Object.keys(FROZEN_COLUMN_REASON)) {
    const i = key.lastIndexOf(".");
    const table = key.slice(0, i);
    const column = key.slice(i + 1);
    if (!declared.get(table)?.has(column)) missing.push(key);
  }

  assert.deepEqual(missing, [], `these frozen-column reasons name a column no CREATE TABLE or ALTER TABLE declares: ${missing.join(", ")}`);
});

test("every frozen-column reason names a column that is actually frozen", () => {
  // A reason on a WRITABLE column is worse than none: assertWritable would pass
  // the patch, the sentence would never appear, and this file would read as
  // though the column were protected.
  const wrong: string[] = [];

  for (const key of Object.keys(FROZEN_COLUMN_REASON)) {
    const i = key.lastIndexOf(".");
    const table = key.slice(0, i);
    const column = key.slice(i + 1);
    if (WRITABLE_COLUMNS[table]?.includes(column)) wrong.push(key);
  }

  assert.deepEqual(wrong, [], `these columns carry a "frozen" reason and are in the writable list: ${wrong.join(", ")}`);
});

test("the reason reaches the refusal, for every column that has one", () => {
  // The six deleted guards each proved this for their own columns. One test
  // now proves it for all of them, and for any added later without anyone
  // remembering to write a test.
  for (const [key, why] of Object.entries(FROZEN_COLUMN_REASON)) {
    const i = key.lastIndexOf(".");
    const table = key.slice(0, i);
    const column = key.slice(i + 1);

    const r = assertWritable(table, { [column]: "x" });
    assert.equal(r.ok, false, `${key} should be refused`);
    if (r.ok) continue;
    assert.equal(r.violations[0].code, "column_not_writable", key);
    assert.ok(
      r.violations[0].message.includes(why),
      `${key}: the refusal must carry its reason, got "${r.violations[0].message}"`,
    );
  }
});

test("a frozen column is refused in camelCase too, reason and all", () => {
  // Adapters build patches in Prisma's casing. A reason that only fired for
  // snake_case would miss every real caller.
  const r = assertWritable("yucer_pipeline.opportunity", { campaignId: "camp_1" });
  assert.equal(r.ok, false);
  assert.ok(r.ok || r.violations[0].message.includes("attribution record"));
});

test("a column with no reason still gets the generic refusal", () => {
  // Most frozen columns have no sentence of their own and do not need one -
  // `created_at` is frozen because it is a timestamp nobody edits, which the
  // generic message already says well enough.
  const r = assertWritable("yucer_pipeline.opportunity", { created_at: new Date() });
  assert.equal(r.ok, false);
  assert.ok(r.ok || r.violations[0].message.includes("permission denied at the database"));
});
