import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Every server action can be walked into.
//
// saveSolution shipped with a gate, a verb, a rule, and dictionary sentences -
// and no binding site. Nobody could reach it from any screen, and no guard
// noticed: gated.test.ts checks that declared actions gate something,
// wired.test.ts checks that domain verbs have callers, and neither asks
// whether a "use server" export is referenced by any interface code at all.
//
// The criterion: REFERENCED AS AN IDENTIFIER outside its own file - a JSX
// binding (={name}), a call (name(...)), or an import naming it. Live actions
// take several shapes here (deckBundle is awaited inside an RSC,
// dismissJudgement is imported and called directly by a client component,
// recordFollowUp is re-exported through deck-data), which is why the shape is
// not pinned to on*={...}.
//
// NOT a bare word match. The first draft used \bname\b and could not fail:
// the dictionary key `saveSolution: "..."` in messages.ts matched it, so the
// exact defect this guard exists for - saveSolution with no binding - was
// invisible to the guard named after it. A dictionary key is a coincidence of
// naming, not a caller.

const UI = join(process.cwd(), "app", "(app)");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const FILES = walk(UI)
  .filter((p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p))
  .map((p) => ({ path: p, text: readFileSync(p, "utf8") }));

const KNOWN_UNBOUND: Record<string, string> = {
  // (empty - a name here must say why it exists and when it gets a caller)
};

test("actions were found at all", () => {
  const total = FILES.filter((f) => f.text.includes('"use server"')).length;
  assert.ok(total > 5, `expected several action files, found ${total}`);
});

test("every server action is referenced outside its own file", () => {
  const dead: string[] = [];
  for (const f of FILES) {
    if (!f.text.includes('"use server"')) continue;
    for (const m of f.text.matchAll(/export async function (\w+)/g)) {
      const name = m[1];
      if (name in KNOWN_UNBOUND) continue;
      const ref = new RegExp(
        `=\\{${name}\\}|\\b${name}\\s*\\(|import\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}`,
      );
      const used = FILES.some((g) => g.path !== f.path && ref.test(g.text));
      if (!used) dead.push(`${name} (${f.path.slice(UI.length + 1)})`);
    }
  }
  assert.deepEqual(
    dead,
    [],
    `these "use server" exports are referenced by nothing - doors nobody can ` +
      `walk into. Bind them, delete them, or name them in KNOWN_UNBOUND with a ` +
      `reason:\n  ${dead.join("\n  ")}`,
  );
});

test("KNOWN_UNBOUND names no action that is now referenced", () => {
  // The half that keeps the list from rotting, same as gated.test.ts.
  const stale = Object.keys(KNOWN_UNBOUND).filter((name) =>
    FILES.some(
      (f) =>
        !f.text.includes(`export async function ${name}`) &&
        new RegExp(`=\\{${name}\\}|\\b${name}\\s*\\(`).test(f.text),
    ),
  );
  assert.deepEqual(stale, [], `these are referenced now - remove them: ${stale.join(", ")}`);
});
