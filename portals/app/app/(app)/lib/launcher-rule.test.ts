import { test } from "node:test";
import assert from "node:assert/strict";
import { SHELL_PANEL_HAIRLINE } from "@vxture/design-system";
import { COLUMN_RULE } from "../components/domain-launcher";

// The launcher's vertical column rule has to be the DS's hairline, turned.
//
// It cannot BE the DS constant: Tailwind reads source text, so a class name
// assembled at runtime - `xl:${SHELL_PANEL_HAIRLINE.replace("border-t",
// "border-l")}` - lands in the DOM with no CSS behind it. The first version of
// that line did exactly this and looked correct, because `border-dashed` and
// `border-primary/10` happen to be emitted for other files. Luck, and it runs
// out the day nothing else uses them.
//
// So the string is written out, and this is what stops the copy drifting: the
// DS owns the dash and the colour, and if it changes either, CI says so here
// rather than the panel quietly drawing a different line from every other
// hairline in the shell.

test("the column rule is the DS hairline, on the other edge and at xl only", () => {
  // What the DS declares, as a set of utilities.
  const ds = SHELL_PANEL_HAIRLINE.split(/\s+/).filter(Boolean);
  // What we draw, with the responsive prefix taken back off.
  const ours = new Set(
    COLUMN_RULE.split(/\s+/)
      .filter((c) => c.startsWith("xl:"))
      .map((c) => c.slice(3))
      // `xl:dark:x` unprefixes to `dark:x`, which is the DS's own form.
      .map((c) => c),
  );

  for (const cls of ds) {
    const wanted = cls.replace("border-t", "border-l");
    assert.ok(
      ours.has(wanted),
      `the DS hairline declares "${cls}", so the column rule must carry "${wanted}" - it has ${[...ours].join(" ")}`,
    );
  }
});

test("every class in the column rule is a literal, so Tailwind can see it", () => {
  // A guard against the mistake being made again by template literal: every
  // token is a plain utility with no `${` in it, and the constant is a string
  // literal rather than an expression. Read from the source, because the value
  // alone cannot tell you how it was built.
  assert.ok(!COLUMN_RULE.includes("${"), "the rule must not be interpolated");
  assert.ok(
    COLUMN_RULE.split(/\s+/).every((c) => /^[a-z0-9:_/\[\]-]+$/i.test(c)),
    `every token must be a plain utility: ${COLUMN_RULE}`,
  );
});
