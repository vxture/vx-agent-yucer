import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The signed-in shell and the four gate screens (sign-in, signed-out, no
// subscription, no roles) are two headers over the same DS parts, and design-
// system 15 left three of those parts on the old sizes (TD-037). The owner asked
// for the same sizes on both (2026-10-08). The size-only overrides live in ONE
// module, and this keeps both headers on it: a header that writes its own
// selector string, or forgets one, drifts from the other without any test seeing.

const C = join(import.meta.dirname, "..", "components");
const read = (f: string) => readFileSync(join(C, f), "utf8");

test("every header that draws these DS parts applies the shared size overrides", () => {
  const need: ReadonlyArray<readonly [string, string[]]> = [
    ["app-shell.tsx", ["PRODUCT_TITLE_ON_LADDER", "AVATAR_ON_LADDER"]],
    ["header-tools.tsx", ["TOOLBOX_ON_LADDER"]],
    ["gate-frame.tsx", ["PRODUCT_TITLE_ON_LADDER", "TOOLBOX_ON_LADDER"]],
  ];
  for (const [file, names] of need) {
    const src = read(file);
    for (const n of names) {
      assert.ok(src.includes(`${n}`) && /header-ladder/.test(src), `${file} does not use ${n} from header-ladder`);
    }
  }
});

test("no header writes its own copy of an override selector", () => {
  for (const file of ["app-shell.tsx", "header-tools.tsx", "gate-frame.tsx"]) {
    const src = read(file);
    assert.ok(!/\[&_span\.text-xl\]/.test(src), `${file} has a hand-written product-title selector`);
    assert.ok(!/shell-toolbox-\]/.test(src), `${file} has a hand-written toolbox selector`);
    assert.ok(!/\[&_\.size-icon-xl\]/.test(src), `${file} has a hand-written avatar selector`);
  }
});

test("each ShellProductTitle and ShellHeaderTools in a header is given its override", () => {
  const gate = read("gate-frame.tsx");
  assert.match(gate, /<ShellProductTitle\s+className=\{PRODUCT_TITLE_ON_LADDER\}/);
  assert.match(gate, /<ShellHeaderTools\s+className=\{TOOLBOX_ON_LADDER\}/);
  const shell = read("app-shell.tsx");
  assert.match(shell, /className=\{PRODUCT_TITLE_ON_LADDER\}/);
});
