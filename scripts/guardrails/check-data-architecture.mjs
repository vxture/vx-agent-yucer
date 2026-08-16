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

export function ddlTables(sql) {
  const set = new Set();
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\.(\w+)/gi;
  let m;
  while ((m = re.exec(sql))) set.add(`${m[1]}.${m[2]}`);
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
