import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Business header size overrides and shared public-frame regression checks.

const C = join(import.meta.dirname, "..", "components");
const read = (f: string) => readFileSync(join(C, f), "utf8");

test("every header that draws these DS parts applies the shared size overrides", () => {
  const need: ReadonlyArray<readonly [string, string[]]> = [
    ["app-shell.tsx", ["PRODUCT_TITLE_ON_LADDER", "AVATAR_ON_LADDER"]],
    ["header-tools.tsx", ["TOOLBOX_ON_LADDER"]],
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

test("the business header retains its product title override", () => {
  const shell = read("app-shell.tsx");
  assert.match(shell, /className=\{PRODUCT_TITLE_ON_LADDER\}/);
});

// Regression: fixing public chrome must reach every session/access state.
test("all public states share one header, footer and backdrop", () => {
  for (const name of ["login-home.tsx", "gate-frame.tsx"]) {
    const src = read(name);
    assert.match(src, /<PublicPageFrame>/);
    assert.doesNotMatch(src, /<(?:header|footer|main)\b/);
  }
  for (const name of ["no-roles.tsx", "no-subscription.tsx", "signed-out.tsx"]) {
    assert.match(read(name), /<GateFrame\b/);
  }
  const frame = read("public-page-frame.tsx");
  for (const element of ["header", "main", "footer"]) {
    assert.equal((frame.match(new RegExp(`<${element}\\b`, "g")) ?? []).length, 1);
  }
  assert.match(frame, /<GateAmbience/);
  assert.match(frame, /<PublicHeaderTools/);
  assert.match(read("sign-in.tsx"), /<LoginHome href=\{href\} resume=\{resume\}/);
});
