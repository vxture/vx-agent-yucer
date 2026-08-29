import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// One module, one import statement.
//
// Sonar S3863 has caught this four times in review - pipeline/page, then
// account/[id]/page, then delivery/page, then layout - each time a PR adding
// an import without noticing the module was already imported higher up. Four
// recurrences is a guard gap, not a coincidence: nothing local ever asked.
// This is that ask, so the finding lands at commit time instead of as a bot
// comment after push.

const APP = join(process.cwd(), "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test("no file imports the same module twice", () => {
  const offenders: string[] = [];
  for (const f of walk(APP).filter((p) => /\.tsx?$/.test(p))) {
    const text = readFileSync(f, "utf8");
    const seen = new Map<string, number>();
    for (const m of text.matchAll(/^import[^;]*?from\s+"([^"]+)";/gms)) {
      seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
    }
    for (const [mod, n] of seen) {
      if (n > 1) offenders.push(`${f.slice(APP.length + 1)} imports "${mod}" ${n} times`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `merge these into one import statement:\n  ${offenders.join("\n  ")}`,
  );
});
