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
  // incr/0025, ADR-024 batch B. The column, the grant, the cycle guard and the
  // two gates are all here and tested; what does not exist yet is anywhere to
  // click. Batch 3 builds the customer detail page, and the parent selector
  // goes on it - that batch removes this line.
  //
  // NAMED RATHER THAN SKIPPED deliberately: this is the exact shape that
  // shipped five times before this test existed, and the difference between
  // that and this is that somebody wrote down when it ends.
  "account.setAccountParent": "no surface until batch 3's customer detail page",
  // `copilot.execute` LEFT THIS LIST on 2026-09-01. The ruling it was waiting
  // for arrived - "采纳当然要真实发生业务动作" - and adjudicateProposals now
  // calls it for every accepted id, so accepting advances the deal. Its
  // companion entry under KNOWN_TEST_ONLY (`planFailure`) went at the same
  // time and for the same reason: once a payload is carried out, an attempt
  // can fail.
};

/** Helpers that live in service.ts but are not domain verbs. */
const NOT_VERBS = new Set(["denied", "ok", "fail"]);

/**
 * Exported rule functions that only the tests call, with the reason.
 *
 * SEPARATE FROM KNOWN_UNWIRED because the bar is different. A domain verb has
 * to be reached from OUTSIDE its domain - it is the domain's public act. A rule
 * function only has to be reached by something that is not a test: a helper its
 * own file uses is live code, and demanding a cross-file caller for it would
 * push files to stop exporting the pieces their tests need.
 */
const KNOWN_TEST_ONLY: Record<string, string> = {
  // ---------------------------------------------------------------------
  // THE SIX DUPLICATE GUARDS ARE GONE (2026-08-31). Each refused a patch
  // touching a frozen column, which `column-locks.assertWritable` already did
  // generically, on every write, in every adapter. They were kept one batch for
  // the one thing they had that it did not - the REASON - and deleted once
  // those sentences moved into FROZEN_COLUMN_REASON, where three tests now
  // prove each one names a real column, a frozen one, and reaches the refusal.

  // ---------------------------------------------------------------------
  // ONE PLAN FOR A STATE NOTHING CAN REACH YET.
  //
  // `planExpiry` left this list on 2026-08-31 - the sweep it was waiting for
  // now exists, and the guard is what noticed, refusing to let a stale entry
  // sit here claiming the path was still missing.
  //
  // `planFailure` left this list on 2026-09-01, with `copilot.execute`. The
  // path it was waiting for exists: executor.ts carries out a payload, so an
  // attempt can now fail, and execute() records that instead of leaving the
  // row at `accepted` looking like it is still waiting for somebody.

  // ---------------------------------------------------------------------
  // SIX PURE HELPERS whose only real caller would be inside their own file,
  // and which are exported so their own tests can pin the definition.
  //
  // The bar this guard sets is deliberately low for them - "reached by
  // something that is not a test" - and they do not clear even that. They are
  // named rather than deleted because each pins a definition the product
  // argues about elsewhere (what a total excludes, what counts as one external
  // record, when a plan stops attracting work), and an un-pinned definition is
  // how two answers appear later. Reviewed 2026-08-31; the batch that finds a
  // real caller removes the entry, and a name still here at the next review
  // with no caller should be deleted.
  "pipeline/forecast.openPipelineTotal":
    "pins that the open total excludes `closed`; no caller sums the three categories yet",
  "pipeline/forecast.isZero":
    "pins zero-comparison without float ambiguity; no caller needs it yet",
  "signal/scoring.dedupKey":
    "pins the dedup identity that uidx_signal_ws_source enforces in the database; no code path composes it",
  "strategy/lifecycle.planAcceptsNewWork":
    "pins which plan statuses attract downstream work; no caller gates on it yet",
  // `daysSinceLastContact` left on 2026-09-01, by the "unify" branch of what
  // its entry offered. It took an ARRAY of dates, which is why it never found a
  // caller: the store answers `lastContactAt` with a single date (a MAX in the
  // Prisma adapter), so every reader holds one Date or null. Reshaped to what
  // callers actually hold, it took over the two places that had restated it -
  // the judgement rules and the field evidence panel.
  // `pipeline/forecast.accuracy` LEFT THIS LIST on 2026-09-01, and it was the
  // entry that cost the most to leave sitting: `forecast_snapshot` has UPDATE
  // revoked FOR THIS FUNCTION, so the product had been paying for an
  // append-only table since batch 1 while nothing asked the question it exists
  // to answer - and the trajectory section's own description promised the
  // number on screen the whole time. `forecastAccuracy` in pipeline/service.ts
  // computes it and the pipeline page renders it.
  "catalog/pricing.reconciles":
    "pins header-matches-lines; the quote page shows the lines and never asks the question",

  // ---------------------------------------------------------------------
  // THE TWO "SHOULD PROBABLY GO" ENTRIES WENT ON 2026-09-01, in opposite
  // directions - and looking at each was the only way to tell which.
  //
  // `isTerminalStatus` was deleted, along with TERMINAL_ACTION_STATUSES. Its
  // entry claimed the constant "is used directly by callers"; nothing used
  // either. Every rule gates on the positive side, so the set of states nothing
  // happens from is a concept the code never asks about.
  //
  // `capabilityLabel` was WIRED instead. The account page was hand-rolling a
  // weaker version - indexing the label map directly, skipping `isCapability` -
  // so the property its docstring exists to state was not applied at the one
  // place it mattered. "No caller" was the symptom; the cause was a caller that
  // had reimplemented it.
};

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
  return (
    readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ")
      .replace(/([^:])\/\/.*$/gm, "$1")
      // AND STRING LITERALS, for the same reason as the comments and found the
      // same way. `copilot.execute` was reported as wired by three matches,
      // none of which is a call:
      //
      //   "campaign.execute"                          <- a feature key
      //   "...proposals may execute without..."       <- a line of prompt prose
      //
      // A word inside a string is not a caller any more than a word inside a
      // comment is, and a verb with a short common name collects them. The
      // first version of this guard already learned that lesson about comments
      // and stopped there.
      //
      // NOT tightened to `name\s*\(` instead, which was the obvious fix and is
      // wrong: `cachedFeed = cache(judgementFeed)` wires a verb by REFERENCE,
      // and requiring a call reported judgementFeed - the most-read function in
      // the product - as unwired. Measured both ways before choosing.
      .replace(/"(?:[^"\\\n]|\\.)*"/g, " ")
      .replace(/'(?:[^'\\\n]|\\.)*'/g, " ")
      .replace(/`(?:[^`\\]|\\.)*`/g, " ")
  );
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

// THE HALF THIS GUARD COULD NOT SEE, and the gap is documented rather than
// inferred. On 2026-08-30 `assessRenewal` shipped with an `already_renewed`
// branch that no caller could reach - the flag was only ever supplied by hand
// in a test - and CI was green, correctly, because this file only ever read
// `service.ts`. The note in that batch said so in as many words:
//
//   "wired.test.ts covers domain verbs in service.ts; rule functions in lib/
//    are not on its surface - so CI being green is right, and it also means
//    the guard did not watch that half of the chain."
//
// Measuring the half it could not see found EIGHTEEN exported rule functions
// that only their own tests call, including `planSuggestedCategory`, written
// one day earlier with a docstring describing how the apply path uses it while
// the apply path called something else entirely. The same defect the file
// above exists to catch, one directory down.
//
// A rule nothing calls is not merely unused. It is a rule that was REASONED
// ABOUT and then not applied - the frozen-key guards in this repo are the sharp
// case, since their whole purpose is to reject a bad patch in the code rather
// than at the driver as `permission denied`, and an uncalled one leaves only
// the driver.
test("every exported rule function is reached by something that is not a test", () => {
  const sources = walk(APP);
  const orphans: string[] = [];

  for (const domain of readdirSync(DOMAINS)) {
    const lib = join(DOMAINS, domain, "lib");
    let entries: string[];
    try {
      entries = readdirSync(lib);
    } catch {
      continue; // not every folder is a domain with rules
    }

    for (const name of entries) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      const file = join(lib, name);
      const src = code(file);

      for (const m of src.matchAll(/^export function (\w+)/gm)) {
        const fn = m[1]!;
        const key = `${domain}/${name.replace(/\.ts$/, "")}.${fn}`;
        const used = sources.some((f) => {
          const body = code(f);
          if (f !== file) return new RegExp(`\\b${fn}\\b`).test(body);
          // Its own file counts, but the export line itself does not - that is
          // the declaration, not a use.
          return new RegExp(`\\b${fn}\\b`).test(
            body.replace(new RegExp(`export function ${fn}\\b`, "g"), " "),
          );
        });

        if (used) {
          assert.ok(
            !(key in KNOWN_TEST_ONLY),
            `${key} has a real caller now - remove it from KNOWN_TEST_ONLY (${KNOWN_TEST_ONLY[key]})`,
          );
          continue;
        }
        if (key in KNOWN_TEST_ONLY) continue;
        orphans.push(key);
      }
    }
  }

  assert.deepEqual(
    orphans,
    [],
    `these rule functions are only ever called by their own tests - call them, ` +
      `delete them, or name them in KNOWN_TEST_ONLY with the reason: ${orphans.join(", ")}`,
  );
});

// A LIST THAT CAN ROT IS NOT A DECISION, IT IS A NOTE.
//
// Both allowlists above say what they are for: an unwired thing is allowed, but
// it has to be NAMED with a reason. That only holds while the names are real.
// Deleting a function leaves its entry behind, and nothing above notices - the
// two tests only walk functions that EXIST, so a name for one that does not is
// invisible to them. Six such entries were created and removed within a day on
// 2026-08-31; the seventh would have sat there claiming a decision about code
// nobody could find.
test("every allowlisted name still refers to something that exists", () => {
  const stale: string[] = [];

  for (const key of Object.keys(KNOWN_UNWIRED)) {
    const [domain, verb] = key.split(".");
    let src = "";
    try {
      src = readFileSync(join(DOMAINS, domain!, "service.ts"), "utf8");
    } catch {
      stale.push(`${key} (no such domain service)`);
      continue;
    }
    if (!new RegExp(`^export async function ${verb}\\b`, "m").test(src)) stale.push(key);
  }

  for (const key of Object.keys(KNOWN_TEST_ONLY)) {
    // `domain/file.fn`
    const slash = key.indexOf("/");
    const dot = key.lastIndexOf(".");
    const domain = key.slice(0, slash);
    const file = key.slice(slash + 1, dot);
    const fn = key.slice(dot + 1);
    let src = "";
    try {
      src = readFileSync(join(DOMAINS, domain, "lib", `${file}.ts`), "utf8");
    } catch {
      stale.push(`${key} (no such rule file)`);
      continue;
    }
    if (!new RegExp(`^export function ${fn}\\b`, "m").test(src)) stale.push(key);
  }

  assert.deepEqual(
    stale,
    [],
    `these allowlist entries name something that no longer exists - delete them, ` +
      `or the list is a record of decisions about code nobody can find: ${stale.join(", ")}`,
  );
});
