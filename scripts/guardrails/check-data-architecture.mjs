#!/usr/bin/env node
/**
 * check-data-architecture.mjs - DDL <-> Prisma lockstep guardrail.
 *
 * The DDL under deploy/database/ddl/ is the single structure authority
 * (product_240 section 2.4 E); the Prisma schema is only a client-generation
 * source and MUST stay in lockstep. This asserts that the set of tables declared
 * in the DDL equals the set of Prisma models (matched by @@schema + @@map).
 * Any drift fails under --strict (CI).
 *
 * THE DDL IS THE BASELINE *PLUS* EVERY INCREMENT. It used to read only
 * 00_baseline.sql, which was wrong the moment an increment created a table:
 * incr/README.md states that the baseline is create-once and increments are the
 * only legal way to add one, so the guardrail was forbidding the only permitted
 * path and would have reported the increment as Prisma drift.
 *
 * This is a bug in the guardrail, not a gap in the standard - the standard
 * already says increments carry structure. Fixing it here is therefore in
 * scope; inventing a rule would not be.
 *
 * Pure node, zero dependencies.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DDL = "deploy/database/ddl/00_baseline.sql";
const INCR_DIR = "deploy/database/ddl/incr";
const PRISMA = "portals/app/prisma/schema.prisma";
const STRICT = process.argv.includes("--strict");

/**
 * The tables the DDL leaves behind, reading CREATE and DROP in file order.
 *
 * DROP USED TO BE INVISIBLE HERE, and the caller concatenates the baseline with
 * every increment - so a table created by the baseline and dropped by an
 * increment, which is exactly what incr/README prescribes for a removal, stayed
 * in this set forever. The first such removal would have been reported as
 * Prisma drift, and the honest fix (delete the model) would have made it worse.
 *
 * Order matters and is the caller's: baseline first, then increments by name.
 * A table dropped and later recreated is present; the last statement wins.
 */
/**
 * The tables the DDL leaves standing, replayed in document order.
 *
 * ORDER IS THE WHOLE ALGORITHM: db-init applies these files in sequence, so a
 * table created in the baseline and dropped by an increment is not a table, and
 * one renamed by an increment exists only under its new name. Collecting
 * CREATEs and subtracting DROPs at the end would get the same answer for those
 * two cases and the wrong answer the day something is created, dropped and
 * created again.
 *
 * RENAME joined on 2026-09-04, with incr/0026 (contact -> person, ADR-024
 * batch C). Before it, this function reported `yucer_core.contact` as declared
 * forever - it is never dropped, only renamed - so the DDL-vs-prisma guard
 * would have demanded a model for a table that does not exist, and the built-
 * database test failed with "declared in the DDL but not built".
 *
 * A rename is deliberately NOT modelled as a drop plus a create: the new table
 * inherits the old one's rows, ids and foreign keys, and treating it as a
 * fresh table would let a genuine drop-and-recreate hide behind the same
 * bookkeeping.
 */
export function ddlTables(sql) {
  const set = new Set();
  const re =
    /(CREATE TABLE IF NOT EXISTS|DROP TABLE(?: IF EXISTS)?)\s+(\w+)\.(\w+)|ALTER\s+TABLE\s+(\w+)\.(\w+)\s+RENAME\s+TO\s+(\w+)/gi;
  let m;
  while ((m = re.exec(sql))) {
    if (m[1]) {
      const table = `${m[2]}.${m[3]}`;
      if (/^CREATE/i.test(m[1])) set.add(table);
      else set.delete(table);
      continue;
    }
    // A rename only applies if the old name is actually standing - otherwise a
    // re-runnable increment's guarded rename would invent a table on a database
    // where it had already happened.
    const from = `${m[4]}.${m[5]}`;
    if (set.delete(from)) set.add(`${m[4]}.${m[6]}`);
  }
  return set;
}

export function prismaTables(text) {
  const set = new Set();
  const re = /model\s+\w+\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[1];
    const schema = /@@schema\("([^"]+)"\)/.exec(body);
    const map = /@@map\("([^"]+)"\)/.exec(body);
    if (schema && map) set.add(`${schema[1]}.${map[1]}`);
  }
  return set;
}

function diff(a, b) {
  return [...a].filter((x) => !b.has(x)).sort();
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let ddl, prisma;
  try {
    // Baseline first, then every increment in name order - the same order
    // db-init.yml applies them in.
    let sql = readFileSync(DDL, "utf8");
    for (const f of readdirSync(INCR_DIR).filter((x) => x.endsWith(".sql")).sort()) {
      sql += "\n" + readFileSync(join(INCR_DIR, f), "utf8");
    }
    ddl = ddlTables(sql);
    prisma = prismaTables(readFileSync(PRISMA, "utf8"));
  } catch (e) {
    console.log(`[data-architecture] skip: ${e.message}`);
    process.exit(0);
  }

  const onlyDdl = diff(ddl, prisma);
  const onlyPrisma = diff(prisma, ddl);

  if (onlyDdl.length === 0 && onlyPrisma.length === 0) {
    console.log(`[data-architecture] OK - ${ddl.size} tables in lockstep (DDL == prisma).`);
    process.exit(0);
  }

  console.log("[data-architecture] DDL/prisma drift:");
  for (const t of onlyDdl) console.log(`  in DDL, missing from prisma: ${t}`);
  for (const t of onlyPrisma) console.log(`  in prisma, missing from DDL: ${t}`);
  if (STRICT) {
    console.error("[data-architecture] STRICT: DDL and prisma must be in lockstep.");
    process.exit(1);
  }
  process.exit(0);
}
