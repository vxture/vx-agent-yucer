import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { asc, by, desc } from "./order";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOMAINS = join(HERE, "..");

// Ordering is a contract between the two adapters, not a detail of either.
//
// Several in-memory list methods used to return insertion order while their
// Prisma twins carried an ORDER BY, and three of them applied `limit` on top -
// so the same call returned different rows depending on which adapter was
// wired, and a passing service test proved nothing about production.

const rows = (...v: Array<number | null>) => v.map((x, i) => ({ v: x, i }));

test("asc puts nulls last, the way Postgres does", () => {
  const out = [...rows(3, null, 1)].sort(asc((r) => r.v));
  assert.deepEqual(out.map((r) => r.v), [1, 3, null]);
});

test("desc puts nulls FIRST by default, the way Postgres does", () => {
  // Recorded because it is surprising and because the product almost never
  // wants it - see the next test.
  const out = [...rows(3, null, 1)].sort(desc((r) => r.v));
  assert.deepEqual(out.map((r) => r.v), [null, 3, 1]);
});

test("a ranked list asks for nulls last, because no score is not a high score", () => {
  const out = [...rows(3, null, 1)].sort(desc((r) => r.v, { nulls: "last" }));
  assert.deepEqual(out.map((r) => r.v), [3, 1, null]);
});

test("by() breaks ties in order, so a limit is deterministic", () => {
  const data = [
    { a: 1, b: "z" },
    { a: 1, b: "a" },
    { a: 0, b: "m" },
  ];
  const out = [...data].sort(by(asc((r) => r.a), asc((r) => r.b)));
  assert.deepEqual(out.map((r) => `${r.a}${r.b}`), ["0m", "1a", "1z"]);
});

test("dates sort by instant, not by string", () => {
  const d = (s: string) => ({ at: new Date(s) });
  const out = [d("2026-02-01"), d("2026-01-15"), d("2026-03-01")].sort(asc((r) => r.at));
  assert.deepEqual(
    out.map((r) => r.at.toISOString().slice(0, 10)),
    ["2026-01-15", "2026-02-01", "2026-03-01"],
  );
});

test("comparators are stable enough to leave equal rows alone", () => {
  const data = rows(1, 1, 1);
  const out = [...data].sort(asc((r) => r.v));
  assert.deepEqual(out.map((r) => r.i), [0, 1, 2]);
});

// --- The adapters must not drift apart again -------------------------------

test("no ranked DESC is left on the Postgres default in either adapter", () => {
  // A bare `{ field: "desc" }` on a NULLABLE column silently ranks unknowns
  // above everything. This guard reads the Prisma adapters and requires the
  // nulls placement to be stated for the columns where it changes the answer.
  const NULLABLE_RANKED = ["score", "influence", "startsAt", "healthScore"];
  const offenders: string[] = [];

  for (const domain of ["signal", "account", "strategy", "pipeline", "delivery", "copilot", "planning"]) {
    let src: string;
    try {
      src = readFileSync(join(DOMAINS, domain, "prisma-store.ts"), "utf8");
    } catch {
      continue;
    }
    for (const field of NULLABLE_RANKED) {
      // `{ score: "desc" }` is the shape that takes the Postgres default.
      const bare = new RegExp(`\\{\\s*${field}:\\s*"desc"\\s*\\}`, "g");
      for (const m of src.matchAll(bare)) offenders.push(`${domain}/prisma-store.ts: ${m[0]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these rank a nullable column with Postgres' NULLS FIRST default:\n${offenders.join("\n")}`,
  );
});
