import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  APPEND_ONLY_TABLES,
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

function ddlRevokes(): Set<string> {
  const out = new Set<string>();
  const re = /REVOKE\s+UPDATE\s+ON\s+(\w+\.\w+)\s+FROM\s+\w+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(uncommented))) out.add(m[1]);
  return out;
}

const grants = ddlGrants();
const revokes = ddlRevokes();

test("the DDL was parsed at all - guards against a silently empty test", () => {
  assert.ok(grants.size > 10, `expected many GRANT UPDATE statements, parsed ${grants.size}`);
  assert.ok(revokes.size > 10, `expected many REVOKE UPDATE statements, parsed ${revokes.size}`);
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

test("every revoked-and-never-granted table is listed as append-only", () => {
  const appendOnlyFromDdl = [...revokes].filter((t) => !grants.has(t)).sort();
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
    const businessNumber = cols.find((c) => /_(no|code)$/.test(c) && c !== "segment_code");
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
  const r = assertWritable("yucer_pipeline.opportunity", { campaignId: "c" });
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
