import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// EVERY DOMAIN VERB MUST HAVE A NON-TEST CALLER.
//
// This repo has now shipped the same defect four times: a service function with
// a full gate, a rule function, a store port and green tests, that no interface
// ever calls. The workplan records the lesson twice and it happened again
// anyway, because "did I wire it" is a thing you have to remember to ask.
//
// The fourth one was the worst and explains why this is a test rather than a
// checklist item: `submitForecast` had zero callers and not even a comment
// saying so. Nothing failed. `forecast_snapshot` simply stayed empty, the
// trajectory rendered its empty state forever, and `attainment()` had no
// numerator - while the demo seed filled the table directly, so the screens
// looked alive. A defect that hides behind seed data is not going to be caught
// by looking.
//
// The allowlist below is the point of the whole file: an unwired verb is
// allowed, but it has to be NAMED, with the reason and the batch that removes
// it. That turns "we forgot" into "we decided, and here is when it ends".
//
// WHAT THIS DOES NOT PROVE, stated so nobody reads more into a green run than
// is there: it proves something outside the domain CALLS the verb, not that a
// person can REACH it. A server action nothing renders would still pass. It was
// verified against the real defect - removing the wiring from
// `forecast-action.ts` turns it red - and all four historical cases had no
// action file at all, so it catches the shape that actually recurs. Chasing
// reachability all the way to a rendered control is a different, larger test;
// this one is the cheap guard that would have caught every instance so far.

const HERE = dirname(fileURLToPath(import.meta.url));
const DOMAINS = join(HERE, "..");
const APP = join(DOMAINS, "..");

/** Deliberately unwired, with the batch item that removes each one. */
const KNOWN_UNWIRED: Record<string, string> = {
  // Attribution is computed on creation by the conversion path; the preview is
  // for a UI that shows "this lead will be attributed to X" before converting,
  // and that surface is not designed yet.
  "signal.previewAttribution": "no surface designed - see ADR-016",
};

/** Helpers that live in service.ts but are not domain verbs. */
const NOT_VERBS = new Set(["denied", "ok", "fail"]);

/**
 * Source with comments removed.
 *
 * The first version of this guard matched a bare word and passed immediately:
 * `delivery-table.tsx` contains the sentence "neither is wired" next to the two
 * verb names, so the comment EXPLAINING that they are unwired counted as
 * wiring them. A guard a comment can satisfy is not a guard - it would have
 * gone green on exactly the four defects it exists to catch.
 */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/([^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== ".next") walk(p, out);
    } else if (
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx") &&
      !name.endsWith(".db.test.ts")
    ) {
      out.push(p);
    }
  }
  return out;
}

test("every exported domain verb has a caller outside its own domain", () => {
  const sources = walk(APP);
  const unwired: string[] = [];

  for (const domain of readdirSync(DOMAINS)) {
    const service = join(DOMAINS, domain, "service.ts");
    let src: string;
    try {
      src = readFileSync(service, "utf8");
    } catch {
      continue; // not every folder is a domain with a service
    }

    const verbs = [...src.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]!);
    for (const verb of verbs) {
      if (NOT_VERBS.has(verb)) continue;
      const key = `${domain}.${verb}`;

      // A caller OUTSIDE this domain's own folder. Inside it, a verb calling a
      // verb proves nothing about whether a person can reach either.
      const called = sources.some(
        (f) =>
          !f.startsWith(join(DOMAINS, domain)) &&
          new RegExp(`\\b${verb}\\b`).test(code(f)),
      );

      if (called) {
        assert.ok(
          !(key in KNOWN_UNWIRED),
          `${key} is wired now - remove it from KNOWN_UNWIRED (${KNOWN_UNWIRED[key]})`,
        );
        continue;
      }
      if (key in KNOWN_UNWIRED) continue;
      unwired.push(key);
    }
  }

  assert.deepEqual(
    unwired,
    [],
    `these domain verbs have no caller outside their own domain - wire them, or ` +
      `add them to KNOWN_UNWIRED with the batch item that will: ${unwired.join(", ")}`,
  );
});
