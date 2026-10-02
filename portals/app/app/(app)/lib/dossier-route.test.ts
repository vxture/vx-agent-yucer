import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isDossierRoute } from "./sidebar-slot";

// /account/<x> and /pipeline/<x> are an object's detail page, where the PAGE
// renders the board and centre panes itself. Any other static child of those
// two folders is not an id: if it is not named as a sibling, the shell hands
// it no centre pane and the right deck floats out of the frame (the new-customer
// page, 2026-10-02). This reads the folders, so a new static route cannot be
// added without being named.

const APP = join(import.meta.dirname, "..");

for (const parent of ["account", "pipeline"]) {
  test(`every static page under /${parent} is a sibling, not a dossier`, () => {
    const dir = join(APP, parent);
    for (const name of readdirSync(dir)) {
      if (!statSync(join(dir, name)).isDirectory()) continue;
      if (name.startsWith("[") || name.startsWith("(") || name.startsWith("@")) continue;
      if (!existsSync(join(dir, name, "page.tsx"))) continue;
      assert.equal(isDossierRoute([parent, name]), false, `/${parent}/${name} is treated as a detail page`);
    }
  });

  test(`/${parent}/<id> is still a dossier, and a deeper route is not`, () => {
    assert.equal(isDossierRoute([parent, "some-id"]), true);
    assert.equal(isDossierRoute([parent, "some-id", "lines"]), false);
  });
}
