#!/usr/bin/env node
// Merge two or more lcov reports into one.
//
// WHY THIS EXISTS (TD-020). This repo's test suites cannot run in the same
// process. `DATABASE_URL` flips prismaEnabled(), so with it set the unit suite
// is handed Prisma stores it was never written against and fails; without it
// every *.db.test.ts self-skips. ci.yml therefore splits them into two jobs -
// correctly - and the consequence is that NEITHER RUN ALONE IS THE COVERAGE OF
// THIS REPO. Until this script existed, Sonar was fed only the offline half:
// the half in which no Prisma adapter executes. Eleven files read 40+ points
// below their real coverage, `authz/prisma-store.ts` worst at 100% real
// against 7.7% reported, and a PR that added 94 passing db tests was failed
// for "0.0% Coverage on New Code".
//
// WHY NOT JUST PASS BOTH PATHS TO SONAR. `sonar.javascript.lcov.reportPaths`
// does take a comma-separated list, which is the one-line version of this file.
// It was not taken because its merge semantics for a file appearing in BOTH
// reports are not something this repo can verify - and "last report wins"
// rather than "sum the hits" would silently discard the unit run's coverage for
// every file both suites touch. That is the same shape of silent wrong answer
// lcov-to-repo-root.mjs exists to prevent. Merging here is a rule we can state,
// test, and check the output of before it reaches the scanner.
//
// MERGE SEMANTICS: counters SUM, the way `lcov -a` combines runs. A line, a
// function or a branch is covered if EITHER run reached it. The summary
// counters (LF/LH/FNF/FNH/BRF/BRH) are RECOMPUTED rather than added, because
// they count distinct entities and adding them would double every file the two
// runs share.
//
// Usage: node scripts/ci/merge-lcov.mjs <out> <in...>

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A branch's `taken` field is `-` when the block was never entered. */
function addTaken(a, b) {
  if (a === "-" && b === "-") return "-";
  return String((a === "-" ? 0 : Number(a)) + (b === "-" ? 0 : Number(b)));
}

function emptyRecord(sf) {
  // Maps, not arrays: merging is keyed lookup, and Map preserves insertion
  // order, so the output stays in first-seen order and diffs stay readable.
  return { sf, fn: new Map(), fnda: new Map(), da: new Map(), brda: new Map() };
}

function parseInto(records, text) {
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      const sf = line.slice(3);
      if (!records.has(sf)) records.set(sf, emptyRecord(sf));
      cur = records.get(sf);
    } else if (cur === null) {
      continue;
    } else if (line.startsWith("FN:")) {
      const i = line.indexOf(",");
      const name = line.slice(i + 1);
      // Keyed by name: FNDA carries only the name, so the name is what the two
      // halves can actually be matched on.
      if (!cur.fn.has(name)) cur.fn.set(name, line.slice(3, i));
    } else if (line.startsWith("FNDA:")) {
      const i = line.indexOf(",");
      const name = line.slice(i + 1);
      const count = Number(line.slice(5, i));
      cur.fnda.set(name, (cur.fnda.get(name) ?? 0) + count);
    } else if (line.startsWith("DA:")) {
      const [ln, count] = line.slice(3).split(",");
      cur.da.set(ln, (cur.da.get(ln) ?? 0) + Number(count));
    } else if (line.startsWith("BRDA:")) {
      const parts = line.slice(5).split(",");
      const key = parts.slice(0, 3).join(",");
      const taken = parts[3];
      cur.brda.set(key, cur.brda.has(key) ? addTaken(cur.brda.get(key), taken) : taken);
    } else if (line === "end_of_record") {
      cur = null;
    }
  }
}

function serialise(records) {
  const out = [];
  for (const r of records.values()) {
    out.push("TN:", `SF:${r.sf}`);
    for (const [name, ln] of r.fn) out.push(`FN:${ln},${name}`);
    for (const [name, count] of r.fnda) out.push(`FNDA:${count},${name}`);
    // Recomputed, never summed - see the header note.
    out.push(`FNF:${r.fn.size}`, `FNH:${[...r.fnda.values()].filter((c) => c > 0).length}`);
    for (const [key, taken] of r.brda) out.push(`BRDA:${key},${taken}`);
    if (r.brda.size > 0) {
      out.push(
        `BRF:${r.brda.size}`,
        `BRH:${[...r.brda.values()].filter((t) => t !== "-" && Number(t) > 0).length}`,
      );
    }
    for (const [ln, count] of r.da) out.push(`DA:${ln},${count}`);
    out.push(`LF:${r.da.size}`, `LH:${[...r.da.values()].filter((c) => c > 0).length}`);
    out.push("end_of_record");
  }
  return out.join("\n") + "\n";
}

/**
 * The whole transform, as a pure function of its inputs.
 *
 * Returns the merged text plus the counts the CLI needs to decide whether the
 * result is worth writing - a merge that produced nothing is the failure this
 * script is most likely to have, and it is invisible in the output itself.
 */
export function mergeLcov(texts) {
  const records = new Map();
  const perInput = texts.map((t) => {
    const before = records.size;
    parseInto(records, t);
    return { files: (t.match(/^SF:/gm) ?? []).length, added: records.size - before };
  });
  return { text: serialise(records), files: records.size, perInput };
}

/**
 * The CLI's own decisions, as a function that RETURNS an exit code.
 *
 * Split out for the same reason lcov-to-repo-root.mjs splits its own: a
 * `process.exit` in a top-level block can only be exercised by spawning the
 * script, and coverage is per-process - the spawned child proves the behaviour
 * and reports none of it.
 */
export function run(args, io) {
  const [out, ...inputs] = args;
  if (!out || inputs.length < 2) {
    io.error("usage: merge-lcov.mjs <out> <in> <in...>");
    return 2;
  }

  const missing = inputs.filter((f) => !io.exists(f));
  if (missing.length > 0) {
    io.error(`[lcov-merge] input missing: ${missing.join(", ")}`);
    return 1;
  }

  const result = mergeLcov(inputs.map((f) => io.readFile(f)));

  // An input that contributed no records at all is the failure mode worth
  // catching: if the db half silently produced an empty report, merging would
  // succeed, Sonar would read the offline half exactly as before, and TD-020
  // would be "fixed" while still being true.
  const empty = inputs.filter((_, i) => result.perInput[i].files === 0);
  if (empty.length > 0) {
    io.error(
      `[lcov-merge] refusing to write a merge that silently lost a half - ` +
        `no SF records in: ${empty.join(", ")}`,
    );
    return 1;
  }

  io.writeFile(out, result.text);
  io.log(
    `[lcov-merge] ${result.files} files from ${inputs.length} reports (` +
      inputs.map((f, i) => `${f}: ${result.perInput[i].files}`).join(", ") +
      `)`,
  );
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(
    run(process.argv.slice(2), {
      readFile: (f) => readFileSync(f, "utf8"),
      writeFile: (f, text) => writeFileSync(f, text),
      exists: existsSync,
      log: (m) => console.log(m),
      error: (m) => console.error(m),
    }),
  );
}
