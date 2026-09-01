import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// No surface may acquire an unscoped store.
//
// THE FAILURE THIS EXISTS FOR is the quietest one this product can have. The
// three owner-bearing stores are wrapped on the session, so a page that reads
// `session.stores.pipeline()` is narrowed to what its reader may see. A page
// that reaches for `getPipelineStore()` instead gets the raw one - and nothing
// fails, nothing logs, and the screen simply shows rows the member was not
// meant to see. A confidentiality feature that leaks is worse than none,
// because it is believed.
//
// The compiler cannot catch it: both return the same type. So this does.
//
// NOT A BAN ON THE GETTERS THEMSELVES - they are how the registry hands out a
// store, the scope resolver needs the unscoped ones by definition, and every
// domain-internal caller uses them. The rule is narrower and is about one
// directory: under (app), the surface layer, the stores you may reach are the
// ones on the session.

const APP = join(process.cwd(), "app", "(app)");

const SCOPED_GETTERS = ["getPipelineStore", "getAccountStore", "getSignalStore"];

/**
 * Files allowed to reach for an unscoped store, each with the reason.
 *
 * `resolve-scope.ts` is the one that cannot be otherwise: it COMPUTES the
 * scope, and running that computation against an already-scoped store would ask
 * the answer to depend on itself. The fixed point of that is "sees nothing".
 *
 * `session.ts` is where the wrapping happens, so it holds both halves by
 * necessity.
 */
const ALLOWED = new Set(["lib/resolve-scope.ts", "lib/session.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Comments are stripped, so a paragraph naming a getter is not a use of one. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/([^:])\/\/.*$/gm, "$1");
}

test("no surface under (app) acquires an unscoped store", () => {
  const offenders: string[] = [];
  for (const file of walk(APP)) {
    const rel = file.slice(APP.length + 1);
    if (ALLOWED.has(rel)) continue;
    const body = code(readFileSync(file, "utf8"));
    for (const getter of SCOPED_GETTERS) {
      if (new RegExp(`\\b${getter}\\s*\\(`).test(body)) {
        offenders.push(`${rel} calls ${getter}() - use session.stores instead`);
      }
    }
  }
  assert.deepEqual(offenders.sort(), []);
});

test("the scan actually reads files - guards against a vacuous pass", () => {
  // A walk that found nothing would make the check above pass by looking at
  // no code at all, which is the shape of green that means nothing was checked.
  const files = walk(APP);
  assert.ok(files.length > 40, `expected the surface to have many files, found ${files.length}`);
  assert.ok(
    files.some((f) => f.endsWith("page.tsx")),
    "expected to have walked at least one page",
  );
});

test("every allowlisted file exists and still reaches for one", () => {
  // An allowlist entry that no longer applies is a hole nobody notices: the
  // file could stop needing the exemption, or be renamed, and the list would go
  // on excusing something that is not there. Same rot the unwired allowlist
  // guards against.
  for (const rel of ALLOWED) {
    const body = code(readFileSync(join(APP, rel), "utf8"));
    assert.ok(
      SCOPED_GETTERS.some((g) => new RegExp(`\\b${g}\\s*\\(`).test(body)),
      `${rel} is allowlisted but no longer acquires an unscoped store - remove the entry`,
    );
  }
});
