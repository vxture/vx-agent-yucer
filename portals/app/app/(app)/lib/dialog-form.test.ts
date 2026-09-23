import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The DS DialogForm falls back to English ("Save" / "Cancel" / "Working…").
// Every dialog goes through components/dialog-form.tsx, which supplies the
// product's words - a direct DS import is how a "Cancel" button shipped in a
// Chinese dialog (2026-09-24).

const ROOT = join(process.cwd(), "app", "(app)");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

for (const [name, wrapper] of [
  ["DialogForm", "components/dialog-form.tsx"],
  ["ConfirmDestructive", "components/confirm-destructive.tsx"],
] as const) test(`no dialog imports the DS ${name} directly`, () => {
  const offenders = walk(ROOT)
    .filter((p) => !p.endsWith(wrapper))
    // EVERY import from the DS, not the first: a file with two import
    // statements passed the first version of this guard (checked by
    // sabotage - a second line importing DialogForm went unseen).
    .filter((p) =>
      [...readFileSync(p, "utf8").matchAll(/import \{([^}]*)\} from "@vxture\/design-ui"/gs)].some((m) =>
        new RegExp(`\\b${name}\\b`).test(m[1]!),
      ),
    )
    .map((p) => p.slice(ROOT.length + 1));
  assert.deepEqual(offenders, [], `import ${name} from ${wrapper} instead:\n  ${offenders.join("\n  ")}`);
});
