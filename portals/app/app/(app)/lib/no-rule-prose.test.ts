import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// TD-010: the rule layer's sentences are not product copy.
//
// A RuleResult violation carries a `message` written for the rule layer's own
// reader, in English, in a file that must be ASCII-only. It therefore CANNOT be
// product copy in a Chinese product - not "should not", cannot. The code is
// what crosses the boundary; the sentence lives in a message dictionary.
//
// This kept coming back because nothing asked. The first sighting was one
// tooltip on /delivery; the second was a rule sentence rendered inside a
// Chinese page. When this guard was first written it found TWENTY-ONE sites
// across eighteen files - every page's load-failure path, plus five server
// actions returning the sentence as their error string. The debt entry said
// "recurred twice" because nobody had counted.
//
// What a denied page load actually rendered: `missing permission strategy.read`
// - English, and an internal permission code shown to an end user, on a page
// where every other word is Chinese. The right sentence already existed in
// GATE_ERROR. The page simply did not use it.

const ROOT = join(process.cwd(), "app", "(app)");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

const FILES = walk(ROOT).map((p) => ({ path: p, text: readFileSync(p, "utf8") }));

// `.message` read off anything violation-shaped. Deliberately blunt: a narrower
// pattern would be a pattern someone can walk around by renaming a local.
const LEAK = /\bviolations\b[\s\S]{0,80}?\.message\b|\bv\s*:\s*\{\s*message|\(\s*v\s*\)\s*=>\s*v\.message/;

test("the interface layer was scanned at all", () => {
  assert.ok(FILES.length > 40, `expected many interface files, walked ${FILES.length}`);
  assert.ok(
    FILES.some((f) => f.text.includes("violations")),
    "expected some file to mention violations at all",
  );
});

test("no rule-layer sentence is rendered as product copy", () => {
  const leaks = FILES.filter((f) => LEAK.test(f.text)).map((f) => f.path.slice(ROOT.length + 1));
  assert.deepEqual(
    leaks,
    [],
    `these read a violation's English message and put it on screen. Use the ` +
      `code and a message dictionary instead (TD-010):\n  ${leaks.join("\n  ")}`,
  );
});
