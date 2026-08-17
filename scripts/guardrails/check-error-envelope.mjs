#!/usr/bin/env node
// Guardrail: every refusal this product emits uses the L1 envelope (product_251
// X-1 / A-1), and every code in it is legal.
//
// This implements clause D-3, which asks each repo to machine-check the part of
// the conformance matrix that can be machine-checked, with the reason attached:
// "conformance written into a document is a snapshot, and it rots."
//
// Two things are checked, and neither needs the platform to be reachable:
//
//   1. NO BARE-STRING REFUSALS. `new Response("forbidden", {status: 403})` is
//      the shape A-1 names as forbidden - a body with no `code` at all, which a
//      consumer can only branch on by matching prose.
//   2. EVERY LITERAL CODE IS SCREAMING_SNAKE WITH A MODULE PREFIX. A one-word
//      code passes casing and still fails the clause, because the prefix is
//      what stops two modules meaning different things by FORBIDDEN.
//
// What it deliberately does NOT check: that `retryable` is present. That lives
// in the envelope() helper's signature, where the type system already refuses
// to build a body without it - a regex asserting the same thing would be a
// second, weaker copy of a rule already enforced properly.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appDir = join(repo, "portals/app/app");
const strict = process.argv.includes("--strict");

/**
 * Files answering a non-vxture protocol, where the L1 envelope is the wrong
 * shape. Each needs a reason, not just a path - an exclusion list without
 * reasons becomes the place defects go to hide.
 */
const EXCLUSIONS = [
  {
    path: "auth/backchannel-logout/route.ts",
    why: "answers the IdP under OIDC Back-Channel Logout 1.0; the caller does not speak the vxture envelope",
  },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const problems = [];
let codesSeen = 0;

for (const file of walk(appDir)) {
  const rel = relative(appDir, file).split("\\").join("/");
  if (EXCLUSIONS.some((e) => rel === e.path)) continue;
  const src = readFileSync(file, "utf8");

  // 1. Bare-string refusals.
  const bare =
    /new (?:Next)?Response\(\s*"([^"]*)"\s*,\s*\{\s*status:\s*([45]\d\d)/g;
  let m;
  while ((m = bare.exec(src))) {
    problems.push(
      `${rel}: returns the bare string "${m[1]}" with status ${m[2]} - A-1 requires a structured body with a code`,
    );
  }

  // 2. Codes passed to the envelope helpers must be legal.
  const call = /(?:errorResponse\(\s*\d+\s*,|envelope\(|violationEnvelope\(\s*[^,]+,)\s*"([^"]+)"/g;
  while ((m = call.exec(src))) {
    const code = m[1];
    codesSeen += 1;
    if (!/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(code)) {
      problems.push(
        `${rel}: error code "${code}" is not SCREAMING_SNAKE with a module prefix (X-1)`,
      );
    }
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`[error-envelope] ${p}`);
  console.error(
    "[error-envelope] Use errorResponse()/envelope() from platform/envelope.ts. " +
      "If a surface genuinely answers a non-vxture protocol, add it to EXCLUSIONS with a reason.",
  );
  process.exit(strict ? 1 : 0);
}

console.log(
  `[error-envelope] OK - ${codesSeen} codes checked, no bare-string refusals. ` +
    `${EXCLUSIONS.length} documented exclusion(s).`,
);
