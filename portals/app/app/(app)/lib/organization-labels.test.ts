import { test } from "node:test";
import assert from "node:assert/strict";
import { organizationLabels } from "./organization-labels";

test("header prefers the short name while the panel keeps the full name", () => {
  assert.deepEqual(organizationLabels("Acme Holdings Limited", "Acme", "Unknown"), {
    trigger: "Acme", panel: "Acme Holdings Limited",
  });
});

test("old tokens and blank short names fall back to the full name", () => {
  for (const short of [null, "", "   "]) {
    assert.deepEqual(organizationLabels("Acme Holdings Limited", short, "Unknown"), {
      trigger: "Acme Holdings Limited", panel: "Acme Holdings Limited",
    });
  }
});

test("partial identity remains readable without an invented short name", () => {
  assert.deepEqual(organizationLabels(null, " Acme ", "Unknown"), { trigger: "Acme", panel: "Acme" });
  assert.deepEqual(organizationLabels(" ", null, "Unknown"), { trigger: "Unknown", panel: "Unknown" });
});
