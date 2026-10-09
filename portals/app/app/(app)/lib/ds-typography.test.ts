import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// design-tokens 4.0.0 (2026-10-04) renamed and deleted typography roles and the
// two smallest control sizes. A removed Tailwind class does NOT fail the build:
// it compiles to nothing, and the text silently falls back to the inherited size.
// Type-checking cannot see it, unit tests cannot see it, and 142 files used the
// old names. This scan is the only thing that does.
//
// What exists now: body, body-small, label, label-small, label-micro, code,
// heading-1/2/3, display-xs..lg, overline. Anything else under text-* from the
// old scale is dead.

const APP = join(import.meta.dirname, "..", "..");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(tsx|ts|css)$/.test(name) && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

// The old scale, and its replacement - so a failure says what to write instead.
const DEAD: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?<![\w-])text-body-(xs|sm|md|lg|xl)(?![\w-])/, "text-body / text-body-small"],
  [/(?<![\w-])text-label-(xs|sm|md|lg|xl)(?![\w-])/, "text-label / text-label-small / text-label-micro"],
  [/(?<![\w-])text-title-[a-z]+(?![\w-])/, "text-heading-1/2/3 (the title family is gone)"],
  [/(?<![\w-])text-code-(sm|md|lg)(?![\w-])/, "text-code"],
  [/(?<![\w-])text-heading-4(?![\w-])/, "text-heading-3 (there is no level 4)"],
  [/(?<![\w])(?:size|h|min-h|w|min-w)-control-(?:3xs|2xs)(?![\w-])/, "control-xs/sm (the two smallest sizes were removed)"],
];

test("no source file uses a typography class or control size that the DS removed", () => {
  const found: string[] = [];
  for (const file of sources(APP)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const [re, use] of DEAD) {
        const m = line.match(re);
        if (m) found.push(`${file.replace(APP, "")}:${i + 1}  ${m[0]}  ->  ${use}`);
      }
    });
  }
  assert.deepEqual(found, [], `these classes compile to nothing since design-tokens 4.0.0:\n${found.join("\n")}`);
});

test("the scan can fail: it catches each dead class it claims to", () => {
  const samples = ["text-body-sm", "text-body-md", "text-label-md", "text-title-lg", "text-code-md", "text-heading-4", "size-control-2xs"];
  for (const s of samples) {
    assert.ok(DEAD.some(([re]) => re.test(`<p className="${s} x">`)), `${s} is not caught`);
  }
  for (const ok of ["text-body", "text-body-small", "text-label", "text-label-small", "text-label-micro", "text-heading-3", "size-control-sm"]) {
    assert.ok(!DEAD.some(([re]) => re.test(`<p className="${ok} x">`)), `${ok} is wrongly flagged`);
  }
});
