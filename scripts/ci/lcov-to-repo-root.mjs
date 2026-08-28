#!/usr/bin/env node
// Rewrite an lcov report's file paths to be repo-root relative.
//
// WHY THIS IS A SCRIPT AND NOT A `sed` IN THE WORKFLOW. Node writes SF: paths
// relative to its own cwd, which is the workspace that ran the tests; the Sonar
// scanner resolves them against the project base dir, which is the repo root.
// The obvious one-liner - prefixing `portals/app/` - is right for 109 of the
// 111 paths this repo currently emits and WRONG for the two that leave the
// workspace:
//
//   ../packages/shared/src/brand.ts
//   ../../scripts/guardrails/check-data-architecture.mjs
//
// A prefixed `..` path resolves to nothing, Sonar matches no file, and the
// coverage for it is silently dropped. Silently: an lcov entry that matches
// nothing is not an error to the scanner, it is simply absent from the report -
// which is the same wrong answer TD-015 started from, reached a different way.
//
// So: resolve properly, and then VERIFY. Every rewritten path must exist or the
// CLI exits non-zero. A coverage report the scanner cannot match is worse than
// no report, because it comes back as a number rather than as a gap.
//
// Usage: node scripts/ci/lcov-to-repo-root.mjs <lcov-file> <dir-it-is-relative-to>

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, resolve, sep } from "node:path";

/**
 * The whole transform, as a pure function of its inputs.
 *
 * `exists` is injected rather than closed over so the rule can be tested
 * without a fixture tree on disk - the interesting cases are a path that
 * escapes the base directory and a path that resolves to nothing, and both are
 * awkward to stage as real files.
 */
export function rewriteLcov(text, { root, base, exists = existsSync }) {
  const missing = [];
  let rewritten = 0;

  const out = text.split("\n").map((line) => {
    if (!line.startsWith("SF:")) return line;
    const absolute = resolve(root, base, line.slice(3).trim());
    const fromRoot = relative(root, absolute).split(sep).join("/");
    if (!exists(absolute)) missing.push(fromRoot);
    rewritten += 1;
    return `SF:${fromRoot}`;
  });

  return { text: out.join("\n"), rewritten, missing };
}

/**
 * The CLI's own decisions, as a function that RETURNS an exit code.
 *
 * Split out for the same reason `rewriteLcov` is: the interesting behaviour
 * here is not the parsing, it is choosing between writing the report and
 * refusing to. A `process.exit` buried in a top-level block can only be
 * exercised by spawning the script, and coverage is per-process - a spawned
 * child proves the behaviour and reports none of it, which is how a file ends
 * up green in CI and untested in fact.
 */
export function run(args, io) {
  const [file, base] = args;
  if (!file || !base) {
    io.error("usage: lcov-to-repo-root.mjs <lcov-file> <base-dir>");
    return 2;
  }

  const result = rewriteLcov(io.readFile(file), {
    root: io.cwd,
    base,
    exists: io.exists,
  });

  if (result.missing.length > 0) {
    io.error(
      `[lcov] refusing to write a report the scanner cannot match - ` +
        `${result.missing.length} of ${result.rewritten} paths do not exist:\n  ` +
        result.missing.join("\n  "),
    );
    return 1;
  }

  io.writeFile(file, result.text);
  io.log(`[lcov] rewrote ${result.rewritten} paths relative to the repo root`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(
    run(process.argv.slice(2), {
      cwd: process.cwd(),
      readFile: (f) => readFileSync(f, "utf8"),
      writeFile: (f, text) => writeFileSync(f, text),
      exists: existsSync,
      log: (m) => console.log(m),
      error: (m) => console.error(m),
    }),
  );
}
