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
  // (empty since 2026-08-29 - every exported domain verb has a caller. A name
  // added here must say why it exists and which batch removes it.)
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
  // SIX GUARDS THAT ARE A SECOND ANSWER TO ONE QUESTION.
  //
  // Each refuses a patch touching a frozen column, in code, with a sentence -
  // which is exactly what `column-locks.assertWritable(table, patch)` already
  // does, generically, against the mirror of the DDL grants, and which every
  // prisma adapter already calls before every write. None of the columns these
  // name appears in WRITABLE_COLUMNS, so assertWritable already refuses all of
  // them today.
  //
  // They are therefore not a missing defence. They are a duplicate one, and
  // ADR-023 is about precisely this shape. What they have that assertWritable
  // does not is the REASON - "rewriting evidence is fabricating it" says more
  // than "this column has no UPDATE grant" - so they are kept, named, and
  // scheduled: the batch that folds their sentences into the column-lock
  // mirror deletes them. Deleting them before that would throw the knowledge
  // away to remove the duplication.
  "pipeline/attribution.assertNoFrozenOpportunityKeys":
    "duplicates assertWritable for opportunity.account_id/campaign_id; kept for its sentence until the reasons move into the column-lock mirror",
  "pipeline/attribution.assertNoFrozenLeadKeys":
    "duplicates assertWritable for lead.signal_id/campaign_id; same batch as above",
  "signal/scoring.assertEvidenceUnchanged":
    "duplicates assertWritable for the signal evidence columns; same batch",
  "copilot/action.assertProposalUnchanged":
    "duplicates assertWritable for agent_action.payload/rationale/confidence; same batch",
  "delivery/revenue.assertSequenceUnchanged":
    "duplicates assertWritable for revenue_schedule.sequence; same batch",
  "planning/target.assertScopeUnchanged":
    "duplicates assertWritable for the sales_target identity tuple; same batch",

  // ---------------------------------------------------------------------
  // ONE PLAN FOR A STATE NOTHING CAN REACH YET.
  //
  // `planExpiry` left this list on 2026-08-31 - the sweep it was waiting for
  // now exists, and the guard is what noticed, refusing to let a stale entry
  // sit here claiming the path was still missing.
  //
  // `planFailure` records that an execution ATTEMPT failed, and the previous
  // wording here was imprecise: `execute` does exist. What does not exist is
  // anything that CARRIES OUT a proposal's payload - `execute` records the
  // transition and stops - so there is no attempt that can fail. The rule is
  // written, the path is not, and saying which is which is the point of this
  // list.
  "copilot/action.planFailure":
    "execute() records the transition but nothing carries out a payload, so no attempt can fail; wired by the batch that performs one",

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
  "account/commitment.daysSinceLastContact":
    "pins the quiet-days definition the judgement rules restate inline; unify or delete at the next review",
  "catalog/pricing.reconciles":
    "pins header-matches-lines; the quote page shows the lines and never asks the question",

  // ---------------------------------------------------------------------
  // TWO THAT SHOULD PROBABLY GO.
  "copilot/action.isTerminalStatus":
    "TERMINAL_ACTION_STATUSES is used directly by callers; this wrapper adds nothing - delete unless a caller appears",
  "copilot/capability.capabilityLabel":
    "its own docstring says the labels live in the UI message table, which is where they are; delete unless a caller appears",
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
