#!/usr/bin/env node
/**
 * check-incr-grants.mjs - a table created in an increment must carry its own grants.
 *
 * THE FAILURE THIS PREVENTS, which is silent and total:
 *
 *   97_service_role.sql grants with `GRANT ... ON ALL TABLES IN SCHEMA`, and
 *   Postgres evaluates that AT GRANT TIME. There is no ALTER DEFAULT PRIVILEGES
 *   anywhere in this repo. So a table created after 97 has run - which is every
 *   table created by an increment, since db-init applies 00 -> 97 -> 98 -> incr/*
 *   - has NO privileges for the service role at all.
 *
 *   Not "writes fail". Nothing works: no SELECT, no INSERT, no DELETE. And it
 *   fails at runtime against a database that applied cleanly, so db-init reports
 *   success and the product is broken.
 *
 *   The same ordering means 98_column_locks.sql cannot carry the locks either:
 *   its REVOKE would run against a table that does not exist yet and db-init
 *   would die on the spot.
 *
 * So the rule is: an increment that creates a table also grants on it, in the
 * same file. This asserts it.
 *
 * Neither of the two conditions has ever fired, because increments 0001-0003
 * carry data and constraints and have never created a table. The first one that
 * does would hit both at once.
 *
 * Pure node, zero dependencies.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const INCR_DIR = "deploy/database/ddl/incr";
const DDL_DIR = "deploy/database/ddl";
const STRICT = process.argv.includes("--strict");

/** Strip line comments so a commented-out statement never counts as real. */
export function uncommented(text) {
  return text
    .split("\n")
    .map((l) => {
      const i = l.indexOf("--");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

export function tablesCreated(sql) {
  const set = new Set();
  const re = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)\.(\w+)/gi;
  let m;
  while ((m = re.exec(sql))) set.add(`${m[1]}.${m[2]}`);
  return set;
}

/**
 * Tables this file grants ANY privilege on, to anyone.
 *
 * Split on statements FIRST, then match inside each one. Scanning the whole
 * file for `GRANT ... ON x.y` with a lazy any-character run backtracks
 * super-linearly, which is a poor property for something CI runs on every push -
 * and a privilege list never spans a semicolon anyway, so the split is free.
 */
export function tablesGranted(sql) {
  const set = new Set();
  for (const statement of sql.split(";")) {
    if (!/^\s*GRANT\b/i.test(statement)) continue;
    const re = /\bON\s+(?:TABLE\s+)?(\w+)\.(\w+)/gi;
    let m;
    while ((m = re.exec(statement))) set.add(`${m[1]}.${m[2]}`);
  }
  return set;
}

/**
 * Columns 98_column_locks.sql grants UPDATE on, as `schema.table.column`.
 *
 * TABLE-QUALIFIED, and that is the whole point of this function existing. The
 * first version of this check collected bare column NAMES from 98 and bare
 * names from the increments, so it compared `parent_id` to `parent_id` across
 * two unrelated tables. 98 has granted `yucer_gtm.territory.parent_id` since
 * baseline; the day an increment added `yucer_core.account.parent_id` the check
 * reported a deploy-killing bug that was not there.
 *
 * A guard that cries wolf is spent: the next person to see it red assumes the
 * same false positive and merges past a real one. Common column names - `name`,
 * `status`, `parent_id` - are exactly the ones that recur across tables, so the
 * false positives were not going to be rare.
 */
export function grantedColumns(locksSql) {
  const set = new Set();
  for (const statement of uncommented(locksSql).split(";")) {
    if (!/^\s*GRANT\b/i.test(statement)) continue;
    const cols = statement.match(/GRANT\s+UPDATE\s*\(([^)]*)\)/i);
    const on = statement.match(/\bON\s+(?:TABLE\s+)?(\w+)\.(\w+)/i);
    if (!cols || !on) continue;
    for (const c of cols[1].split(",")) {
      const name = c.trim();
      if (name) set.add(`${on[1]}.${on[2]}.${name}`);
    }
  }
  return set;
}

/**
 * Columns an increment adds, as `schema.table.column`.
 *
 * ONE ALTER TABLE MAY ADD SEVERAL COLUMNS - `ADD COLUMN a, ADD COLUMN b` is one
 * statement and incr/0024 uses that form - so every ADD COLUMN in a statement
 * belongs to that statement's table, not just the first.
 */
export function addedColumns(incrSql) {
  const set = new Set();
  for (const statement of uncommented(incrSql).split(";")) {
    const on = statement.match(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)\.(\w+)/i);
    if (!on) continue;
    for (const m of statement.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) {
      set.add(`${on[1]}.${on[2]}.${m[1]}`);
    }
  }
  return set;
}

/** Every `file adds X, but 98 grants it` finding, table-qualified. */
export function lateColumnGrants(locksSql, increments) {
  const granted = grantedColumns(locksSql);
  const out = [];
  for (const { file, sql } of increments) {
    for (const col of addedColumns(sql)) {
      if (granted.has(col)) out.push(`${file} adds ${col}, but 98 grants it`);
    }
  }
  return out;
}

export function auditIncrement(sql) {
  const clean = uncommented(sql);
  const created = tablesCreated(clean);
  const granted = tablesGranted(clean);
  // Explicit comparator: these are strings, so the default would be correct -
  // but the default coerces, and that is a real bug the day this sorts numbers.
  return [...created].filter((t) => !granted.has(t)).sort((a, b) => a.localeCompare(b));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let files;
  try {
    files = readdirSync(INCR_DIR).filter((f) => f.endsWith(".sql")).sort();
  } catch (e) {
    console.log(`[incr-grants] skip: ${e.message}`);
    process.exit(0);
  }

  const offenders = [];
  let createdTotal = 0;

  // THE OTHER HALF OF THE SAME ORDERING, and the one that actually fired.
  //
  // 98 runs BEFORE incr/, so it may only name columns that exist by then. On
  // 2026-08-30 a grant for `engagement_type` - a column increment 0018 adds -
  // went into 98, and db-init died on
  //
  //   ERROR: column "engagement_type" of relation "project" does not exist
  //
  // taking the whole apply down. The existing check covers tables created by an
  // increment; nothing covered COLUMNS added by one, and the failure mode is
  // identical: a file granting something that is not there yet.
  // NOT wrapped in a try that returns "". The first version of this check was,
  // and DDL_DIR was undefined - so the read threw, the catch swallowed it, the
  // granted-column set was empty and the check passed on the very input it was
  // written for. A guard that cannot fail is worse than no guard: it reports
  // safety. If 98 is unreadable, that is itself the finding.
  const lateColumns = lateColumnGrants(
    readFileSync(join(DDL_DIR, "98_column_locks.sql"), "utf8"),
    files.map((f) => ({ file: f, sql: readFileSync(join(INCR_DIR, f), "utf8") })),
  );
  for (const f of files) {
    const missing = auditIncrement(readFileSync(join(INCR_DIR, f), "utf8"));
    createdTotal += tablesCreated(uncommented(readFileSync(join(INCR_DIR, f), "utf8"))).size;
    for (const t of missing) offenders.push(`${f}: ${t}`);
  }

  if (lateColumns.length > 0) {
    console.error("[incr-grants] 98_column_locks.sql grants a column an increment adds later:");
    for (const o of lateColumns) console.error(`  ${o}`);
    console.error(
      "\n  98 runs BEFORE incr/, so the GRANT names a column that does not exist\n" +
        "  yet and db-init dies on the spot. Keep 98 at the pre-increment baseline\n" +
        "  and let the increment re-state the full GRANT for its table.",
    );
    process.exit(STRICT ? 1 : 0);
  }

  if (offenders.length === 0) {
    console.log(
      `[incr-grants] OK - ${files.length} increment(s), ${createdTotal} table(s) created, all granted in place.`,
    );
    process.exit(0);
  }

  console.error("[incr-grants] a table was created in an increment without granting on it:");
  for (const o of offenders) console.error(`  ${o}`);
  console.error(
    "\n  db-init applies 00 -> 97 -> 98 -> incr/*. GRANT ON ALL TABLES in 97 is\n" +
      "  evaluated at grant time, so a table created later has NO privileges for\n" +
      "  the service role - it fails at runtime against a database that applied\n" +
      "  cleanly. Put the GRANT (and any column locks) in the same increment.",
  );
  process.exit(STRICT ? 1 : 0);
}
