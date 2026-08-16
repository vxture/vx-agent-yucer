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

/** Tables this file grants ANY privilege on, to anyone. */
export function tablesGranted(sql) {
  const set = new Set();
  const re = /GRANT\s+[^;]*?\bON\s+(?:TABLE\s+)?(\w+)\.(\w+)/gi;
  let m;
  while ((m = re.exec(sql))) set.add(`${m[1]}.${m[2]}`);
  return set;
}

export function auditIncrement(sql) {
  const clean = uncommented(sql);
  const created = tablesCreated(clean);
  const granted = tablesGranted(clean);
  return [...created].filter((t) => !granted.has(t)).sort();
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

  for (const f of files) {
    const missing = auditIncrement(readFileSync(join(INCR_DIR, f), "utf8"));
    createdTotal += tablesCreated(uncommented(readFileSync(join(INCR_DIR, f), "utf8"))).size;
    for (const t of missing) offenders.push(`${f}: ${t}`);
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
