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
// So: resolve properly, and then VERIFY. Every rewritten path must exist on
// disk or this exits non-zero. A coverage report the scanner cannot match is
// worse than no report, because it comes back as a number rather than a gap.
//
// Usage: node scripts/ci/lcov-to-repo-root.mjs <lcov-file> <dir-it-is-relative-to>

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const [file, base] = process.argv.slice(2);
if (!file || !base) {
  console.error("usage: lcov-to-repo-root.mjs <lcov-file> <base-dir>");
  process.exit(2);
}

const root = process.cwd();
const lines = readFileSync(file, "utf8").split("\n");
const missing = [];
let rewritten = 0;

const out = lines.map((line) => {
  if (!line.startsWith("SF:")) return line;
  const absolute = resolve(root, base, line.slice(3).trim());
  const fromRoot = relative(root, absolute).split(sep).join("/");
  if (!existsSync(absolute)) missing.push(fromRoot);
  rewritten += 1;
  return `SF:${fromRoot}`;
});

if (missing.length > 0) {
  console.error(
    `refusing to write a report the scanner cannot match - ${missing.length} of ` +
      `${rewritten} paths do not exist:\n  ${missing.join("\n  ")}`,
  );
  process.exit(1);
}

writeFileSync(file, out.join("\n"));
console.log(`[lcov] rewrote ${rewritten} paths relative to the repo root`);
