import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The fold arrow on a cascading table row - owner, 2026-09-30. 组织架构 is the
// reference: a bare 24px button, a muted glyph, no background at rest, none on
// hover. 权限视图 and the org unit list wore the DS ghost Button instead
// (32px, tiled on hover, tinted when open), so every tree looked different.
//
// The arrow is ONE component (components/tree-toggle.tsx). This scan is what
// keeps it one: a tree that draws its own chevron button again fails here,
// instead of drifting back a screen at a time.

const COMPONENTS = join(import.meta.dirname, "..", "components");
const read = (f: string) => readFileSync(join(COMPONENTS, f), "utf8");

const TREES = ["org-panel.tsx", "permission-tree.tsx", "member-org-view.tsx"];

test("every cascading table folds with the shared arrow, not a hand-drawn chevron", () => {
  for (const file of TREES) {
    const src = read(file);
    assert.match(src, /from "\.\/tree-toggle"/, `${file} does not import the shared TreeToggle`);
    // The row arrows' old form: a chevron at the DS "sm" size inside a Button.
    // (A SECTION header's fold button is a different control and is not this.)
    assert.ok(!/"chevron-right"\}\s+size="sm"/.test(src), `${file} draws its own row chevron at the DS sm size`);
    assert.ok(
      !/<Button[^>]*size="icon-(sm|md)"[^>]*aria-expanded/.test(src),
      `${file} folds with a DS icon Button (tiles on hover, tints when open)`,
    );
  }
});

test("the shared arrow is a bare button with no background at rest or on hover", () => {
  const src = read("tree-toggle.tsx");
  assert.ok(!/<Button\b/.test(src), "the arrow must not be the DS Button");
  assert.match(src, /text-muted-foreground hover:text-foreground/);
  assert.ok(!/(^|[\s"`:])(bg-|hover:bg-|aria-expanded:bg-)/.test(src.replace(/\/\/.*$/gm, "")), "no background utility on the arrow");
  assert.match(src, /size-6/);
  assert.match(src, /size="xs"/);
});
